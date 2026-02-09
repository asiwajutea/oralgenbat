
-- Create per-user comment read tracking table
CREATE TABLE public.artifact_comment_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.artifact_correction_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Enable RLS
ALTER TABLE public.artifact_comment_reads ENABLE ROW LEVEL SECURITY;

-- Users can view their own reads
CREATE POLICY "Users can view own reads"
ON public.artifact_comment_reads FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own reads
CREATE POLICY "Users can insert own reads"
ON public.artifact_comment_reads FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own reads
CREATE POLICY "Users can update own reads"
ON public.artifact_comment_reads FOR UPDATE
USING (auth.uid() = user_id);
