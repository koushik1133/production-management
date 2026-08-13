export interface TabletLocation {
  id: string;
  user_id: string;
  device_name: string;
  role: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  battery_level?: number; // 0.0 - 1.0
  is_charging?: boolean;
  is_online: boolean;
  permission_approved?: boolean;
  last_ping_at: string;
  updated_at: string;
}

export interface RemoteCommandPayload {
  id: string;
  target_user_id?: string;
  target_role?: string;
  target_name?: string; // e.g. 'T1', 'T2', 'T3', 'Manager'
  command: 'PLAY_SOUND' | 'STOP_SOUND' | 'REQUEST_LOCATION_PERMISSION';
  timestamp: number;
}
