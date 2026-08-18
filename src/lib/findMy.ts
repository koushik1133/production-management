import { supabase } from './supabase';
import type { RemoteCommandPayload } from '../types/findMy';

export type TabletSlot = 'T1' | 'T2' | 'T3' | 'manager';

export interface TabletDeviceSpec {
  slot: TabletSlot;
  canonicalId: string;
  officialName: string;
  stationName: string;
}

export const TABLET_SPECS: Record<TabletSlot, TabletDeviceSpec> = {
  T1: {
    slot: 'T1',
    canonicalId: '00000000-0000-4000-a000-000000000001',
    officialName: 'T1 (Frame Assembly)',
    stationName: 'Bay 1: Frame Assembly',
  },
  T2: {
    slot: 'T2',
    canonicalId: '00000000-0000-4000-a000-000000000002',
    officialName: 'T2 (Welding Bay 3)',
    stationName: 'Bay 2: Welding Bay 3',
  },
  T3: {
    slot: 'T3',
    canonicalId: '00000000-0000-4000-a000-000000000003',
    officialName: 'T3 (Finishing & Paint)',
    stationName: 'Bay 3: Finishing & Paint',
  },
  manager: {
    slot: 'manager',
    canonicalId: '00000000-0000-4000-a000-000000000009',
    officialName: 'manager',
    stationName: 'Production HQ / Office',
  },
};

/**
 * Deterministically maps any user session, email, role, or ID to its canonical slot ('T1', 'T2', 'T3', 'manager').
 */
export function resolveTabletSlot(userId?: string, role?: string, name?: string): TabletSlot {
  if (role === 'manager') return 'manager';

  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('assigned_tablet_slot') as TabletSlot;
    if (saved && (saved === 'T1' || saved === 'T2' || saved === 'T3' || saved === 'manager')) {
      return saved;
    }
  }

  if (userId === '00000000-0000-4000-a000-000000000001') return 'T1';
  if (userId === '00000000-0000-4000-a000-000000000002') return 'T2';
  if (userId === '00000000-0000-4000-a000-000000000003') return 'T3';
  if (userId === '00000000-0000-4000-a000-000000000009') return 'manager';

  const text = `${userId || ''} ${role || ''} ${name || ''}`.toLowerCase().trim();
  if (text.includes('t3') || text.includes('finishing') || text.includes('paint') || text.includes('bay 3') || text.includes('bay3')) return 'T3';
  if (text.includes('t2') || text.includes('welding') || text.includes('bay 2') || text.includes('bay2')) return 'T2';
  if (text.includes('t1') || text.includes('assembly') || text.includes('frame') || text.includes('bay 1') || text.includes('bay1')) return 'T1';
  if (text.includes('manager')) return 'manager';

  return 'T1';
}

export function setAssignedTabletSlot(slot: TabletSlot) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('assigned_tablet_slot', slot);
  }
}

export function resolveCanonicalTabletId(userId?: string, role?: string, deviceName?: string): string {
  const slot = resolveTabletSlot(userId, role, deviceName);
  return TABLET_SPECS[slot].canonicalId;
}

// In-memory fallback storage for real-time local sync across tabs/components
const commandListeners = new Set<(cmd: RemoteCommandPayload) => void>();

// Cross-tab real-time communication channel
const commandBroadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('tablet_alarm_channel_v8')
    : null;

if (commandBroadcastChannel) {
  commandBroadcastChannel.onmessage = (e) => {
    if (e.data?.type === 'REMOTE_COMMAND' && e.data?.payload) {
      const cmd = e.data.payload as RemoteCommandPayload;
      commandListeners.forEach((listener) => listener(cmd));
    }
  };
}

// =========================================================================
// PERMANENT SINGLE-CHANNEL SUPABASE REALTIME BROADCAST
// =========================================================================
let permanentRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function getOrCreatePermanentChannel() {
  if (!permanentRealtimeChannel) {
    permanentRealtimeChannel = supabase.channel('tablet_alarm_global_v8', {
      config: {
        broadcast: { self: true, ack: true },
      },
    });

    permanentRealtimeChannel
      .on('broadcast', { event: 'remote_command' }, (event) => {
        const payload = event.payload as RemoteCommandPayload;
        if (payload) {
          commandListeners.forEach((listener) => listener(payload));
        }
      })
      .subscribe();
  }
  return permanentRealtimeChannel;
}

// Initialize on script load
if (typeof window !== 'undefined') {
  getOrCreatePermanentChannel();
}

/**
 * Broadcasts a remote command ('PLAY_SOUND' or 'STOP_SOUND') to the target tablet slot.
 */
