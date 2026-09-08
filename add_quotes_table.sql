-- ========================================================
-- Safe Migration: Create quotes table for permanent backup
-- ========================================================

CREATE TABLE IF NOT EXISTS public.quotes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trailer_id      text,
  serial_number   text NOT NULL,
  model           text,
  dealer_name     text,
  sale_price      numeric,
  trailer_color   text,
  trailer_plug    text,
  sales_person    text,
  dealer_location text,
  dealer_address  text,
  purchase_order  text,
  consignment     text,
  quote_file_path text,
  notes           text,
  status          text DEFAULT 'quote',
  created_at      timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotes_serial_number ON public.quotes (serial_number);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON public.quotes (created_at DESC);

-- Enable RLS and grant permissions
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'quotes' AND policyname = 'Allow all for quotes'
  ) THEN
    CREATE POLICY "Allow all for quotes" ON public.quotes FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.quotes TO anon, authenticated;

-- Add quotes to Realtime publication if available
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quotes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
