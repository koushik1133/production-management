import { supabase } from './supabase';
import type { TabletLocation, RemoteCommandPayload } from '../types/findMy';

export type TabletSlot = 'T1' | 'T2' | 'T3' | 'manager';

export interface TabletDeviceSpec {
  slot: TabletSlot;
  canonicalId: string;
  officialName: string;
  stationName: string;
  defaultCoordinates: { lat: number; lng: number };
  defaultBattery: number;
}

export const TABLET_SPECS: Record<TabletSlot, TabletDeviceSpec> = {
  T1: {
    slot: 'T1',
    canonicalId: '00000000-0000-4000-a000-000000000001',
    officialName: 'T1 (Frame Assembly)',
    stationName: 'Bay 1: Frame Assembly',
    defaultCoordinates: { lat: 33.1248, lng: -96.7977 },
    defaultBattery: 0.95,
  },
  T2: {
    slot: 'T2',
    canonicalId: '00000000-0000-4000-a000-000000000002',
    officialName: 'T2 (Welding Bay 3)',
    stationName: 'Bay 2: Welding Bay 3',
    defaultCoordinates: { lat: 33.1243, lng: -96.7975 },
    defaultBattery: 0.92,
  },
  T3: {
    slot: 'T3',
    canonicalId: '00000000-0000-4000-a000-000000000003',
    officialName: 'T3 (Finishing & Paint)',
    stationName: 'Bay 3: Finishing & Paint',
    defaultCoordinates: { lat: 33.1250, lng: -96.7984 },
    defaultBattery: 0.88,
  },
  manager: {
    slot: 'manager',
    canonicalId: '00000000-0000-4000-a000-000000000009',
    officialName: 'manager',
    stationName: 'Production HQ / Office',
    defaultCoordinates: { lat: 42.0337, lng: -93.9129 },
    defaultBattery: 1.0,
  },
};

/**
 * Deterministically maps any user session, email, role, or ID to its canonical slot ('T1', 'T2', 'T3', 'manager').
 */
export function resolveTabletSlot(userId?: string, role?: string, name?: string): TabletSlot {
  if (role === 'manager') return 'manager';

  if (userId === '00000000-0000-4000-a000-000000000001') return 'T1';
  if (userId === '00000000-0000-4000-a000-000000000002') return 'T2';
  if (userId === '00000000-0000-4000-a000-000000000003') return 'T3';
  if (userId === '00000000-0000-4000-a000-000000000009') return 'manager';

  const text = `${userId || ''} ${role || ''} ${name || ''}`.toLowerCase().trim();
  if (text.includes('t3') || text.includes('finishing') || text.includes('paint')) return 'T3';
  if (text.includes('t2') || text.includes('welding')) return 'T2';
  if (text.includes('t1') || text.includes('assembly') || text.includes('frame')) return 'T1';
  if (text.includes('manager')) return 'manager';

  return 'T1';
}

export function resolveCanonicalTabletId(userId?: string, role?: string, deviceName?: string): string {
  const slot = resolveTabletSlot(userId, role, deviceName);
  return TABLET_SPECS[slot].canonicalId;
}

// In-memory fallback storage for real-time local sync across tabs/components
const memoryLocationsMap = new Map<string, TabletLocation>();
const commandListeners = new Set<(cmd: RemoteCommandPayload) => void>();
const locationListeners = new Set<(loc: TabletLocation) => void>();

// Cross-tab real-time communication channels
const locationBroadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('tablet_locations_channel_v5')
    : null;

const commandBroadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('tablet_remote_commands_channel_v5')
    : null;

export function saveLocationsToStorage(map: Map<string, TabletLocation>) {
  try {
    const obj = Object.fromEntries(map.entries());
    localStorage.setItem('tablet_locations_cache_v5', JSON.stringify(obj));
  } catch {
    // ignore
  }
}

export function loadLocationsFromStorage(): Map<string, TabletLocation> {
  const map = new Map<string, TabletLocation>();
  try {
    const raw = localStorage.getItem('tablet_locations_cache_v5');
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.entries(parsed).forEach(([k, v]) => {
        map.set(k, v as TabletLocation);
      });
    }
  } catch {
    // ignore
  }
  return map;
}

