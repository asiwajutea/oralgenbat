
-- Trigger function: auto-complete interview assignments when payment is recorded
CREATE OR REPLACE FUNCTION public.auto_complete_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_audit_id uuid;
  v_assignment_id uuid;
BEGIN
  -- Find the audit_id: use NEW.audit_id if set, otherwise match by folder_name = audits.file_name
  v_audit_id := NEW.audit_id;
  
  IF v_audit_id IS NULL THEN
    SELECT id INTO v_audit_id
    FROM public.audits
    WHERE file_name = NEW.folder_name
    LIMIT 1;
  END IF;
  
  IF v_audit_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Update the matching interview_assignment
  UPDATE public.interview_assignments
  SET 
    entry_status = 'data_entry_complete',
    entry_completed_at = COALESCE(entry_completed_at, now()),
    typing_status = 'typing_completed',
    typing_completed_at = COALESCE(typing_completed_at, now()),
    is_flagged_for_issue = CASE WHEN is_flagged_for_issue = true THEN false ELSE is_flagged_for_issue END,
    issue_resolved_at = CASE WHEN is_flagged_for_issue = true AND issue_resolved_at IS NULL THEN now() ELSE issue_resolved_at END,
    resolve_comment = CASE WHEN is_flagged_for_issue = true AND issue_resolved_at IS NULL THEN 'Auto-resolved: payment recorded' ELSE resolve_comment END
  WHERE audit_id = v_audit_id
    AND entry_status != 'data_entry_complete';
  
  RETURN NEW;
END;
$$;

-- Create trigger on payment_records
CREATE TRIGGER trg_auto_complete_on_payment
  AFTER INSERT OR UPDATE ON public.payment_records
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_complete_on_payment();

-- Fix existing records: mark assignments as complete where payment already exists
UPDATE public.interview_assignments ia
SET 
  entry_status = 'data_entry_complete',
  entry_completed_at = COALESCE(ia.entry_completed_at, now()),
  typing_status = 'typing_completed',
  typing_completed_at = COALESCE(ia.typing_completed_at, now()),
  is_flagged_for_issue = CASE WHEN ia.is_flagged_for_issue = true THEN false ELSE ia.is_flagged_for_issue END,
  issue_resolved_at = CASE WHEN ia.is_flagged_for_issue = true AND ia.issue_resolved_at IS NULL THEN now() ELSE ia.issue_resolved_at END,
  resolve_comment = CASE WHEN ia.is_flagged_for_issue = true AND ia.issue_resolved_at IS NULL THEN 'Auto-resolved: payment recorded' ELSE ia.resolve_comment END
WHERE ia.entry_status != 'data_entry_complete'
  AND EXISTS (
    SELECT 1 FROM public.payment_records pr
    WHERE pr.audit_id = ia.audit_id
       OR pr.folder_name = (SELECT file_name FROM public.audits WHERE id = ia.audit_id)
  );
