-- ========================================================
-- Safe Migration: Add shipping_cost to trailers and shipped_trailers
-- ========================================================

-- 1. Add shipping_cost to public.trailers
ALTER TABLE public.trailers ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0;

-- 2. Add shipping_cost to public.shipped_trailers
ALTER TABLE public.shipped_trailers ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0;

-- 3. Refresh PostgREST schema cache so columns are immediately accessible via API
NOTIFY pgrst, 'reload schema';
