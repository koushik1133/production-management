import fetch from 'node-fetch';

const SUPABASE_URL = 'https://fjwzzdmknvihsxtnrsrb.supabase.co';
const ANON_KEY = 'sb_publishable_NCxgKBBa4bbf_nphwhJbBg_wskPATLV';

async function testOthers() {
  const dRes = await fetch(`${SUPABASE_URL}/rest/v1/dealers?select=*&limit=1`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  });
  console.log(`Dealers Table: ${dRes.ok ? '✅ OK' : '❌ Failed (' + dRes.statusText + ')'}`);

  const sRes = await fetch(`${SUPABASE_URL}/rest/v1/shipped_trailers?select=*&limit=1`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  });
  console.log(`Shipped Table: ${sRes.ok ? '✅ OK' : '❌ Failed (' + sRes.statusText + ')'}`);
}

testOthers();
