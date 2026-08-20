import { supabase } from './supabase';
import type { TabletSlot } from './findMy';

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
 * Checks if Push Notifications & Service Workers are supported on this device.
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
  if (!isPushNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Registers the Service Worker and requests push notification permission.
 * Subscribes to the Web Push push manager with the VAPID public key and
 * saves the subscription to Supabase `tablet_push_subscriptions`.
 */
export async function registerTabletForPushNotifications(
  slot: TabletSlot,
  userId?: string
): Promise<{ success: boolean; permission: NotificationPermission; error?: string }> {
  if (!isPushNotificationSupported()) {
    return { success: false, permission: 'denied', error: 'Push notifications are not supported on this browser/device.' };
  }

  try {
    // 1. Request OS/browser notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, permission, error: 'Notification permission was not granted.' };
    }

    // 2. Register Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // 3. Subscribe or get existing PushSubscription
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });
    }

    // 4. Upsert subscription in Supabase table
    const subscriptionJson = subscription.toJSON();
    const { error: dbError } = await supabase
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

    if (dbError) {
      console.warn('Could not save push subscription to Supabase:', dbError);
    }

    return { success: true, permission: 'granted' };
  } catch (err: any) {
    console.error('Error registering for push notifications:', err);
    return {
      success: false,
      permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
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
      console.warn('Push alarm edge function warning:', error);
      return false;
    }

    return data?.ok ?? true;
  } catch (err) {
    console.warn('triggerPushAlarm error:', err);
    return false;
  }
}
