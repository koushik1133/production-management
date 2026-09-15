-- ==============================================================================
-- Migration: Add LAD Drone Trailer Options (lad_options) to Supabase Tables
-- Cells: L29 (Dual Hydraulic Jacks), L30 (Bumper Pull Setup),
--        L31 (Dual Side Platforms), L32 (Single Side Platforms)
-- ==============================================================================

-- 1. Trailers Table (Live board & Backlog)
ALTER TABLE public.trailers 
  ADD COLUMN IF NOT EXISTS lad_options jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "ladOptions" jsonb DEFAULT '{}'::jsonb;

-- 2. Quotes Table (Permanent Quote History)
ALTER TABLE public.quotes 
  ADD COLUMN IF NOT EXISTS lad_options jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "ladOptions" jsonb DEFAULT '{}'::jsonb;

-- 3. Quotes Denied Table
ALTER TABLE public.quotes_denied 
  ADD COLUMN IF NOT EXISTS lad_options jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "ladOptions" jsonb DEFAULT '{}'::jsonb;

-- 4. Shipped Trailers Table (Archive)
ALTER TABLE public.shipped_trailers 
  ADD COLUMN IF NOT EXISTS lad_options jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "ladOptions" jsonb DEFAULT '{}'::jsonb;

-- 5. Refresh PostgREST API schema cache so newly added columns are instantly available
NOTIFY pgrst, 'reload schema';
