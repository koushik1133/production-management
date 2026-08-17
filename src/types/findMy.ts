export interface TabletLocation {
  id: string;
  user_id: string;
  device_name: string;
  role?: string;
  is_alarm_playing?: boolean;
  alarm_started_at?: string | null;
  is_online?: boolean;
  last_ping_at?: string;
  updated_at?: string;
}

export interface RemoteCommandPayload {
  id: string;
  target_user_id?: string;
  target_role?: string;
  target_name?: string; // e.g. 'T1', 'T2', 'T3', 'Manager'
  command: 'PLAY_SOUND' | 'STOP_SOUND' | 'REQUEST_LOCATION_PERMISSION';
  timestamp: number;
}
