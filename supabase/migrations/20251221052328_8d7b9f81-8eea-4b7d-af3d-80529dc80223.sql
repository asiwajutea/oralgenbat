-- Add locking columns to audits table for interview locking system
ALTER TABLE public.audits
ADD COLUMN locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN locked_at timestamp with time zone DEFAULT NULL;

-- Add indexes for efficient locking queries
CREATE INDEX idx_audits_locked_by ON public.audits(locked_by) WHERE locked_by IS NOT NULL;
CREATE INDEX idx_audits_locked_at ON public.audits(locked_at) WHERE locked_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.audits.locked_by IS 'User ID who has locked this audit for review';
COMMENT ON COLUMN public.audits.locked_at IS 'Timestamp when the audit was locked for review';