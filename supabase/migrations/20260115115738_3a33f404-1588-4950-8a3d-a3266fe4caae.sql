-- Add issue flagging columns to interview_assignments
ALTER TABLE public.interview_assignments
ADD COLUMN IF NOT EXISTS is_flagged_for_issue boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS issue_comment text,
ADD COLUMN IF NOT EXISTS flagged_by uuid,
ADD COLUMN IF NOT EXISTS flagged_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS issue_resolved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS issue_resolved_by uuid;

-- Create function to notify on issue flagging
CREATE OR REPLACE FUNCTION public.notify_flagged_issue()
RETURNS TRIGGER AS $$
DECLARE
  audit_record RECORD;
  metadata_record RECORD;
  manager_ids uuid[];
BEGIN
  -- Only trigger when is_flagged_for_issue changes to true
  IF NEW.is_flagged_for_issue = true AND (OLD.is_flagged_for_issue IS NULL OR OLD.is_flagged_for_issue = false) THEN
    -- Get audit info
    SELECT file_name INTO audit_record FROM public.audits WHERE id = NEW.audit_id;
    
    -- Get metadata for contractor info
    SELECT contractor_id, field_manager INTO metadata_record 
    FROM public.interview_metadata WHERE audit_id = NEW.audit_id LIMIT 1;
    
    -- Get field managers and sub-contractors for this contractor
    SELECT ARRAY_AGG(DISTINCT ur.user_id) INTO manager_ids
    FROM public.user_roles ur
    JOIN public.profiles p ON ur.user_id = p.id
    WHERE ur.role IN ('field_manager', 'sub_contractor')
    AND (p.contractor_id = metadata_record.contractor_id OR p.active_contractor_id = metadata_record.contractor_id);
    
    -- Create notifications for each manager
    IF manager_ids IS NOT NULL THEN
      INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
      SELECT 
        unnest(manager_ids),
        'issue_flagged',
        'Interview Flagged for Issue',
        'Interview ' || COALESCE(audit_record.file_name, NEW.audit_id::text) || ' has been flagged for an issue.',
        jsonb_build_object(
          'audit_id', NEW.audit_id,
          'file_name', audit_record.file_name,
          'issue_comment', NEW.issue_comment,
          'flagged_by', NEW.flagged_by
        );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to notify on issue resolution
CREATE OR REPLACE FUNCTION public.notify_issue_resolved()
RETURNS TRIGGER AS $$
DECLARE
  audit_record RECORD;
BEGIN
  -- Only trigger when issue is resolved (issue_resolved_at changes from null to a value)
  IF NEW.issue_resolved_at IS NOT NULL AND OLD.issue_resolved_at IS NULL AND NEW.flagged_by IS NOT NULL THEN
    -- Get audit info
    SELECT file_name INTO audit_record FROM public.audits WHERE id = NEW.audit_id;
    
    -- Notify the data entry clerk who flagged it
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    VALUES (
      NEW.flagged_by,
      'issue_resolved',
      'Issue Resolved',
      'The issue you flagged on interview ' || COALESCE(audit_record.file_name, NEW.audit_id::text) || ' has been resolved.',
      jsonb_build_object(
        'audit_id', NEW.audit_id,
        'file_name', audit_record.file_name,
        'resolved_by', NEW.issue_resolved_by
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers
DROP TRIGGER IF EXISTS on_issue_flagged ON public.interview_assignments;
CREATE TRIGGER on_issue_flagged
  AFTER UPDATE ON public.interview_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_flagged_issue();

DROP TRIGGER IF EXISTS on_issue_resolved ON public.interview_assignments;
CREATE TRIGGER on_issue_resolved
  AFTER UPDATE ON public.interview_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_issue_resolved();