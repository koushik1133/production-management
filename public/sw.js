// Lane Trailers — Production Management Service Worker
// Handles Web Push notifications for Find My Tablet alarm (works even when screen is OFF)

const SW_VERSION = 'v3-alarm';

// ─── Install: activate immediately, no waiting ───────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Push Event Handler ───────────────────────────────────────────────────────
// This fires even when the screen is OFF and the browser is backgrounded.
// The OS delivers the push payload to the service worker directly.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const command = data.command || 'PLAY_SOUND';
  const targetSlot = data.target_slot || 'Unknown';
  const slotLabel = data.target_name || targetSlot;

  // Build the notification options
  const notificationTitle = command === 'PLAY_SOUND'
    ? `🔔 Find My Alert — ${slotLabel}`
    : `✅ Alarm Stopped — ${slotLabel}`;

  const notificationOptions = {
    body: command === 'PLAY_SOUND'
      ? 'Production Manager is playing a sound to locate this tablet. Tap to open.'
      : 'The Find My alarm has been stopped by the manager.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: `find-my-alarm-${targetSlot}`, // Replace previous notification for same tablet
    renotify: true,                       // Still vibrate/sound even if replacing
    requireInteraction: command === 'PLAY_SOUND', // Stay visible until tapped (PLAY only)
    silent: false,
    vibrate: command === 'PLAY_SOUND'
      ? [300, 100, 300, 100, 600, 200, 300, 100, 300] // Long intense vibration pattern
      : [100],
    data: {
      command,
      target_slot: targetSlot,
      target_name: slotLabel,
      payload: data.payload || data,
      url: '/',
    },
    actions: command === 'PLAY_SOUND'
      ? [{ action: 'stop', title: '🔇 Stop Alarm' }]
      : [],
  };

  // Show the OS notification (this wakes the screen even if it was off)
  const showNotification = self.registration.showNotification(notificationTitle, notificationOptions);

  // Also try to message any already-open app clients to play alarm sound immediately
  // (handles the case where screen is on but app is just backgrounded)
  const messageClients = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      if (clients.length > 0) {
        const msg = {
          type: 'FIND_MY_PUSH_COMMAND',
          command,
          target_slot: targetSlot,
          payload: data.payload || data,
        };
        clients.forEach((client) => client.postMessage(msg));
      }
    });

  event.waitUntil(Promise.all([showNotification, messageClients]));
});

// ─── Notification Click Handler ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const notifData = notification.data || {};

  notification.close();

  if (action === 'stop') {
    // User tapped "Stop Alarm" action button — message app to stop
    const stopMsg = {
      type: 'FIND_MY_PUSH_COMMAND',
      command: 'STOP_SOUND',
      target_slot: notifData.target_slot,
      payload: notifData.payload,
    };
    const focusOrOpen = self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        if (clients.length > 0) {
          clients.forEach((c) => c.postMessage(stopMsg));
          return clients[0].focus();
        }
        return self.clients.openWindow('/');
      });
    event.waitUntil(focusOrOpen);
    return;
  }

  // Regular notification tap — open/focus the app so it can play alarm
  const focusOrOpen = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      // Find an existing open window and focus it
      const appClient = clients.find((c) => c.url.includes(self.location.origin));
      if (appClient) {
        // Message the already-open client to play alarm
        if (notifData.command === 'PLAY_SOUND') {
          appClient.postMessage({
            type: 'FIND_MY_PUSH_COMMAND',
            command: 'PLAY_SOUND',
            target_slot: notifData.target_slot,
            payload: notifData.payload,
          });
        }
        return appClient.focus();
      }
      // No open window — open a new one (will auto-play when loaded)
      return self.clients.openWindow('/');
    });

  event.waitUntil(focusOrOpen);
});

// ─── Message Handler (from main app thread) ──────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

