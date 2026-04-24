-- Add re_audit_note column to capture special instructions for the next reviewer
ALTER TABLE public.re_audit_submissions
ADD COLUMN IF NOT EXISTS re_audit_note text;

-- Update mark_audit_for_reaudit RPC to accept and persist the optional special note
CREATE OR REPLACE FUNCTION public.mark_audit_for_reaudit(
  _audit_id UUID,
  _submitted_by UUID,
  _submitted_by_role app_role,
  _comment TEXT,
  _new_pdf_url TEXT DEFAULT NULL,
  _new_zip_url TEXT DEFAULT NULL,
  _re_audit_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE audits
  SET
    is_re_audit = true,
    re_audit_count = re_audit_count + 1,
    original_status = CASE WHEN original_status IS NULL THEN status ELSE original_status END,
    status = 'Awaiting Review'::audit_status,
    file_url = COALESCE(_new_pdf_url, file_url),
    mobile_zip_url = COALESCE(_new_zip_url, mobile_zip_url),
    last_modified = now()
  WHERE id = _audit_id;

  INSERT INTO re_audit_submissions (
    audit_id,
    submitted_by,
    submitted_by_role,
    submission_comment,
    replaced_pdf,
    replaced_zip,
    new_pdf_url,
    new_zip_url,
    re_audit_note
  ) VALUES (
    _audit_id,
    _submitted_by,
    _submitted_by_role,
    _comment,
    _new_pdf_url IS NOT NULL,
    _new_zip_url IS NOT NULL,
    _new_pdf_url,
    _new_zip_url,
    _re_audit_note
  );
END;
$$;