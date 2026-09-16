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
    if (typeof window !== 'undefined') {
      if (window.localStorage) {
        Object.keys(window.localStorage).forEach((key) => {
          if (key.includes('auth-token') || key.startsWith('sb-')) {
            window.localStorage.removeItem(key);
          }
        });
      }
      if (window.sessionStorage) {
        Object.keys(window.sessionStorage).forEach((key) => {
          if (key.includes('auth-token') || key.startsWith('sb-')) {
            window.sessionStorage.removeItem(key);
          }
        });
      }
    }
  } catch (_) {}
}

// Global safety listener: catch stale token refresh 500s from Supabase GoTrue and clear bad tokens
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const msg = String(reason?.message || reason || '').toLowerCase();
    const status = reason?.status;
    if (status === 500 && (msg.includes('token') || msg.includes('auth') || msg.includes('gotrue'))) {
      console.warn('Caught unhandled auth 500 error from GoTrue, clearing stale credentials:', msg);
      clearCorruptedSession();
    }
  });
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