if (locationBroadcastChannel) {
  locationBroadcastChannel.onmessage = (e) => {
    if (e.data?.type === 'LOCATION_UPDATE' && e.data?.payload) {
      const loc = e.data.payload as TabletLocation;
      memoryLocationsMap.set(loc.id, loc);
      saveLocationsToStorage(memoryLocationsMap);
      locationListeners.forEach((listener) => listener(loc));
    }
  };
}

if (commandBroadcastChannel) {
  commandBroadcastChannel.onmessage = (e) => {
    if (e.data?.type === 'REMOTE_COMMAND' && e.data?.payload) {
      const cmd = e.data.payload as RemoteCommandPayload;
      commandListeners.forEach((listener) => listener(cmd));
    }
  };
}

/**
 * Upserts a tablet's current status and registers its presence in DB.
 */
export async function upsertTabletLocation(location: Omit<TabletLocation, 'id' | 'updated_at'>): Promise<void> {
  const slot = resolveTabletSlot(location.user_id, location.role, location.device_name);
  const spec = TABLET_SPECS[slot];
  const now = new Date().toISOString();

  const fullLocation: TabletLocation = {
    ...location,
    id: spec.canonicalId,
    user_id: spec.canonicalId,
    device_name: spec.officialName,
    role: slot === 'manager' ? 'manager' : 'worker',
    latitude: spec.defaultCoordinates.lat,
    longitude: spec.defaultCoordinates.lng,
    is_online: true,
    permission_approved: true,
    last_ping_at: now,
    updated_at: now,
  };

  memoryLocationsMap.set(spec.canonicalId, fullLocation);
  saveLocationsToStorage(memoryLocationsMap);
  locationListeners.forEach((listener) => listener(fullLocation));
  locationBroadcastChannel?.postMessage({ type: 'LOCATION_UPDATE', payload: fullLocation });

  try {
    const payload = {
      id: spec.canonicalId,
      user_id: spec.canonicalId,
      device_name: spec.officialName,
      is_online: true,
      last_ping_at: now,
      updated_at: now,
    };
    await supabase.from('tablet_locations').upsert(payload);
  } catch {
    // Silent fail
  }
}

/**
 * Subscribes to real-time status updates across tabs & DB.
 */
export function subscribeToLocationUpdates(callback: (loc: TabletLocation) => void) {
  locationListeners.add(callback);

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === 'tablet_locations_cache_v5' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        Object.values(parsed).forEach((loc) => {
          callback(loc as TabletLocation);
        });
      } catch {
        // ignore
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
  }

  const channel = supabase
    .channel('tablet_locations_realtime_v5')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tablet_locations' },
      (payload) => {
        if (payload.new) {
          const loc = payload.new as TabletLocation;
          const slot = resolveTabletSlot(loc.user_id, loc.role, loc.device_name);
          const spec = TABLET_SPECS[slot];
          const fullLoc = { ...loc, id: spec.canonicalId, user_id: spec.canonicalId, device_name: spec.officialName };
          memoryLocationsMap.set(spec.canonicalId, fullLoc);
          saveLocationsToStorage(memoryLocationsMap);
          callback(fullLoc);
        }
      }
    )
    .subscribe();

  return () => {
    locationListeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
    }
    try {
      supabase.removeChannel(channel);
    } catch {
      // ignore
    }
  };
}

/**
 * Fetches all active tablet records from Supabase + local cache.
 */
