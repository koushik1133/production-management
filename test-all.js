import fetch from 'node-fetch';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

async function testAllTables() {
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.");
    process.exit(1);
  }

  const tables = ['production_models', 'bay_settings', 'dealers', 'shipped_trailers'];
  
  for (const table of tables) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    console.log(`Table '${table}': ${res.ok ? '✅ OK' : '❌ Failed (' + res.statusText + ')'}`);
  }
}

testAllTables();
