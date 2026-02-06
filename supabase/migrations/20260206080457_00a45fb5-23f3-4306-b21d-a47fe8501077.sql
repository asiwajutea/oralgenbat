-- Add columns to track artifact correction resolution for failed interviews
ALTER TABLE audits ADD COLUMN IF NOT EXISTS artifact_correction_resolved_at timestamptz;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS artifact_correction_resolved_by uuid;