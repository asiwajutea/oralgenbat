-- Add "Awaiting Review" to the audit_status enum
ALTER TYPE audit_status ADD VALUE IF NOT EXISTS 'Awaiting Review';