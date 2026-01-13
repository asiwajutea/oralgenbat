-- Fix the notify_re_audit function to look up reviewer UUID from profiles table
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
  
  -- Look up the reviewer's user ID from profiles by name
  IF v_reviewer_name IS NOT NULL THEN
    SELECT id INTO v_original_reviewer_id
    FROM public.profiles
    WHERE full_name = v_reviewer_name
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