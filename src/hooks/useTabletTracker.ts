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
} from '../lib/findMy';

interface UseTabletTrackerProps {
  currentUserId: string;
  currentRole: string;
  userName?: string;
}

export function useTabletTracker({ currentUserId, currentRole, userName }: UseTabletTrackerProps) {
  const [isRinging, setIsRinging] = useState<boolean>(false);
  
  const mySlot = resolveTabletSlot(currentUserId, currentRole, userName);
  const mySpec = TABLET_SPECS[mySlot];

  const stopAlarm = useCallback(() => {
    setIsRinging(false);
    stopFindMyAlarmSound();
    sendRemoteCommand(mySpec.canonicalId, 'STOP_SOUND', mySpec.officialName);
  }, [mySpec]);

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

    // Subscribe to remote manager commands strictly isolated to THIS tablet slot
    const unsubscribeCommands = subscribeToRemoteCommands(currentUserId, currentRole, userName || '', (cmd) => {
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
  }, [currentUserId, currentRole, userName, mySlot, mySpec]);

  return {
    showPermissionModal: false,
    approveLocationPermission: () => {},
    triggerPermissionPrompt: () => {},
    isRinging,
    ringingDeviceName: mySpec.officialName,
    stopAlarm,
  };
}
