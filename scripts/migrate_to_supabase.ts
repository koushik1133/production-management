import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; 

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function dataURLtoBuffer(dataurl: string): { buffer: Buffer, contentType: string } {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const contentType = mimeMatch ? mimeMatch[1] : '';
  const bstr = Buffer.from(arr[1], 'base64');
  return { buffer: bstr, contentType };
}

async function uploadToStorage(buffer: Buffer, contentType: string, bucket: string, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true
  });
  
  if (error) {
    console.error(`Failed to upload to ${bucket}/${path}:`, error.message);
    return null;
  }
  return data.path;
}

async function migrateProductionModels() {
  console.log("--- Migrating production_models ---");
  const { data: models, error } = await supabase.from('production_models').select('id, name, spec_sheet_template');
  if (error) { console.error(error); return; }

  for (const model of models) {
    if (model.spec_sheet_template && model.spec_sheet_template.startsWith('data:')) {
      console.log(`Migrating spec_sheet_template for model: ${model.name}`);
      const { buffer, contentType } = dataURLtoBuffer(model.spec_sheet_template);
      const safeName = model.name.replace(/[^a-zA-Z0-9]/g, '_');
      const uploadedPath = await uploadToStorage(buffer, contentType, 'trailers-files', `templates/${safeName}_Template.xlsx`);
      if (uploadedPath) {
        await supabase.from('production_models').update({ spec_sheet_template: uploadedPath }).eq('id', model.id);
        console.log(`Successfully migrated model ${model.name}`);
      }
    }
  }
}

async function migrateTrailers() {
  console.log("--- Migrating trailers ---");
  // Fetch only IDs first to prevent timeout
  const { data: trailerIds, error } = await supabase.from('trailers').select('id, serialNumber');
  if (error) { console.error("Failed to fetch trailer IDs", error); return; }

  console.log(`Found ${trailerIds.length} trailers. Migrating one by one...`);
  for (const t of trailerIds) {
    const { data: trailer, error: fetchErr } = await supabase.from('trailers')
      .select('id, serialNumber, photo_1_url, photo_2_url, photo_3_url, spec_sheet_file')
      .eq('id', t.id)
      .single();
      
    if (fetchErr || !trailer) {
      console.error(`Failed to fetch trailer ${t.id}`, fetchErr);
      continue;
    }

    const updates: any = {};
    let needsUpdate = false;
    const safeSerial = trailer.serialNumber ? trailer.serialNumber.replace(/[^a-zA-Z0-9]/g, '_') : 'Unknown';

    const checkAndUpload = async (field: string, base64Data: string, folder: string, ext: string) => {
      if (base64Data && base64Data.startsWith('data:')) {
        console.log(`Migrating ${field} for trailer: ${trailer.serialNumber}`);
        const { buffer, contentType } = dataURLtoBuffer(base64Data);
        const uploadedPath = await uploadToStorage(buffer, contentType, 'trailers-files', `${folder}/${safeSerial}_${field}.${ext}`);
        if (uploadedPath) {
          updates[field] = uploadedPath;
          needsUpdate = true;
        }
      }
    };

    await checkAndUpload('photo_1_url', trailer.photo_1_url, 'photos', 'jpg');
    await checkAndUpload('photo_2_url', trailer.photo_2_url, 'photos', 'jpg');
    await checkAndUpload('photo_3_url', trailer.photo_3_url, 'photos', 'jpg');
    await checkAndUpload('spec_sheet_file', trailer.spec_sheet_file, 'spec_sheets', 'xlsx');
    
    if (needsUpdate) {
      const { error: updateError } = await supabase.from('trailers').update(updates).eq('id', trailer.id);
      if (updateError) {
        console.error(`Failed to update DB for trailer ${trailer.serialNumber}`, updateError);
      } else {
        console.log(`Successfully migrated data for trailer ${trailer.serialNumber}`);
      }
    }
  }
}

async function migrateShippedTrailers() {
  console.log("--- Migrating shipped_trailers ---");
  const { data: shippedIds, error } = await supabase.from('shipped_trailers').select('serial_number');
  if (error) { console.error("Failed to fetch shipped_trailers", error); return; }

  console.log(`Found ${shippedIds.length} shipped trailers. Migrating one by one...`);
  for (const t of shippedIds) {
    const { data: trailer, error: fetchErr } = await supabase.from('shipped_trailers')
      .select('serial_number, photo_1_url, photo_2_url, photo_3_url, spec_sheet_file')
      .eq('serial_number', t.serial_number)
      .single();
      
    if (fetchErr || !trailer) {
      console.error(`Failed to fetch shipped trailer ${t.serial_number}`, fetchErr);
      continue;
    }

    const updates: any = {};
    let needsUpdate = false;
    const safeSerial = trailer.serial_number ? trailer.serial_number.replace(/[^a-zA-Z0-9]/g, '_') : 'Unknown';

    const checkAndUpload = async (field: string, base64Data: string, folder: string, ext: string) => {
      if (base64Data && base64Data.startsWith('data:')) {
        console.log(`Migrating ${field} for shipped trailer: ${trailer.serial_number}`);
        const { buffer, contentType } = dataURLtoBuffer(base64Data);
        const uploadedPath = await uploadToStorage(buffer, contentType, 'trailers-files', `${folder}/${safeSerial}_${field}.${ext}`);
        if (uploadedPath) {
          updates[field] = uploadedPath;
          needsUpdate = true;
        }
      }
    };

    await checkAndUpload('photo_1_url', trailer.photo_1_url, 'shipped', 'jpg');
    await checkAndUpload('photo_2_url', trailer.photo_2_url, 'shipped', 'jpg');
    await checkAndUpload('photo_3_url', trailer.photo_3_url, 'shipped', 'jpg');
    await checkAndUpload('spec_sheet_file', trailer.spec_sheet_file, 'shipped', 'xlsx');
    
    if (needsUpdate) {
      const { error: updateError } = await supabase.from('shipped_trailers').update(updates).eq('serial_number', trailer.serial_number);
      if (updateError) {
        console.error(`Failed to update DB for shipped trailer ${trailer.serial_number}`, updateError);
      } else {
        console.log(`Successfully migrated data for shipped trailer ${trailer.serial_number}`);
      }
    }
  }
}

async function run() {
  console.log("Starting Migration to Supabase Storage...");
  await migrateProductionModels();
  await migrateTrailers();
  await migrateShippedTrailers();
  console.log("Migration Complete.");
}

run();
