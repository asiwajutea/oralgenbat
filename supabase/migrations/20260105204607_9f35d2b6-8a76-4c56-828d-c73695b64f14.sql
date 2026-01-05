-- Add artifact_correction column to audits table
ALTER TABLE public.audits 
ADD COLUMN artifact_correction text[] DEFAULT NULL;

COMMENT ON COLUMN public.audits.artifact_correction IS 
'Array of artifact types needing correction: scanned_pdf, mobile_metadata';