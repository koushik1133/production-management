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

/**
 * Resolves a tablet ID or user session to its canonical UUID.
 */
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
    ? new BroadcastChannel('tablet_locations_channel_v3')
    : null;

const commandBroadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('tablet_remote_commands_channel_v3')
    : null;

export function saveLocationsToStorage(map: Map<string, TabletLocation>) {
  try {
    const obj = Object.fromEntries(map.entries());
    localStorage.setItem('tablet_locations_cache_v3', JSON.stringify(obj));
  } catch {
    // ignore
  }
}

export function loadLocationsFromStorage(): Map<string, TabletLocation> {
  const map = new Map<string, TabletLocation>();
  try {
    const raw = localStorage.getItem('tablet_locations_cache_v3');
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
 * Upserts a tablet's current location, battery level, and online status.
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
    latitude: location.latitude && location.latitude !== 0 ? location.latitude : spec.defaultCoordinates.lat,
    longitude: location.longitude && location.longitude !== 0 ? location.longitude : spec.defaultCoordinates.lng,
    battery_level: location.battery_level !== undefined ? location.battery_level : spec.defaultBattery,
    is_charging: location.is_charging !== false,
    is_online: true,
    permission_approved: true,
    last_ping_at: now,
    updated_at: now,
  };

  memoryLocationsMap.set(spec.canonicalId, fullLocation);
  saveLocationsToStorage(memoryLocationsMap);
  locationListeners.forEach((listener) => listener(fullLocation));
  locationBroadcastChannel?.postMessage({ type: 'LOCATION_UPDATE', payload: fullLocation });
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('tablet_location_updated'));
  }

  try {
    const payload: any = {
      id: spec.canonicalId,
      user_id: spec.canonicalId,
      device_name: spec.officialName,
      latitude: fullLocation.latitude,
      longitude: fullLocation.longitude,
      accuracy: fullLocation.accuracy || 10,
      battery_level: fullLocation.battery_level,
      is_charging: fullLocation.is_charging,
      is_online: true,
      last_ping_at: now,
      updated_at: now,
    };

    let { error } = await supabase.from('tablet_locations').upsert(payload);

    if (error && (error.message.includes('schema cache') || error.message.includes('column'))) {
      const corePayload = {
        id: spec.canonicalId,
        user_id: spec.canonicalId,
        device_name: spec.officialName,
        latitude: fullLocation.latitude,
        longitude: fullLocation.longitude,
        battery_level: fullLocation.battery_level,
        updated_at: now,
      };
      await supabase.from('tablet_locations').upsert(corePayload);
    }
  } catch (err) {
    // Silent fail
  }
}

// Default tablets initial state
const DEFAULT_TABLETS: TabletLocation[] = Object.values(TABLET_SPECS).map((spec) => ({
  id: spec.canonicalId,
  user_id: spec.canonicalId,
  device_name: spec.officialName,
  role: spec.slot === 'manager' ? 'manager' : 'worker',
  latitude: spec.defaultCoordinates.lat,
  longitude: spec.defaultCoordinates.lng,
  accuracy: 10,
  battery_level: spec.defaultBattery,
  is_charging: true,
  is_online: true,
  permission_approved: true,
  last_ping_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}));

/**
 * Subscribes to real-time location updates across tabs & Supabase DB changes.
 */
export function subscribeToLocationUpdates(callback: (loc: TabletLocation) => void) {
  locationListeners.add(callback);

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === 'tablet_locations_cache_v3' && e.newValue) {
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

  const handleCustomEvent = () => {
    const stored = loadLocationsFromStorage();
    stored.forEach((loc) => callback(loc));
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
    window.addEventListener('tablet_location_updated', handleCustomEvent);
  }

  const channel = supabase
    .channel('tablet_locations_realtime_v3')
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
      window.removeEventListener('tablet_location_updated', handleCustomEvent);
    }
    try {
      supabase.removeChannel(channel);
    } catch {
      // ignore
    }
  };
}

