import fetch from 'node-fetch';

const SUPABASE_URL = 'https://fjwzzdmknvihsxtnrsrb.supabase.co';
const ANON_KEY = 'sb_publishable_NCxgKBBa4bbf_nphwhJbBg_wskPATLV';

const columns = 'id,name,model,serialNumber,station,dateStarted,currentPhase,history,partsStatus,finishingType,isArchived,archivedAt,isDeleted,invoiceNumber,vinDate,expectedDueDate,promisedShippingDate,notes,isPriority,updated_at,vertical_order,bay_vertical_order,photo_1_url,photo_2_url,photo_3_url,sale_price,trailer_color,trailer_plug,sales_person,dealer_location,dealer_common_address,dealer_id,spec_sheet_versions'.split(',');

async function testColumns() {
  const missing = [];
  for (const col of columns) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/trailers?select=${col}&limit=1`, {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`
      }
    });
    if (!res.ok) {
      console.log(`❌ Missing column: ${col}`);
      missing.push(col);
    } else {
      console.log(`✅ OK: ${col}`);
    }
  }
  console.log("\n--- RESULT ---");
  console.log(missing.length > 0 ? `Missing columns: ${missing.join(', ')}` : "All columns exist!");
}

testColumns();