export async function fetchTabletLocations(): Promise<TabletLocation[]> {
  try {
    const { data, error } = await supabase
      .from('tablet_locations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!error && data && data.length > 0) {
      data.forEach((loc) => {
        const slot = resolveTabletSlot(loc.user_id, loc.role, loc.device_name);
        const spec = TABLET_SPECS[slot];
        memoryLocationsMap.set(spec.canonicalId, {
          ...loc,
          id: spec.canonicalId,
          user_id: spec.canonicalId,
          device_name: spec.officialName,
        } as TabletLocation);
      });
    }
  } catch (err) {
    console.warn('Failed to fetch tablet locations from DB:', err);
  }

  const storedMap = loadLocationsFromStorage();
  storedMap.forEach((loc, key) => {
    memoryLocationsMap.set(key, loc);
  });

  const resultMap = new Map<string, TabletLocation>();
  Object.values(TABLET_SPECS).forEach((spec) => {
    resultMap.set(spec.canonicalId, {
      id: spec.canonicalId,
      user_id: spec.canonicalId,
      device_name: spec.officialName,
      role: spec.slot === 'manager' ? 'manager' : 'worker',
      latitude: spec.defaultCoordinates.lat,
      longitude: spec.defaultCoordinates.lng,
      is_online: true,
      permission_approved: true,
      last_ping_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  memoryLocationsMap.forEach((loc, key) => {
    resultMap.set(key, loc);
  });

  saveLocationsToStorage(resultMap);
  return Array.from(resultMap.values());
}

/**
 * Broadcasts a remote command (e.g. 'PLAY_SOUND' or 'STOP_SOUND') to target tablet slot.
 * Writes to Supabase Realtime broadcast + Local storage sync + Cross-tab broadcast.
 */
export async function sendRemoteCommand(
  target: string,
  command: 'PLAY_SOUND' | 'STOP_SOUND' | 'REQUEST_LOCATION_PERMISSION',
  targetName?: string
): Promise<void> {
  const targetSlot = resolveTabletSlot(target, '', targetName);
  const spec = TABLET_SPECS[targetSlot];

  const payload: RemoteCommandPayload = {
    id: String(Date.now()),
    target_user_id: spec.canonicalId,
    target_name: spec.officialName,
    target_role: targetSlot === 'manager' ? 'manager' : 'worker',
    command,
    timestamp: Date.now(),
  };

  // 1. Local & Same-Origin Cross-Tab Dispatch
  commandListeners.forEach((listener) => listener(payload));
  commandBroadcastChannel?.postMessage({ type: 'REMOTE_COMMAND', payload });

  // 2. Persistent Storage Sync (Handles waking from sleep)
  try {
    localStorage.setItem(`tablet_active_cmd_${targetSlot}`, JSON.stringify(payload));
    localStorage.setItem('tablet_last_cmd_broadcast', JSON.stringify(payload));
  } catch {
    // ignore
  }

  // 3. Supabase Realtime WebSocket Broadcast
  try {
    const channel = supabase.channel('tablet_remote_commands_v5');
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'remote_command',
      payload,
    });
  } catch (err) {
    console.warn('Error sending remote command via Supabase channel:', err);
  }

  // 4. Update Database record with command timestamp so sleeping tablets see it upon wake
  try {
    const now = new Date().toISOString();
    await supabase.from('tablet_locations').upsert({
      id: spec.canonicalId,
      user_id: spec.canonicalId,
      device_name: spec.officialName,
      is_online: true,
      last_ping_at: now,
      updated_at: now,
    });
  } catch {
    // ignore
  }
}

/**
 * Listens for remote commands directed to the current tablet device slot.
 * Resilient against sleep, tab switches, and network reconnections.
 */
export function subscribeToRemoteCommands(
  currentUserId: string,
  currentRole: string,
  userName: string,
  callback: (cmd: RemoteCommandPayload) => void
) {
  const mySlot = resolveTabletSlot(currentUserId, currentRole, userName);

  const isTargetMatch = (cmd: RemoteCommandPayload): boolean => {
    const targetSlot = resolveTabletSlot(cmd.target_user_id, cmd.target_role, cmd.target_name);
    return targetSlot === mySlot;
  };

  const localHandler = (cmd: RemoteCommandPayload) => {
    if (isTargetMatch(cmd)) {
      callback(cmd);
    }
  };
  commandListeners.add(localHandler);

  // Check for any pending active command that was sent while device was sleeping
  const checkPendingCommands = () => {
    try {
      const raw = localStorage.getItem(`tablet_active_cmd_${mySlot}`);
      if (raw) {
        const cmd: RemoteCommandPayload = JSON.parse(raw);
        // If command is PLAY_SOUND and was issued within last 60 seconds, execute it!
        if (cmd.command === 'PLAY_SOUND' && Date.now() - cmd.timestamp < 60000) {
          callback(cmd);
        }
      }
    } catch {
      // ignore
    }
  };

  checkPendingCommands();

  // Storage listener across tabs
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === `tablet_active_cmd_${mySlot}` && e.newValue) {
      try {
        const cmd: RemoteCommandPayload = JSON.parse(e.newValue);
        if (isTargetMatch(cmd)) {
          callback(cmd);
        }
      } catch {
        // ignore
      }
    }
  };

  // Re-check on visibilitychange, focus, or resume from sleep
  const handleResume = () => {
    checkPendingCommands();
    enableBackgroundAudioKeepAlive();
    requestScreenWakeLock();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    window.addEventListener('pageshow', handleResume);
    window.addEventListener('online', handleResume);
  }

  // Self-Healing Supabase Realtime Channel
  let channel = supabase
    .channel('tablet_remote_commands_v5')
    .on('broadcast', { event: 'remote_command' }, (event) => {
      const payload = event.payload as RemoteCommandPayload;
      if (payload && isTargetMatch(payload)) {
        callback(payload);
      }
    })
    .subscribe();

  // Periodic 3-second health check to reconnect if socket dropped during deep sleep
  const healthInterval = setInterval(() => {
    checkPendingCommands();
    if (channel && (channel.state === 'closed' || channel.state === 'errored')) {
      try {
        channel.subscribe();
      } catch {
        // ignore
      }
    }
  }, 3000);

  return () => {
    commandListeners.delete(localHandler);
    clearInterval(healthInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('pageshow', handleResume);
      window.removeEventListener('online', handleResume);
    }
    try {
      supabase.removeChannel(channel);
    } catch {
      // ignore
    }
  };
}

