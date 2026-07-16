ALTER TABLE trailers 
ADD COLUMN IF NOT EXISTS "purchase_order" text,
ADD COLUMN IF NOT EXISTS "consignment" text;
