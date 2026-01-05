-- Add export tracking columns to interview_assignments
ALTER TABLE public.interview_assignments
ADD COLUMN exported_at TIMESTAMPTZ,
ADD COLUMN export_batch_id TEXT;