import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    // Increase heartbeat so idle tabs don't spam the server
    heartbeatIntervalMs: 30000,
    // Supabase default reconnect is very aggressive; back off to reduce pool pressure
    reconnectAfterMs: (tries: number) => Math.min(tries * 2000, 30000),
    // Longer timeout before considering a connection dead
    timeout: 60000,
  },
});
