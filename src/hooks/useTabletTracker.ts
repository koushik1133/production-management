import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToRemoteCommands,
  playFindMyAlarmSound,
  stopFindMyAlarmSound,
  sendRemoteCommand,
  resolveTabletSlot,
  setAssignedTabletSlot,
  TABLET_SPECS,
  requestScreenWakeLock,
  initAudioContext,
  enableBackgroundAudioKeepAlive,
  type TabletSlot,
} from '../lib/findMy';
import {
  registerTabletForPushNotifications,
  getNotificationPermissionState,
  isPushNotificationSupported,
} from '../lib/pushManager';

interface UseTabletTrackerProps {
  currentUserId: string;
  currentRole: string;
  userName?: string;
}

export function useTabletTracker({ currentUserId, currentRole, userName }: UseTabletTrackerProps) {
  const [isRinging, setIsRinging] = useState<boolean>(false);
  const [mySlot, setMySlotState] = useState<TabletSlot>(() =>
    resolveTabletSlot(currentUserId, currentRole, userName)
  );
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(
    getNotificationPermissionState()
  );

  const isManager = currentRole === 'manager' && mySlot === 'manager';
  const mySpec = TABLET_SPECS[mySlot] || TABLET_SPECS.T1;

  // React to slot changes from localStorage / settings modal
  useEffect(() => {
    const handleSlotChange = () => {
      const updated = resolveTabletSlot(currentUserId, currentRole, userName);
      setMySlotState(updated);
    };

    window.addEventListener('tablet_slot_changed', handleSlotChange);
    window.addEventListener('storage', handleSlotChange);
    return () => {
      window.removeEventListener('tablet_slot_changed', handleSlotChange);
      window.removeEventListener('storage', handleSlotChange);
    };
  }, [currentUserId, currentRole, userName]);

  const changeSlot = useCallback(
    async (newSlot: TabletSlot) => {
      setAssignedTabletSlot(newSlot);
      setMySlotState(newSlot);
      if (getNotificationPermissionState() === 'granted') {
        await registerTabletForPushNotifications(newSlot, currentUserId);
      }
    },
    [currentUserId]
  );

  const testAlarm = useCallback(() => {
    setIsRinging(true);
    playFindMyAlarmSound(6);
    setTimeout(() => {
      setIsRinging(false);
    }, 6000);
  }, []);

  const stopAlarm = useCallback(() => {
    setIsRinging(false);
    stopFindMyAlarmSound();
    // Only send STOP_SOUND back if we are a worker tablet (manager stops via FindMyTabletsView)
    if (!isManager) {
      sendRemoteCommand(mySlot, 'STOP_SOUND');
    }
  }, [mySlot, isManager]);

  const enablePushNotifications = useCallback(async () => {
    if (!isPushNotificationSupported()) return false;
    const res = await registerTabletForPushNotifications(mySlot, currentUserId);
    setPushPermission(res.permission);
    return res.success;
  }, [mySlot, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;

    // Auto-register push subscription if permission was already granted in the past
    if (getNotificationPermissionState() === 'granted') {
      registerTabletForPushNotifications(mySlot, currentUserId).catch(() => {});
    }

    // Maintain screen wake lock & background audio keep-alive so tablet display and audio thread stay alive 24/7
    requestScreenWakeLock();
    initAudioContext();
    enableBackgroundAudioKeepAlive();

    const handleWakeState = () => {
      if (document.visibilityState === 'visible') {
        requestScreenWakeLock();
        initAudioContext();
        enableBackgroundAudioKeepAlive();
      }
    };

    document.addEventListener('visibilitychange', handleWakeState);
    window.addEventListener('focus', handleWakeState);
    window.addEventListener('pageshow', handleWakeState);

    // Subscribe to remote commands strictly isolated to THIS tablet slot.
    // Managers get all commands for UI sync ONLY — they NEVER auto-play the alarm on their own device.
    const unsubscribeCommands = subscribeToRemoteCommands(mySlot, isManager, (cmd) => {
      // Managers use FindMyTabletsView for UI — this hook must NOT ring the manager's device
      if (isManager) return;

      if (cmd.command === 'PLAY_SOUND') {
        setIsRinging(true);
        playFindMyAlarmSound(30);
      } else if (cmd.command === 'STOP_SOUND') {
        setIsRinging(false);
        stopFindMyAlarmSound();
      }
    });

    return () => {
      document.removeEventListener('visibilitychange', handleWakeState);
      window.removeEventListener('focus', handleWakeState);
      window.removeEventListener('pageshow', handleWakeState);
      unsubscribeCommands();
      stopFindMyAlarmSound();
    };
  }, [currentUserId, currentRole, userName, mySlot, isManager]);

  return {
    isRinging,
    ringingDeviceName: mySpec.officialName,
    mySlot,
    pushPermission,
    changeSlot,
    testAlarm,
    enablePushNotifications,
    stopAlarm,
  };
}


