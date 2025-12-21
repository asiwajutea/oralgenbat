-- Add review_duration_seconds column to audits table to track how long reviews take
ALTER TABLE public.audits ADD COLUMN review_duration_seconds INTEGER DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.audits.review_duration_seconds IS 'Duration in seconds the reviewer spent reviewing this audit before submitting';