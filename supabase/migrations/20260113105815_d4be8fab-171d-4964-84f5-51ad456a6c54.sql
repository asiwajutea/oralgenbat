-- Add UPDATE policy for audit-pdfs bucket to allow file overwrites
CREATE POLICY "Authenticated approved users can update audit PDFs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'audit-pdfs'
  AND public.is_user_approved(auth.uid())
)
WITH CHECK (
  bucket_id = 'audit-pdfs'
  AND public.is_user_approved(auth.uid())
);

-- Add UPDATE policy for mobile-zips bucket as well
CREATE POLICY "Authenticated approved users can update mobile zips"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'mobile-zips'
  AND public.is_user_approved(auth.uid())
)
WITH CHECK (
  bucket_id = 'mobile-zips'
  AND public.is_user_approved(auth.uid())
);

-- Update notify_re_audit function to trim and case-insensitive match reviewer name
CREATE OR REPLACE FUNCTION public.notify_re_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reviewer_name TEXT;
  v_original_reviewer_id UUID;
  v_file_name TEXT;
BEGIN
  -- Get the reviewer name and file name from the audit
  SELECT reviewed_by, file_name 
  INTO v_reviewer_name, v_file_name
  FROM public.audits
  WHERE id = NEW.audit_id;
  
  -- Look up the reviewer's user ID from profiles by name (trimmed and case-insensitive)
  IF v_reviewer_name IS NOT NULL THEN
    SELECT id INTO v_original_reviewer_id
    FROM public.profiles
    WHERE lower(btrim(full_name)) = lower(btrim(v_reviewer_name))
    LIMIT 1;
  END IF;
  
  -- Notify the original reviewer if found
  IF v_original_reviewer_id IS NOT NULL THEN
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    VALUES (
      v_original_reviewer_id,
      're_audit',
      'Re-Audit Submitted',
      'Interview "' || v_file_name || '" has been resubmitted for review',
      jsonb_build_object('audit_id', NEW.audit_id, 'file_name', v_file_name, 'submission_id', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$function$;