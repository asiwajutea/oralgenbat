-- Add new columns to audits table for mobile materials and review tracking
ALTER TABLE audits 
ADD COLUMN IF NOT EXISTS mobile_zip_url TEXT,
ADD COLUMN IF NOT EXISTS mobile_zip_uploaded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

-- Create bucket for mobile zip files
INSERT INTO storage.buckets (id, name, public)
VALUES ('mobile-zips', 'mobile-zips', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for mobile-zips bucket
CREATE POLICY "Allow public uploads to mobile-zips"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'mobile-zips');

CREATE POLICY "Allow public access to mobile-zips"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'mobile-zips');

CREATE POLICY "Allow public updates to mobile-zips"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'mobile-zips');

CREATE POLICY "Allow public deletes from mobile-zips"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'mobile-zips');