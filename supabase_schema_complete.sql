-- ========================================================
-- SALES MANAGER — Consolidated & Audited Database Schema
-- Safe to run multiple times, preserves all existing data
-- ========================================================

-- 1. TRAILERS TABLE
CREATE TABLE IF NOT EXISTS public.trailers (
  id text PRIMARY KEY,
  name text,
  model text,
  "serialNumber" text,
  station text,
  "dateStarted" bigint,
  "currentPhase" text,
  history jsonb DEFAULT '[]'::jsonb,
  "partsStatus" jsonb DEFAULT '{"tyres": false, "steel": false, "parts": false}'::jsonb,
  "finishingType" text,
  "isArchived" boolean DEFAULT false,
  "archivedAt" bigint,
  "isDeleted" boolean DEFAULT false,
  "invoiceNumber" text,
  "vinDate" text,
  "expectedDueDate" text,
  "promisedShippingDate" text,
  notes text,
  "isPriority" boolean DEFAULT false,
  updated_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

-- Add extra columns to trailers if they don't exist
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS vertical_order float8 DEFAULT 0;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS bay_vertical_order int8 DEFAULT 0;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS photo_1_url text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS photo_2_url text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS photo_3_url text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS spec_sheet_file text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS inspection_sheet_file text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS sales_person text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS dealer_location text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS dealer_common_address text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS dealer_id text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS spec_sheet_versions jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS sale_price numeric;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS trailer_color text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS trailer_plug text;

-- 2. BAY SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.bay_settings (
  id text PRIMARY KEY,
  capacity integer DEFAULT 40,
  updated_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

-- Seed default bay capacities
INSERT INTO public.bay_settings (id, capacity)
VALUES
  ('B1', 40),
  ('B2', 80),
  ('B3', 80),
  ('B4', 80)
ON CONFLICT (id) DO NOTHING;

-- 3. SHIPPED TRAILERS TABLE
CREATE TABLE IF NOT EXISTS public.shipped_trailers (
  serial_number text PRIMARY KEY,
  trailer_name text NOT NULL,
  customer_name text,
  vin_date date NOT NULL,
  invoice_number text NOT NULL,
  shipped_at timestamptz DEFAULT now(),
  total_hours numeric DEFAULT 0,
  prefab_hours numeric DEFAULT 0,
  build_hours numeric DEFAULT 0,
  paint_hours numeric DEFAULT 0,
  outsource_hours numeric DEFAULT 0,
  trim_hours numeric DEFAULT 0,
  photo_1_url text,
  photo_2_url text,
  photo_3_url text,
  sale_price numeric DEFAULT 0,
  spec_sheet_file text,
  inspection_sheet_file text
);

ALTER TABLE public.shipped_trailers ADD COLUMN IF NOT EXISTS spec_sheet_file text;
ALTER TABLE public.shipped_trailers ADD COLUMN IF NOT EXISTS inspection_sheet_file text;

-- 4. PRODUCTION MODELS TABLE
CREATE TABLE IF NOT EXISTS public.production_models (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  category text,
  target_hours jsonb,
  specs jsonb DEFAULT '{}'::jsonb,
  spec_sheet_template text
);

ALTER TABLE public.production_models ADD COLUMN IF NOT EXISTS spec_sheet_template text;

-- 5. DEALERS TABLE
CREATE TABLE IF NOT EXISTS public.dealers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL UNIQUE,
  addresses jsonb DEFAULT '[]'::jsonb,
  common_address text,
  updated_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

-- Seed default dealers for instant UI compatibility
INSERT INTO public.dealers (name, addresses, common_address)
VALUES 
  ('Test 1', '["Address 1", "Address 2"]'::jsonb, '123 Common St, Test 1 HQ'),
  ('Test 2', '["Address A", "Address B"]'::jsonb, '456 Default Blvd, Test 2 Base')
ON CONFLICT (name) DO NOTHING;

-- 6. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
ALTER TABLE public.trailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bay_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipped_trailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;

-- Drop existing open access policies to avoid duplicates
DROP POLICY IF EXISTS "Enable all access for all users" ON public.trailers;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.bay_settings;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.shipped_trailers;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.production_models;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.dealers;

-- Create open access policies for anonymous and authenticated clients
CREATE POLICY "Enable all access for all users" ON public.trailers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON public.bay_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON public.shipped_trailers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON public.production_models FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON public.dealers FOR ALL USING (true) WITH CHECK (true);

-- 7. GRANT PUBLIC ACCESS (Anon & Authenticated Roles)
GRANT ALL ON TABLE public.trailers TO anon, authenticated;
GRANT ALL ON TABLE public.bay_settings TO anon, authenticated;
GRANT ALL ON TABLE public.shipped_trailers TO anon, authenticated;
GRANT ALL ON TABLE public.production_models TO anon, authenticated;
GRANT ALL ON TABLE public.dealers TO anon, authenticated;

-- 8. CONFIGURE REAL-TIME PUBLICATION
DO $$
BEGIN
  -- Create the publication if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- Add tables individually, ignoring if already added
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trailers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bay_settings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shipped_trailers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.production_models;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dealers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;

-- 9. CREATE STORAGE BUCKETS AND CONFIGURATION
-- Safe to execute, creates trailers-files bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('trailers-files', 'trailers-files', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies to ensure clean creation
DROP POLICY IF EXISTS "Allow public read access on trailers-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads to trailers-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletions from trailers-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates to trailers-files" ON storage.objects;

-- Allow public read access to objects
CREATE POLICY "Allow public read access on trailers-files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'trailers-files');

-- CRITICAL FIX: Allow both anonymous and authenticated roles to upload
CREATE POLICY "Allow uploads to trailers-files"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'trailers-files');

-- CRITICAL FIX: Allow both anonymous and authenticated roles to delete
CREATE POLICY "Allow deletions from trailers-files"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'trailers-files');

-- CRITICAL FIX: Allow both anonymous and authenticated roles to update
CREATE POLICY "Allow updates to trailers-files"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'trailers-files')
WITH CHECK (bucket_id = 'trailers-files');

-- 10. schema refresh
NOTIFY pgrst, 'reload schema';