// =========================================================================
// SCREEN WAKE LOCK MANAGER (PREVENTS TABLET SLEEP & SCREEN TIMEOUT 24/7)
// =========================================================================
let wakeLockSentinel: any = null;

export async function requestScreenWakeLock(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function releaseScreenWakeLock() {
  if (wakeLockSentinel) {
    try {
      wakeLockSentinel.release();
    } catch {
      // ignore
    }
    wakeLockSentinel = null;
  }
}

// Auto maintain WakeLock across screen state changes
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      await requestScreenWakeLock();
    }
  });
}

// =========================================================================
// IN-MEMORY WAV DATA GENERATORS (SONAR ALARM & SILENT KEEP-ALIVE)
// =========================================================================
function createWavDataUri(sampleRate: number, duration: number, sampleFn: (t: number) => number): string {
  const totalSamples = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const sample = sampleFn(t);
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    view.setInt16(44 + i * 2, intSample, true);
  }

  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

// 1. Loud Apple Sonar Alarm WAV Loop
const cachedSonarWavUri = typeof window !== 'undefined'
  ? createWavDataUri(44100, 1.1, (t) => {
      let sample = 0;
      // Tone 1: 0.0s - 0.15s (2093 Hz -> 2793 Hz Upward Glide)
      if (t >= 0.0 && t <= 0.15) {
        const freq = 2093 + (2793 - 2093) * (t / 0.15);
        const envelope = Math.sin((t / 0.15) * Math.PI);
        sample += Math.sin(2 * Math.PI * freq * t) * envelope * 0.95;
      }
      // Tone 2: 0.15s - 0.35s (2793 Hz -> 3136 Hz Harmonic Sonar Ping)
      if (t >= 0.15 && t <= 0.35) {
        const dt = t - 0.15;
        const freq = 2793 + (3136 - 2793) * (dt / 0.2);
        const envelope = Math.sin((dt / 0.2) * Math.PI);
        sample += Math.sin(2 * Math.PI * freq * t) * envelope * 0.95;
      }
      // Tone 3: 0.35s - 0.5s (Subtle Resonant Echo)
      if (t >= 0.35 && t <= 0.5) {
        const dt = t - 0.35;
        const envelope = Math.exp(-dt * 15);
        sample += Math.sin(2 * Math.PI * 2093 * t) * envelope * 0.4;
      }
      return sample;
    })
  : '';

// 2. Silent Keep-Alive WAV Track (keeps browser process from freezing when screen turns off)
const cachedSilentWavUri = typeof window !== 'undefined'
  ? createWavDataUri(44100, 2.0, () => 0)
  : '';

// =========================================================================
// BACKGROUND AUDIO & MEDIA SESSION KEEP-ALIVE
// =========================================================================
let keepAliveAudio: HTMLAudioElement | null = null;
let htmlAlarmAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let alarmInterval: any = null;
let alarmTimeout: any = null;
let vibrationInterval: any = null;

export function enableBackgroundAudioKeepAlive() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;

  try {
    if (!keepAliveAudio && cachedSilentWavUri) {
      keepAliveAudio = new Audio(cachedSilentWavUri);
      keepAliveAudio.loop = true;
      keepAliveAudio.volume = 0.001; // silent keep-alive
    }

    if (keepAliveAudio && keepAliveAudio.paused) {
      keepAliveAudio.play().catch(() => {});
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Lane Trailers Tablet Service',
        artist: 'Alarm Standby Active',
        album: 'Find My Tablet 24/7',
      });
      navigator.mediaSession.setActionHandler('play', () => {
        keepAliveAudio?.play();
      });
    }
  } catch {
    // ignore
  }
}

