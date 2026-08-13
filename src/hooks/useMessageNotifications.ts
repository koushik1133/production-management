import { useState, useEffect, useCallback, useRef } from 'react';

export interface ToastAlert {
  id: string;
  title: string;
  body: string;
  senderName?: string;
}

export interface UseMessageNotificationsReturn {
  permission: NotificationPermission;
  isSupported: boolean;
  requestPermission: () => Promise<NotificationPermission>;
  sendNotification: (title: string, options?: NotificationOptions & { senderName?: string }) => void;
  activeToast: ToastAlert | null;
  dismissToast: () => void;
  playChime: () => void;
}

export function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Play pleasant dual-tone chime (D5 -> A5)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);

    // Safely close AudioContext after playback completes
    setTimeout(() => {
      try {
        if (ctx.state !== 'closed') {
          ctx.close();
        }
      } catch {
        // ignore
      }
    }, 500);
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export function useMessageNotifications(): UseMessageNotificationsReturn {
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (isSupported) return Notification.permission;
    return 'denied';
  });

  const [activeToast, setActiveToast] = useState<ToastAlert | null>(null);
  const originalTitleRef = useRef<string>(typeof document !== 'undefined' ? document.title : 'Production Portal');
  const titleIntervalRef = useRef<any>(null);

  // Register background Service Worker for reliable OS notifications when tab is minimized/backgrounded
  useEffect(() => {
    if (isSupported) {
      setPermission(Notification.permission);
    }

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) {
          navigator.serviceWorker.register('/sw.js').catch(() => {
            // Service worker registration optional fallback
          });
        }
      });
    }
  }, [isSupported]);

  // Request browser notification permission
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!isSupported) return 'denied';
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        playNotificationChime();
      }
      return result;
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      return Notification.permission;
    }
  }, [isSupported]);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
    if (titleIntervalRef.current) {
      clearInterval(titleIntervalRef.current);
      titleIntervalRef.current = null;
      if (typeof document !== 'undefined') {
        document.title = originalTitleRef.current;
      }
    }
  }, []);

  // Flash browser tab title when unread message arrives
  const flashTabTitle = useCallback((senderName?: string) => {
    if (typeof document === 'undefined') return;
    if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);

    let isOriginal = false;
    const alertText = senderName ? `💬 (${senderName}) New Message!` : `💬 New Message!`;

    titleIntervalRef.current = setInterval(() => {
      document.title = isOriginal ? originalTitleRef.current : alertText;
      isOriginal = !isOriginal;
    }, 1200);

    const handleFocus = () => {
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
        document.title = originalTitleRef.current;
      }
      window.removeEventListener('focus', handleFocus);
    };

    window.addEventListener('focus', handleFocus);
  }, []);

  const sendNotification = useCallback(
    async (title: string, options?: NotificationOptions & { senderName?: string }) => {
      // 1. Play Web Audio Chime
      playNotificationChime();

      // 2. Set In-App Toast Popup
      const bodyText = options?.body || 'You received a new production message.';
      const toast: ToastAlert = {
        id: String(Date.now()),
        title,
        body: bodyText,
        senderName: options?.senderName,
      };
      setActiveToast(toast);

      // Auto dismiss toast after 6 seconds
      setTimeout(() => {
        setActiveToast((prev) => (prev?.id === toast.id ? null : prev));
      }, 6000);

      // 3. Flash Browser Tab Title
      flashTabTitle(options?.senderName);

      // 4. Trigger OS Desktop Notification (Service Worker + Direct Fallback)
      if (isSupported && Notification.permission === 'granted') {
        try {
          // Attempt Service Worker notification first for background tab support
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && 'showNotification' in reg) {
              await reg.showNotification(title, {
                badge: '/lane-logo.png',
                icon: '/lane-logo.png',
                body: bodyText,
                tag: 'production-message',
                ...options,
              });
              return;
            }
          }

          // Fallback to Window Notification API
          const n = new Notification(title, {
            badge: '/lane-logo.png',
            icon: '/lane-logo.png',
            body: bodyText,
            tag: 'production-message',
            ...options,
          });

          n.onclick = () => {
            if (typeof window !== 'undefined') {
              window.focus();
            }
            n.close();
          };
        } catch (err) {
          console.error('Error displaying OS notification:', err);
        }
      }
    },
    [isSupported, flashTabTitle]
  );

  return {
    permission,
    isSupported,
    requestPermission,
    sendNotification,
    activeToast,
    dismissToast,
    playChime: playNotificationChime,
  };
}
