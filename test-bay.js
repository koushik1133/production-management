import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
  const { data, error } = await supabase.from('bay_settings').upsert({ id: 'B1', capacity: 45, updated_at: new Date().toISOString() }, { onConflict: 'id' }).select();
  console.log('Upsert result:', { data, error });
}
test();
