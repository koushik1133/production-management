import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env if present
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''; // Assuming anon key has enough privileges or we use service role

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
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
  return data.path; // e.g. "templates/ModelName_Template.xlsx"
}

async function migrateProductionModels() {
  console.log("--- Migrating production_models ---");
  const { data: models, error } = await supabase.from('production_models').select('id, name, spec_sheet_template');
  
  if (error) {
    console.error("Failed to fetch production models", error);
    return;
  }

  for (const model of models) {
    if (model.spec_sheet_template && model.spec_sheet_template.startsWith('data:')) {
      console.log(`Migrating spec_sheet_template for model: ${model.name}`);
      const { buffer, contentType } = dataURLtoBuffer(model.spec_sheet_template);
      const safeName = model.name.replace(/[^a-zA-Z0-9]/g, '_');
      const storagePath = `templates/${safeName}_Template.xlsx`;
      
      const uploadedPath = await uploadToStorage(buffer, contentType, 'trailers-files', storagePath);
      
      if (uploadedPath) {
        // Update database with the path
        const { error: updateError } = await supabase.from('production_models')
          .update({ spec_sheet_template: uploadedPath })
          .eq('id', model.id);
          
        if (updateError) {
          console.error(`Failed to update DB for model ${model.name}`, updateError);
        } else {
          console.log(`Successfully migrated model ${model.name}`);
        }
      }
    } else {
      console.log(`Skipping model ${model.name} - already migrated or empty.`);
    }
  }
}

async function migrateTrailers() {
  console.log("--- Migrating trailers (photos & spec sheets) ---");
  // Select only fields that might have base64 data to avoid fetching huge datasets
  let page = 0;
  const pageSize = 10;
  let hasMore = true;

  while (hasMore) {
    const { data: trailers, error } = await supabase.from('trailers')
      .select('id, serialNumber, photo_1_url, photo_2_url, photo_3_url, spec_sheet_file')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error) {
      console.error("Failed to fetch trailers", error);
      return;
    }

    if (!trailers || trailers.length === 0) {
      hasMore = false;
      break;
    }

  for (const trailer of trailers) {
    const updates: any = {};
    let needsUpdate = false;
    const safeSerial = trailer.serialNumber ? trailer.serialNumber.replace(/[^a-zA-Z0-9]/g, '_') : 'Unknown';

    const checkAndUpload = async (field: string, base64Data: string, folder: string, ext: string) => {
      if (base64Data && base64Data.startsWith('data:')) {
        console.log(`Migrating ${field} for trailer: ${trailer.serialNumber}`);
        const { buffer, contentType } = dataURLtoBuffer(base64Data);
        const storagePath = `${folder}/${safeSerial}_${field}.${ext}`;
        const uploadedPath = await uploadToStorage(buffer, contentType, 'trailers-files', storagePath);
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
      const { error: updateError } = await supabase.from('trailers')
        .update(updates)
        .eq('id', trailer.id);
        
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
  const { data: shipped, error } = await supabase.from('shipped_trailers').select('serial_number, photo_1_url, photo_2_url, photo_3_url, spec_sheet_file');
  
  if (error) {
    console.error("Failed to fetch shipped_trailers", error);
    return;
  }

  for (const trailer of shipped) {
    const updates: any = {};
    let needsUpdate = false;
    const safeSerial = trailer.serial_number ? trailer.serial_number.replace(/[^a-zA-Z0-9]/g, '_') : 'Unknown';

    const checkAndUpload = async (field: string, base64Data: string, folder: string, ext: string) => {
      if (base64Data && base64Data.startsWith('data:')) {
        console.log(`Migrating ${field} for shipped trailer: ${trailer.serial_number}`);
        const { buffer, contentType } = dataURLtoBuffer(base64Data);
        const storagePath = `${folder}/${safeSerial}_${field}.${ext}`;
        const uploadedPath = await uploadToStorage(buffer, contentType, 'trailers-files', storagePath);
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
      const { error: updateError } = await supabase.from('shipped_trailers')
        .update(updates)
        .eq('serial_number', trailer.serial_number);
        
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
