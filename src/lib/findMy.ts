import { supabase } from './supabase';
import type { TabletLocation, RemoteCommandPayload } from '../types/findMy';

// In-memory fallback storage for real-time local sync across tabs/components
const memoryLocationsMap = new Map<string, TabletLocation>();
const commandListeners = new Set<(cmd: RemoteCommandPayload) => void>();
const locationListeners = new Set<(loc: TabletLocation) => void>();

// Cross-tab real-time communication channels
const locationBroadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('tablet_locations_channel')
    : null;

const commandBroadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('tablet_remote_commands_channel')
    : null;

if (locationBroadcastChannel) {
  locationBroadcastChannel.onmessage = (e) => {
    if (e.data?.type === 'LOCATION_UPDATE' && e.data?.payload) {
      const loc = e.data.payload as TabletLocation;
      memoryLocationsMap.set(loc.user_id, loc);
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
 * Resolves a tablet ID or user session to its canonical slot (T1, T2, T3, Manager).
 */
export function resolveCanonicalTabletId(userId?: string, role?: string, deviceName?: string): string {
  const str = `${userId || ''} ${role || ''} ${deviceName || ''}`.toLowerCase();
  if (str.includes('t1') || role === 'worker') return '00000000-0000-4000-a000-000000000001';
  if (str.includes('t2')) return '00000000-0000-4000-a000-000000000002';
  if (str.includes('t3')) return '00000000-0000-4000-a000-000000000003';
  if (str.includes('manager')) return '00000000-0000-4000-a000-000000000009';
  return userId || '00000000-0000-4000-a000-000000000001';
}

/**
 * Upserts a tablet's current location, battery level, and online status.
 */
export async function upsertTabletLocation(location: Omit<TabletLocation, 'id' | 'updated_at'>): Promise<void> {
  const canonicalId = resolveCanonicalTabletId(location.user_id, location.role, location.device_name);
  const now = new Date().toISOString();
  const fullLocation: TabletLocation = {
    ...location,
    id: canonicalId,
    user_id: canonicalId,
    updated_at: now,
    last_ping_at: now,
  };

  memoryLocationsMap.set(canonicalId, fullLocation);
  locationListeners.forEach((listener) => listener(fullLocation));
  locationBroadcastChannel?.postMessage({ type: 'LOCATION_UPDATE', payload: fullLocation });

  try {
    const { error } = await supabase.from('tablet_locations').upsert({
      id: canonicalId,
      user_id: canonicalId,
      device_name: location.device_name,
      role: location.role,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy || 10,
      battery_level: location.battery_level,
      is_charging: location.is_charging,
      is_online: location.is_online,
      permission_approved: location.permission_approved,
      last_ping_at: now,
      updated_at: now,
    });

    if (error) {
      console.warn('Tablet location DB upsert notice:', error.message);
    }
  } catch (err) {
    console.warn('Tablet location sync error:', err);
  }
}

// Unconnected / default tablets start as offline & un-approved
const DEFAULT_TABLETS: TabletLocation[] = [
  {
    id: '00000000-0000-4000-a000-000000000001',
    user_id: '00000000-0000-4000-a000-000000000001',
    device_name: 'T1 (Frame Assembly)',
    role: 'worker',
    latitude: 0,
    longitude: 0,
    is_online: false,
    permission_approved: false,
    last_ping_at: '',
    updated_at: '',
  },
  {
    id: '00000000-0000-4000-a000-000000000002',
    user_id: '00000000-0000-4000-a000-000000000002',
    device_name: 'T2 (Welding Bay 3)',
    role: 'worker',
    latitude: 0,
    longitude: 0,
    is_online: false,
    permission_approved: false,
    last_ping_at: '',
    updated_at: '',
  },
  {
    id: '00000000-0000-4000-a000-000000000003',
    user_id: '00000000-0000-4000-a000-000000000003',
    device_name: 'T3 (Finishing & Paint)',
    role: 'worker',
    latitude: 0,
    longitude: 0,
    is_online: false,
    permission_approved: false,
    last_ping_at: '',
    updated_at: '',
  },
];

/**
 * Subscribes to real-time location updates across tabs.
 */
export function subscribeToLocationUpdates(callback: (loc: TabletLocation) => void) {
  locationListeners.add(callback);
  return () => {
    locationListeners.delete(callback);
  };
}

/**
 * Fetches all active tablet locations.
 */
export async function fetchTabletLocations(): Promise<TabletLocation[]> {
  try {
    const { data, error } = await supabase
      .from('tablet_locations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!error && data && data.length > 0) {
      data.forEach((loc) => {
        const canonicalId = resolveCanonicalTabletId(loc.user_id, loc.role, loc.device_name);
        memoryLocationsMap.set(canonicalId, { ...loc, id: canonicalId, user_id: canonicalId } as TabletLocation);
      });
    }
  } catch (err) {
    console.warn('Failed to fetch tablet locations from DB:', err);
  }

  const mapList = Array.from(memoryLocationsMap.values());
  const result: TabletLocation[] = [];

  DEFAULT_TABLETS.forEach((def) => {
    const found = mapList.find((m) => m.id === def.id || m.user_id === def.user_id);
    if (found) {
      result.push(found);
    } else {
      result.push(def);
    }
  });

  mapList.forEach((m) => {
    if (!result.some((r) => r.id === m.id)) {
      result.push(m);
    }
  });

  return result;
}

/**
 * Broadcasts a remote command (e.g. 'PLAY_SOUND' or 'REQUEST_LOCATION_PERMISSION') to target tablets.
 */
export async function sendRemoteCommand(
  targetUserId: string,
  command: 'PLAY_SOUND' | 'STOP_SOUND' | 'REQUEST_LOCATION_PERMISSION',
  targetName?: string,
  targetRole?: string
): Promise<void> {
  const payload: RemoteCommandPayload = {
    id: String(Date.now()),
    target_user_id: targetUserId,
    target_name: targetName,
    target_role: targetRole,
    command,
    timestamp: Date.now(),
  };

  // Dispatch locally & across browser tabs
  commandListeners.forEach((listener) => listener(payload));
  commandBroadcastChannel?.postMessage({ type: 'REMOTE_COMMAND', payload });

  try {
    const channel = supabase.channel('tablet_remote_commands');
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
 * Listens for remote commands directed to the current tablet user or role (e.g. T1, T2, T3).
 */
export function subscribeToRemoteCommands(
  currentUserId: string,
  currentRole: string,
  userName: string,
  callback: (cmd: RemoteCommandPayload) => void
) {
  const isTargetMatch = (cmd: RemoteCommandPayload): boolean => {
    if (cmd.target_user_id && cmd.target_user_id === currentUserId) return true;

    if (cmd.target_name) {
      const targetLower = cmd.target_name.toLowerCase();
      const userLower = (userName || '').toLowerCase();
      const roleLower = (currentRole || '').toLowerCase();

      if (userLower && userLower.includes(targetLower)) return true;
      if (roleLower && roleLower.includes(targetLower)) return true;

      // Handle canonical T1, T2, T3 matching
      if (targetLower.startsWith('t1') && (userLower.includes('t1') || roleLower === 'worker' || userLower.includes('worker'))) return true;
      if (targetLower.startsWith('t2') && (userLower.includes('t2') || roleLower === 't2')) return true;
      if (targetLower.startsWith('t3') && (userLower.includes('t3') || roleLower === 't3')) return true;
    }

    if (cmd.target_role && currentRole && currentRole.toLowerCase() === cmd.target_role.toLowerCase()) {
      return true;
    }

    return false;
  };

  const localHandler = (cmd: RemoteCommandPayload) => {
    if (isTargetMatch(cmd)) {
      callback(cmd);
    }
  };
  commandListeners.add(localHandler);

  const channel = supabase
    .channel('tablet_remote_commands')
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

// Web Audio API lost device alarm synthesizer
let audioCtx: AudioContext | null = null;
let alarmInterval: any = null;

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

/**
 * Synthesizes a loud, high-pitched double-beep lost tablet alarm.
 */
export function playFindMyAlarmSound(durationSeconds = 15) {
  initAudioContext();
  stopFindMyAlarmSound();

  const playBeep = () => {
    if (!audioCtx) initAudioContext();
    if (!audioCtx) return;

    try {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15); // High pitch alarm chirp

      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (err) {
      console.warn('Alarm sound playback error:', err);
    }
  };

  playBeep();
  alarmInterval = setInterval(playBeep, 450);

  setTimeout(() => {
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
}
