-- Create Supabase Storage bucket for trailer files
-- Run this in your Supabase SQL Editor

-- Insert storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('trailers-files', 'trailers-files', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for the bucket
-- Allow public read access
CREATE POLICY "Allow public read access on trailers-files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'trailers-files');

-- Allow authenticated users to upload
CREATE POLICY "Allow authenticated users to upload to trailers-files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'trailers-files');

-- Allow authenticated users to delete their own files
CREATE POLICY "Allow authenticated users to delete from trailers-files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'trailers-files');

-- Allow authenticated users to update files
CREATE POLICY "Allow authenticated users to update trailers-files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'trailers-files')
WITH CHECK (bucket_id = 'trailers-files');
