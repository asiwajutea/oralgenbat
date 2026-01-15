-- Add resolve_comment column to interview_assignments
ALTER TABLE public.interview_assignments 
ADD COLUMN IF NOT EXISTS resolve_comment text;

-- Create or replace the notification trigger function for resolved issues
CREATE OR REPLACE FUNCTION public.notify_issue_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_file_name TEXT;
BEGIN
  IF NEW.issue_resolved_at IS NOT NULL AND OLD.issue_resolved_at IS NULL THEN
    SELECT file_name INTO v_file_name 
    FROM public.audits 
    WHERE id = NEW.audit_id;
    
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    VALUES (
      NEW.flagged_by,
      'issue_resolved',
      'Issue Resolved',
      'Your flagged issue for interview ' || COALESCE(v_file_name, 'Unknown') || ' has been resolved.',
      jsonb_build_object(
        'audit_id', NEW.audit_id,
        'file_name', v_file_name,
        'resolved_by', NEW.issue_resolved_by,
        'resolve_comment', NEW.resolve_comment
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create the trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_notify_issue_resolved ON public.interview_assignments;
CREATE TRIGGER trigger_notify_issue_resolved
  AFTER UPDATE ON public.interview_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_issue_resolved();