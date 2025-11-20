-- Create interview_metadata table with audio analysis fields
CREATE TABLE IF NOT EXISTS interview_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
  
  -- Parsed from ZIP filename (NG71_711_20251104_0908)
  contractor_id TEXT NOT NULL,
  interviewer_code TEXT NOT NULL,
  interview_date DATE NOT NULL,
  interview_time TIME NOT NULL,
  
  -- Interviewee Details (from metadata.json)
  interviewee_title TEXT,
  interviewee_name TEXT,
  interviewee_age INTEGER,
  interviewee_birth_year INTEGER,
  interviewee_tribe TEXT,
  interviewee_clan TEXT,
  interviewee_birth_location TEXT,
  interviewee_phone TEXT,
  
  -- Interview Details
  interview_language TEXT,
  first_ancestor TEXT,
  total_names INTEGER,
  interview_location TEXT,
  
  -- Interviewer Details
  interviewer_id TEXT,
  interviewer_name TEXT,
  field_manager TEXT,
  
  -- Contractor Details
  contractor_business_name TEXT,
  
  -- Audio Analysis Fields
  family_story_duration INTEGER, -- in seconds
  family_story_noise_level DECIMAL(5,2), -- percentage 0-100+
  family_story_silence_level DECIMAL(5,2), -- percentage 0-100+
  pedigree_segment_duration INTEGER, -- in seconds
  pedigree_segment_noise_level DECIMAL(5,2), -- percentage 0-100+
  pedigree_segment_silence_level DECIMAL(5,2), -- percentage 0-100+
  audio_quality_summary TEXT, -- AI-generated summary
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_metadata_audit_id ON interview_metadata(audit_id);

-- Create interview_photos table (renamed from interview_media, only for photos)
CREATE TABLE IF NOT EXISTS interview_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_photos_audit_id ON interview_photos(audit_id);
CREATE INDEX IF NOT EXISTS idx_interview_photos_order ON interview_photos(audit_id, display_order);

-- Enable RLS
ALTER TABLE interview_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_photos ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all operations on interview_metadata" ON interview_metadata FOR ALL USING (true);
CREATE POLICY "Allow all operations on interview_photos" ON interview_photos FOR ALL USING (true);

-- Create storage bucket for interview photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('interview-photos', 'interview-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for interview photos
CREATE POLICY "Public access to interview photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'interview-photos');

CREATE POLICY "Authenticated users can upload interview photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'interview-photos');

-- Add trigger for updated_at
CREATE TRIGGER update_interview_metadata_updated_at
BEFORE UPDATE ON interview_metadata
FOR EACH ROW
EXECUTE FUNCTION update_last_modified_column();