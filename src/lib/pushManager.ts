import { supabase } from './supabase';
import type { TabletSlot } from './findMy';
import { initAudioContext, requestScreenWakeLock, enableBackgroundAudioKeepAlive } from './findMy';

export const VAPID_PUBLIC_KEY =
  'BMSt8upjLKu9uE7kB0lU9_sy8NYkYPTm7Eb9Dxg-9-8_k0ch_4ZTIfpxf0iXKT1Y_qtH1-Z1lL2KBALUyVICKCI';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Checks if browser notifications are supported.
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Checks if Push Notifications & Service Workers are supported.
 */
export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Gets the current Notification permission state ('default', 'granted', 'denied').
 */
export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Registers the Service Worker, requests notification permission, and unlocks audio & wake lock.
 * Guaranteed never to crash or get stuck.
 */
export async function registerTabletForPushNotifications(
  slot: TabletSlot,
  userId?: string
): Promise<{ success: boolean; permission: NotificationPermission; error?: string }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { success: false, permission: 'denied', error: 'Notifications are not supported on this browser.' };
  }

  // Pre-unlock audio and request screen wake lock on this user gesture
  try {
    initAudioContext();
    enableBackgroundAudioKeepAlive();
    requestScreenWakeLock();
  } catch {
    // ignore
  }

  try {
    // 1. Request notification permission (supports both promise and callback styles)
    let permission: NotificationPermission = Notification.permission;
    if (permission !== 'granted') {
      try {
        permission = await Notification.requestPermission();
      } catch {
        permission = await new Promise<NotificationPermission>((resolve) => {
          Notification.requestPermission((p) => resolve(p));
        });
      }
    }

    if (permission !== 'granted') {
      return { success: false, permission, error: 'Notification permission was not granted.' };
    }

    // Save granted state in localStorage
    try {
      localStorage.setItem('tablet_push_permission', 'granted');
    } catch {
      // ignore
    }

    // 2. Register Service Worker if supported
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;

        // 3. Try Web Push subscription (optional enhancement)
        if ('PushManager' in window && registration.pushManager) {
          try {
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
              const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
              subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey as BufferSource,
              });
            }

            if (subscription) {
              const subscriptionJson = subscription.toJSON();
              await supabase
                .from('tablet_push_subscriptions')
                .upsert(
                  {
                    tablet_slot: slot,
                    user_id: userId || null,
                    subscription: subscriptionJson,
                    user_agent: navigator.userAgent,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'tablet_slot' }
                );
            }
          } catch (pushErr) {
            console.warn('Push manager subscription warning (regular notifications active):', pushErr);
          }
        }
      } catch (swErr) {
        console.warn('Service worker registration warning:', swErr);
      }
    }

    return { success: true, permission: 'granted' };
  } catch (err: any) {
    console.error('Error in registerTabletForPushNotifications:', err);
    const perm = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
    return {
      success: perm === 'granted',
      permission: perm,
      error: err?.message || String(err),
    };
  }
}

/**
 * Sends a push alarm to a target tablet slot by invoking the Supabase Edge Function `send-push-alarm`.
 */
export async function triggerPushAlarm(
  targetSlot: TabletSlot,
  command: 'PLAY_SOUND' | 'STOP_SOUND',
  payloadData?: any
): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('send-push-alarm', {
      body: {
        target_slot: targetSlot,
        command,
        payload: payloadData,
      },
    });

    if (error) {
      return false;
    }

    return data?.ok ?? true;
  } catch {
    return false;
  }
}
