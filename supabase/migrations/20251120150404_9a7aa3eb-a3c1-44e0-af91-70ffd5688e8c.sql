-- Add review-related columns to audits table
ALTER TABLE audits 
ADD COLUMN IF NOT EXISTS review_comment TEXT,
ADD COLUMN IF NOT EXISTS action_plan TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;