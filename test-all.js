import fetch from 'node-fetch';

const SUPABASE_URL = 'https://fjwzzdmknvihsxtnrsrb.supabase.co';
const ANON_KEY = 'sb_publishable_NCxgKBBa4bbf_nphwhJbBg_wskPATLV';

async function testAllTables() {
  const tables = ['production_models', 'bay_settings', 'dealers', 'shipped_trailers'];
  
  for (const table of tables) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    console.log(`Table '${table}': ${res.ok ? '✅ OK' : '❌ Failed (' + res.statusText + ')'}`);
  }
}

testAllTables();
