-- Add audio URL columns and confirmation flag to interview_metadata
ALTER TABLE interview_metadata 
ADD COLUMN IF NOT EXISTS family_story_audio_url TEXT,
ADD COLUMN IF NOT EXISTS pedigree_segment_audio_url TEXT,
ADD COLUMN IF NOT EXISTS duration_manually_confirmed BOOLEAN DEFAULT FALSE;

-- Create interview-audio storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('interview-audio', 'interview-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated approved users to view audio
CREATE POLICY "Approved users can view audio"
ON storage.objects FOR SELECT
USING (bucket_id = 'interview-audio' AND is_user_approved(auth.uid()));

-- Allow service role to manage audio (for edge functions)
CREATE POLICY "Service role can insert audio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'interview-audio');

CREATE POLICY "Service role can delete audio"
ON storage.objects FOR DELETE
USING (bucket_id = 'interview-audio');