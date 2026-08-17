import { useState, useEffect, useRef, useCallback } from 'react';
import {
  upsertTabletLocation,
  subscribeToRemoteCommands,
  playFindMyAlarmSound,
  stopFindMyAlarmSound,
  sendRemoteCommand,
  resolveTabletSlot,
  TABLET_SPECS,
} from '../lib/findMy';

interface UseTabletTrackerProps {
  currentUserId: string;
  currentRole: string;
  userName?: string;
}

export function useTabletTracker({ currentUserId, currentRole, userName }: UseTabletTrackerProps) {
  const watchIdRef = useRef<number | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const [isRinging, setIsRinging] = useState<boolean>(false);
  
  const mySlot = resolveTabletSlot(currentUserId, currentRole, userName);
  const mySpec = TABLET_SPECS[mySlot];

  const [permissionApproved, setPermissionApproved] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`tablet_247_loc_approved_${currentUserId}`) === 'true';
  });

  const getBatteryStatus = async (): Promise<{ level: number; isCharging: boolean }> => {
    try {
      if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
        const battery: any = await (navigator as any).getBattery();
        return {
          level: typeof battery.level === 'number' ? battery.level : mySpec.defaultBattery,
          isCharging: typeof battery.charging === 'boolean' ? battery.charging : true,
        };
      }
    } catch {
      // ignore
    }
    return { level: mySpec.defaultBattery, isCharging: true };
  };

  const reportPosition = useCallback(
    async (lat?: number, lng?: number, accuracy = 10) => {
      if (!currentUserId) return;
      const batteryInfo = await getBatteryStatus();

      await upsertTabletLocation({
        user_id: mySpec.canonicalId,
        device_name: mySpec.officialName,
        role: mySlot === 'manager' ? 'manager' : 'worker',
        latitude: lat && lat !== 0 ? lat : mySpec.defaultCoordinates.lat,
        longitude: lng && lng !== 0 ? lng : mySpec.defaultCoordinates.lng,
        accuracy: accuracy,
        battery_level: batteryInfo.level,
        is_charging: batteryInfo.isCharging,
        is_online: true,
        permission_approved: true,
        last_ping_at: new Date().toISOString(),
      });
    },
    [currentUserId, mySlot, mySpec]
  );

  const startTracking = useCallback(() => {
    // Initial immediate report with default bay position
    reportPosition(mySpec.defaultCoordinates.lat, mySpec.defaultCoordinates.lng, 10);

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          reportPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        () => {
          reportPosition(mySpec.defaultCoordinates.lat, mySpec.defaultCoordinates.lng, 10);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          reportPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        () => {
          // ignore
        },
        { enableHighAccuracy: true, maximumAge: 30000 }
      );
    }
  }, [mySpec, reportPosition]);

  // Request & Approve Permission Flow
  const approveLocationPermission = useCallback(() => {
    localStorage.setItem(`tablet_247_loc_approved_${currentUserId}`, 'true');
    setPermissionApproved(true);
    setShowPermissionModal(false);
    startTracking();
  }, [currentUserId, startTracking]);

  const stopAlarm = useCallback(() => {
    setIsRinging(false);
    stopFindMyAlarmSound();
    sendRemoteCommand(mySpec.canonicalId, 'STOP_SOUND', mySpec.officialName);
  }, [mySpec]);

  useEffect(() => {
    if (!currentUserId) return;

    // Manager role auto-enables; workers check for initial approval or modal prompt
    if (currentRole === 'manager' || permissionApproved) {
      startTracking();
    } else {
      setShowPermissionModal(true);
    }

    // Periodic 30s background ping when online
    const intervalId = setInterval(() => {
      if (currentRole === 'manager' || localStorage.getItem(`tablet_247_loc_approved_${currentUserId}`) === 'true') {
        startTracking();
      }
    }, 30000);

    // Subscribe to remote manager commands strictly isolated to THIS tablet slot
    const unsubscribeCommands = subscribeToRemoteCommands(currentUserId, currentRole, userName || '', (cmd) => {
      if (cmd.command === 'PLAY_SOUND') {
        setIsRinging(true);
        playFindMyAlarmSound(25);
      } else if (cmd.command === 'STOP_SOUND') {
        setIsRinging(false);
        stopFindMyAlarmSound();
      } else if (cmd.command === 'REQUEST_LOCATION_PERMISSION') {
        setShowPermissionModal(true);
      }
    });

    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      clearInterval(intervalId);
      unsubscribeCommands();
      stopFindMyAlarmSound();
    };
  }, [currentUserId, currentRole, userName, permissionApproved, mySlot, mySpec, startTracking]);

  const triggerPermissionPrompt = useCallback(() => {
    setShowPermissionModal(true);
  }, []);

  return {
    showPermissionModal,
    approveLocationPermission,
    triggerPermissionPrompt,
    isRinging,
    ringingDeviceName: mySpec.officialName,
    stopAlarm,
  };
}
