import fetch from 'node-fetch';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

async function testOthers() {
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.");
    process.exit(1);
  }

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
