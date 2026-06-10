ALTER TABLE trailers 
ADD COLUMN IF NOT EXISTS "salesPerson" text,
ADD COLUMN IF NOT EXISTS "dealerLocation" text,
ADD COLUMN IF NOT EXISTS "dealerCommonAddress" text;
