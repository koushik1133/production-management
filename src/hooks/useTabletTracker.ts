import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToRemoteCommands,
  playFindMyAlarmSound,
  stopFindMyAlarmSound,
  sendRemoteCommand,
  resolveTabletSlot,
  TABLET_SPECS,
  requestScreenWakeLock,
  initAudioContext,
  enableBackgroundAudioKeepAlive,
  type TabletSlot,
} from '../lib/findMy';

interface UseTabletTrackerProps {
  currentUserId: string;
  currentRole: string;
  userName?: string;
}

export function useTabletTracker({ currentUserId, currentRole, userName }: UseTabletTrackerProps) {
  const [isRinging, setIsRinging] = useState<boolean>(false);
  
  const mySlot: TabletSlot = resolveTabletSlot(currentUserId, currentRole, userName);
  const mySpec = TABLET_SPECS[mySlot];
  const isManager = currentRole === 'manager';

  const stopAlarm = useCallback(() => {
    setIsRinging(false);
    stopFindMyAlarmSound();
    // Only send STOP_SOUND back if we are a worker tablet (manager stops via FindMyTabletsView)
    if (!isManager) {
      sendRemoteCommand(mySlot, 'STOP_SOUND');
    }
  }, [mySlot, isManager]);

  useEffect(() => {
    if (!currentUserId) return;

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
    stopAlarm,
  };
}

