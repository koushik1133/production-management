import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.');
}

export function clearCorruptedSession() {
  try {
    supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  } catch (_) {}
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      Object.keys(window.localStorage).forEach((key) => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          window.localStorage.removeItem(key);
        }
      });
    }
  } catch (_) {}
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    // 15-second heartbeat keeps backgrounded tabs connected without hitting 60s browser throttle timeout
    heartbeatIntervalMs: 15000,
    // Smooth exponential backoff for reconnects
    reconnectAfterMs: (tries: number) => Math.min(tries * 1500, 20000),
    // 30-second timeout before reconnecting
    timeout: 30000,
  },
});
