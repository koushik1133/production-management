import { useState, useEffect, useRef, useCallback } from 'react';
import {
  upsertTabletLocation,
  subscribeToRemoteCommands,
  playFindMyAlarmSound,
  stopFindMyAlarmSound,
} from '../lib/findMy';

interface UseTabletTrackerProps {
  currentUserId: string;
  currentRole: string;
  userName?: string;
}



export function useTabletTracker({ currentUserId, currentRole, userName }: UseTabletTrackerProps) {
  const watchIdRef = useRef<number | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const [permissionApproved, setPermissionApproved] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`tablet_247_loc_approved_${currentUserId}`) === 'true';
  });

  const getBatteryStatus = async (): Promise<{ level: number; isCharging: boolean }> => {
    try {
      if ('getBattery' in navigator) {
        const battery: any = await (navigator as any).getBattery();
        return {
          level: typeof battery.level === 'number' ? battery.level : 1.0,
          isCharging: typeof battery.charging === 'boolean' ? battery.charging : true,
        };
      }
    } catch {
      // ignore
    }
    return { level: 1.0, isCharging: true };
  };

  const getBayLocation = (role: string, name: string) => {
    const text = `${role} ${name}`.toLowerCase();
    if (text.includes('t1') || role === 'worker') return { lat: 33.1248, lng: -96.7977 };
    if (text.includes('t2')) return { lat: 33.1243, lng: -96.7975 };
    if (text.includes('t3')) return { lat: 33.1250, lng: -96.7984 };
    return { lat: 42.0337, lng: -93.9129 };
  };

  const reportPosition = useCallback(
    async (lat?: number, lng?: number, accuracy = 10) => {
      if (!currentUserId) return;
      const deviceName = userName || `${currentRole.toUpperCase()} Tablet`;
      const batteryInfo = await getBatteryStatus();
      const defaultBay = getBayLocation(currentRole, userName || '');

      await upsertTabletLocation({
        user_id: currentUserId,
        device_name: deviceName,
        role: currentRole,
        latitude: lat && lat !== 0 ? lat : defaultBay.lat,
        longitude: lng && lng !== 0 ? lng : defaultBay.lng,
        accuracy: accuracy,
        battery_level: batteryInfo.level,
        is_charging: batteryInfo.isCharging,
        is_online: true,
        permission_approved: true,
        last_ping_at: new Date().toISOString(),
      });
    },
    [currentUserId, currentRole, userName]
  );

  const startTracking = useCallback(() => {
    // Initial immediate report
    const defaultBay = getBayLocation(currentRole, userName || '');
    reportPosition(defaultBay.lat, defaultBay.lng, 10);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          reportPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        () => {
          reportPosition(defaultBay.lat, defaultBay.lng, 10);
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
  }, [currentRole, userName, reportPosition]);

  // Request & Approve Permission Flow
  const approveLocationPermission = useCallback(() => {
    localStorage.setItem(`tablet_247_loc_approved_${currentUserId}`, 'true');
    setPermissionApproved(true);
    setShowPermissionModal(false);
    startTracking();
  }, [currentUserId, startTracking]);

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

    // Subscribe to remote manager commands
    const unsubscribeCommands = subscribeToRemoteCommands(currentUserId, currentRole, userName || '', (cmd) => {
      if (cmd.command === 'PLAY_SOUND') {
        playFindMyAlarmSound(12);
      } else if (cmd.command === 'STOP_SOUND') {
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
    };
  }, [currentUserId, currentRole, permissionApproved, reportPosition, startTracking]);

  const triggerPermissionPrompt = useCallback(() => {
    setShowPermissionModal(true);
  }, []);

  return {
    showPermissionModal,
    approveLocationPermission,
    triggerPermissionPrompt,
  };
}