/**
 * Fetches all active tablet locations from Supabase + local storage fallback.
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
        const existing = memoryLocationsMap.get(spec.canonicalId);
        const validBattery = typeof loc.battery_level === 'number' && loc.battery_level > 0 ? loc.battery_level : (existing?.battery_level || spec.defaultBattery);
        memoryLocationsMap.set(spec.canonicalId, {
          ...existing,
          ...loc,
          id: spec.canonicalId,
          user_id: spec.canonicalId,
          device_name: spec.officialName,
          battery_level: validBattery,
        } as TabletLocation);
      });
    }
  } catch (err) {
    console.warn('Failed to fetch tablet locations from DB:', err);
  }

  // Load any local storage fallback locations
  const storedMap = loadLocationsFromStorage();
  storedMap.forEach((loc, key) => {
    memoryLocationsMap.set(key, loc);
  });

  const resultMap = new Map<string, TabletLocation>();

  // Ensure default slots are all present
  DEFAULT_TABLETS.forEach((def) => {
    resultMap.set(def.id, def);
  });

  memoryLocationsMap.forEach((loc, key) => {
    resultMap.set(key, loc);
  });

  saveLocationsToStorage(resultMap);
  return Array.from(resultMap.values());
}

/**
 * Broadcasts a remote command (e.g. 'PLAY_SOUND', 'STOP_SOUND', or 'REQUEST_LOCATION_PERMISSION') to a specific target tablet.
 */
export async function sendRemoteCommand(
  target: string, // canonical ID, slot name, or user ID
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

  // Dispatch locally & across browser tabs
  commandListeners.forEach((listener) => listener(payload));
  commandBroadcastChannel?.postMessage({ type: 'REMOTE_COMMAND', payload });

  try {
    const channel = supabase.channel('tablet_remote_commands_v3');
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'remote_command',
      payload,
    });
  } catch (err) {
    console.warn('Error sending remote command via Supabase channel:', err);
  }
}

/**
 * Listens for remote commands directed to the current tablet device slot.
 * Ensures 100% target isolation so only the targeted tablet plays sound or responds.
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

  const channel = supabase
    .channel('tablet_remote_commands_v3')
    .on('broadcast', { event: 'remote_command' }, (event) => {
      const payload = event.payload as RemoteCommandPayload;
      if (payload && isTargetMatch(payload)) {
        callback(payload);
      }
    })
    .subscribe();

  return () => {
    commandListeners.delete(localHandler);
    try {
      supabase.removeChannel(channel);
    } catch {
      // ignore
    }
  };
}

// ==========================================
// APPLE FIND MY ESCALATING SONAR ALARM SYNTHESIZER
// ==========================================
let audioCtx: AudioContext | null = null;
let alarmInterval: any = null;
let alarmTimeout: any = null;

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
}

// Unlock audio context on user interaction
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    initAudioContext();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
}

/**
 * Synthesizes an authentic Apple Find My dual-tone escalating sonar chirp.
 */
export function playFindMyAlarmSound(durationSeconds = 25) {
  initAudioContext();
  stopFindMyAlarmSound();

  let pulseCount = 0;

  const playSonarChirp = () => {
    if (!audioCtx) initAudioContext();
    if (!audioCtx) return;

    try {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      pulseCount++;
      // Gradually escalate volume: pulses 1-3 = 0.35, 4-6 = 0.65, 7+ = 1.0 (Maximum Volume)
      const volumeLevel = Math.min(1.0, 0.35 + (pulseCount * 0.1));
      const now = audioCtx.currentTime;

      // Master Gain
      const masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(volumeLevel, now);
      masterGain.connect(audioCtx.destination);

      // --- TONE 1: Primary High Ping (C7 - 2093 Hz) ---
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(2093, now);
      osc1.frequency.exponentialRampToValueAtTime(2793, now + 0.1); // Quick upward glide
      
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.9, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.16);

      // --- TONE 2: Secondary Sonar Echo Harmonic (F7 - 2793 Hz rising to G7 - 3136 Hz) ---
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(2793, now + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(3136, now + 0.28);
      
      gain2.gain.setValueAtTime(0, now + 0.15);
      gain2.gain.linearRampToValueAtTime(0.95, now + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.35);

      // Vibrate mobile/tablet device if supported (Apple Find My tactile rhythm)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([150, 80, 200]);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.warn('Alarm audio playback error:', err);
    }
  };

  playSonarChirp();
  alarmInterval = setInterval(playSonarChirp, 1100);

  alarmTimeout = setTimeout(() => {
    stopFindMyAlarmSound();
  }, durationSeconds * 1000);
}

/**
 * Stops any active lost tablet alarm sound.
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
}