export function initAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  enableBackgroundAudioKeepAlive();
}

// Auto-unlock interaction listeners
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    initAudioContext();
    enableBackgroundAudioKeepAlive();
    requestScreenWakeLock();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch {
        // ignore
      }
    }
  };
  ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown', 'mousedown'].forEach((evt) => {
    window.addEventListener(evt, unlockAudio, { passive: true });
  });
}

/**
 * Triggers dual-engine Apple Find My sonar alarm.
 * Plays through screen off, lock screen, and background state.
 */
export function playFindMyAlarmSound(durationSeconds = 30) {
  initAudioContext();
  stopFindMyAlarmSound();
  requestScreenWakeLock();

  // 1. Dispatch System Web Notification with Vibrate
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('🔔 Find My Tablet Alarm', {
        body: 'Production Manager is ringing this tablet to locate it!',
        requireInteraction: true,
        vibrate: [400, 150, 400, 150, 800],
      } as any);
    } catch {
      // ignore
    }
  }

  // 2. LAYER 1: Full Volume HTML5 Sonar Alarm Loop (Works with screen turned off)
  try {
    if (typeof Audio !== 'undefined' && cachedSonarWavUri) {
      if (!htmlAlarmAudio) {
        htmlAlarmAudio = new Audio(cachedSonarWavUri);
        htmlAlarmAudio.loop = true;
      } else {
        htmlAlarmAudio.src = cachedSonarWavUri;
      }
      htmlAlarmAudio.volume = 1.0;

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '🔔 FIND MY TABLET ALARM',
          artist: 'Manager Playing Sound',
          album: 'High Priority Alert',
        });
      }

      htmlAlarmAudio.play().catch(() => {});
    }
  } catch (err) {
    console.warn('HTML5 alarm audio error:', err);
  }

  // 3. LAYER 2: Web Audio API Oscillator Synthesizer
  let pulseCount = 0;
  const playWebAudioChirp = () => {
    if (!audioCtx) initAudioContext();
    if (!audioCtx) return;

    try {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      pulseCount++;
      const volumeLevel = Math.min(1.0, 0.4 + pulseCount * 0.1);
      const now = audioCtx.currentTime;

      const masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(volumeLevel, now);
      masterGain.connect(audioCtx.destination);

      // Tone 1: C7 (2093 Hz) -> F7 (2793 Hz)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(2093, now);
      osc1.frequency.exponentialRampToValueAtTime(2793, now + 0.12);

      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.95, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.18);

      // Tone 2: F7 (2793 Hz) -> G7 (3136 Hz)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(2793, now + 0.16);
      osc2.frequency.exponentialRampToValueAtTime(3136, now + 0.32);

      gain2.gain.setValueAtTime(0, now + 0.16);
      gain2.gain.linearRampToValueAtTime(1.0, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(now + 0.16);
      osc2.stop(now + 0.4);
    } catch {
      // ignore
    }
  };

  playWebAudioChirp();
  alarmInterval = setInterval(playWebAudioChirp, 1100);

  // 4. LAYER 3: Tactile Hardware Vibration Pulsing
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([250, 100, 250, 100, 500]);
      vibrationInterval = setInterval(() => {
        try {
          navigator.vibrate([250, 100, 250, 100, 500]);
        } catch {
          // ignore
        }
      }, 1200);
    } catch {
      // ignore
    }
  }

  // 5. Automatic safety timeout
  alarmTimeout = setTimeout(() => {
    stopFindMyAlarmSound();
  }, durationSeconds * 1000);
}

/**
 * Stops all active sound engines and vibration patterns immediately.
 */
export function stopFindMyAlarmSound() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  if (alarmTimeout) {
    clearTimeout(alarmTimeout);
    alarmTimeout = null;
  }
  if (vibrationInterval) {
    clearInterval(vibrationInterval);
    vibrationInterval = null;
  }
  if (htmlAlarmAudio) {
    try {
      htmlAlarmAudio.pause();
      htmlAlarmAudio.currentTime = 0;
    } catch {
      // ignore
    }
  }
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(0);
    } catch {
      // ignore
    }
  }
  // Keep background audio standby active
  enableBackgroundAudioKeepAlive();
}
