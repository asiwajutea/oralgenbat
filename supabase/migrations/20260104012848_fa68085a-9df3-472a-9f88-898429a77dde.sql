-- Add typing_status column to interview_assignments
ALTER TABLE public.interview_assignments
ADD COLUMN typing_status TEXT DEFAULT 'typing_in_progress' 
CHECK (typing_status IN ('typing_in_progress', 'typing_completed'));

-- Add completed_at timestamp
ALTER TABLE public.interview_assignments
ADD COLUMN typing_completed_at TIMESTAMPTZ;

-- Enable realtime for interview_assignments
ALTER PUBLICATION supabase_realtime ADD TABLE public.interview_assignments;