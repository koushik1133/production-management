-- ================================================
-- SALES MANAGER — Complete Database Schema
-- Safe to run multiple times, preserves all data
-- ================================================

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

-- Add extra columns if they don't already exist
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS vertical_order FLOAT8 DEFAULT 0;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS bay_vertical_order int8 DEFAULT 0;

-- BUG FIX: App stores production photos on the trailer record (base64),
-- but these columns were missing from the schema. Without them,
-- photo uploads in TrailerDetailsModal silently fail.
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS photo_1_url text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS photo_2_url text;
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS photo_3_url text;

-- 2. BAY SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.bay_settings (
  id text PRIMARY KEY,
  capacity integer DEFAULT 40,
  updated_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

-- Seed default bay capacities (safe, skips if already set)
INSERT INTO public.bay_settings (id, capacity)
VALUES ('B1', 40), ('B2', 80), ('B3', 80), ('B4', 80)
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
  sale_price numeric DEFAULT 0
);

-- 4. PRODUCTION MODELS TABLE
CREATE TABLE IF NOT EXISTS public.production_models (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text,
  target_hours jsonb,
  specs jsonb DEFAULT '{}'::jsonb
);

-- 5. DISABLE ROW LEVEL SECURITY (open access for all tables)
ALTER TABLE public.trailers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bay_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipped_trailers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_models DISABLE ROW LEVEL SECURITY;

-- 6. ENABLE REAL-TIME FOR ALL TABLES
--    Uses ALTER PUBLICATION ... ADD TABLE instead of DROP/CREATE
--    to avoid breaking active real-time connections on other browsers.
--    The DO block safely ignores "already exists" errors.
DO $$
BEGIN
  -- Create the publication if it doesn't exist at all
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- Add each table individually, ignoring if already added
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
END;
$$;

-- 7. GRANT PUBLIC ACCESS (ensures anon/authenticated keys can read/write)
GRANT ALL ON public.trailers TO anon, authenticated;
GRANT ALL ON public.bay_settings TO anon, authenticated;
GRANT ALL ON public.shipped_trailers TO anon, authenticated;
GRANT ALL ON public.production_models TO anon, authenticated;