export async function sendRemoteCommand(
  target: string,
  command: 'PLAY_SOUND' | 'STOP_SOUND',
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

  // 1. In-memory listeners & cross-tab dispatch
  commandListeners.forEach((listener) => listener(payload));
  commandBroadcastChannel?.postMessage({ type: 'REMOTE_COMMAND', payload });

  try {
    localStorage.setItem(`tablet_active_cmd_${targetSlot}`, JSON.stringify(payload));
    localStorage.setItem('tablet_last_cmd_broadcast', JSON.stringify(payload));
  } catch {
    // ignore
  }

  // 2. Supabase Realtime WebSocket Broadcast
  try {
    const ch = getOrCreatePermanentChannel();
    await ch.send({
      type: 'broadcast',
      event: 'remote_command',
      payload,
    });
  } catch (err) {
    console.warn('Realtime alarm broadcast error:', err);
  }
}

/**
 * Listens for remote sound commands directed to the current tablet device slot.
 */
export function subscribeToRemoteCommands(
  currentUserId: string,
  currentRole: string,
  userName: string,
  callback: (cmd: RemoteCommandPayload) => void
) {
  const mySlot = resolveTabletSlot(currentUserId, currentRole, userName);

  const isTargetMatch = (cmd: RemoteCommandPayload): boolean => {
    if (currentRole === 'manager') return true;
    const targetSlot = resolveTabletSlot(cmd.target_user_id, cmd.target_role, cmd.target_name);
    return targetSlot === mySlot;
  };

  const localHandler = (cmd: RemoteCommandPayload) => {
    if (isTargetMatch(cmd)) {
      callback(cmd);
    }
  };
  commandListeners.add(localHandler);

  // Check local storage for recent command within last 45s
  const checkPendingCommands = () => {
    try {
      const raw = localStorage.getItem(`tablet_active_cmd_${mySlot}`);
      if (raw) {
        const cmd: RemoteCommandPayload = JSON.parse(raw);
        if (cmd.command === 'PLAY_SOUND' && Date.now() - cmd.timestamp < 45000) {
          callback(cmd);
        }
      }
    } catch {
      // ignore
    }
  };

  checkPendingCommands();

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

  // Ensure permanent channel is connected
  getOrCreatePermanentChannel();

  return () => {
    commandListeners.delete(localHandler);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('pageshow', handleResume);
      window.removeEventListener('online', handleResume);
    }
  };
}

// =========================================================================
// SCREEN WAKE LOCK (PREVENTS TABLET SLEEP 24/7)
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

// 1. Loud Apple Sonar Alarm WAV Loop (44.1kHz High Amplitude Ping)
const cachedSonarWavUri = typeof window !== 'undefined'
  ? createWavDataUri(44100, 1.0, (t) => {
      let sample = 0;
      if (t >= 0.0 && t <= 0.15) {
        const freq = 2093 + (2793 - 2093) * (t / 0.15);
        const envelope = Math.sin((t / 0.15) * Math.PI);
        sample += Math.sin(2 * Math.PI * freq * t) * envelope * 0.98;
      }
      if (t >= 0.15 && t <= 0.35) {
        const dt = t - 0.15;
        const freq = 2793 + (3136 - 2793) * (dt / 0.2);
        const envelope = Math.sin((dt / 0.2) * Math.PI);
        sample += Math.sin(2 * Math.PI * freq * t) * envelope * 0.98;
      }
      if (t >= 0.35 && t <= 0.5) {
        const dt = t - 0.35;
        const envelope = Math.exp(-dt * 12);
        sample += Math.sin(2 * Math.PI * 2093 * t) * envelope * 0.5;
      }
      return sample;
    })
  : '';

// 2. Silent Keep-Alive WAV Track
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
      keepAliveAudio.volume = 0.001;
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
  };
  ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown', 'mousedown'].forEach((evt) => {
    window.addEventListener(evt, unlockAudio, { passive: true });
  });
}

/**
 * Triggers dual-engine Apple Find My sonar alarm.
 */
export function playFindMyAlarmSound(durationSeconds = 30) {
  initAudioContext();
  stopFindMyAlarmSound();
  requestScreenWakeLock();

  // 1. LAYER 1: Full Volume HTML5 Sonar Alarm Loop
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

  // 2. LAYER 2: Web Audio API Oscillator Synthesizer
  let pulseCount = 0;
  const playWebAudioChirp = () => {
    if (!audioCtx) initAudioContext();
    if (!audioCtx) return;

    try {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      pulseCount++;
      const volumeLevel = Math.min(1.0, 0.5 + pulseCount * 0.1);
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
  alarmInterval = setInterval(playWebAudioChirp, 1000);

  // 3. LAYER 3: Tactile Hardware Vibration Pulsing
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([300, 100, 300, 100, 600]);
      vibrationInterval = setInterval(() => {
        try {
          navigator.vibrate([300, 100, 300, 100, 600]);
        } catch {
          // ignore
        }
      }, 1200);
    } catch {
      // ignore
    }
  }

  // 4. Automatic safety timeout
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
  enableBackgroundAudioKeepAlive();
}
