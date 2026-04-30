-- =====================================================
-- 1. Reassign FM fix: canonical FM list RPC
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_canonical_field_managers()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'field_manager'
    AND COALESCE(p.is_approved, false) = true
  ORDER BY p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_canonical_field_managers() TO authenticated;

-- Tighten interview_fm_overrides UPDATE: add WITH CHECK matching USING
DROP POLICY IF EXISTS "Authorized users can update overrides" ON public.interview_fm_overrides;
CREATE POLICY "Authorized users can update overrides"
ON public.interview_fm_overrides
FOR UPDATE
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'field_manager'::app_role)
    OR has_role(auth.uid(), 'contractor'::app_role)
    OR has_role(auth.uid(), 'sub_contractor'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
)
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'field_manager'::app_role)
    OR has_role(auth.uid(), 'contractor'::app_role)
    OR has_role(auth.uid(), 'sub_contractor'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- =====================================================
-- 2. user_activity_log table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_role app_role,
  action_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  entity_label text,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_created
  ON public.user_activity_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action_type
  ON public.user_activity_log (action_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity
  ON public.user_activity_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created
  ON public.user_activity_log (created_at DESC);

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity"
  ON public.user_activity_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all activity"
  ON public.user_activity_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated can insert own activity"
  ON public.user_activity_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE / DELETE policies (append-only). Admins purge via SECURITY DEFINER fn if needed later.

-- =====================================================
-- 3. Helper to log activity from triggers
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_activity(
  _user_id uuid,
  _action_type text,
  _entity_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _entity_label text DEFAULT NULL,
  _description text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = _user_id LIMIT 1;
  INSERT INTO public.user_activity_log
    (user_id, user_role, action_type, entity_type, entity_id, entity_label, description, metadata)
  VALUES
    (_user_id, v_role, _action_type, _entity_type, _entity_id, _entity_label, _description, COALESCE(_metadata, '{}'::jsonb));
END;
$$;

-- =====================================================
-- 4. Pagination RPC
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_user_activity(
  _user_id uuid,
  _start_date timestamptz DEFAULT NULL,
  _end_date timestamptz DEFAULT NULL,
  _action_types text[] DEFAULT NULL,
  _entity_types text[] DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  user_role app_role,
  action_type text,
  entity_type text,
  entity_id uuid,
  entity_label text,
  description text,
  metadata jsonb,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  v_is_admin := has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'super_admin'::app_role);

  -- Non-admins can only view their own activity
  IF NOT v_is_admin AND _user_id <> v_uid THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT a.*
    FROM public.user_activity_log a
    WHERE a.user_id = _user_id
      AND (_start_date IS NULL OR a.created_at >= _start_date)
      AND (_end_date IS NULL OR a.created_at < _end_date)
      AND (_action_types IS NULL OR a.action_type = ANY(_action_types))
      AND (_entity_types IS NULL OR a.entity_type = ANY(_entity_types))
      AND (
        _search IS NULL OR _search = ''
        OR a.description ILIKE '%' || _search || '%'
        OR a.entity_label ILIKE '%' || _search || '%'
      )
  ),
  counted AS (
    SELECT *, COUNT(*) OVER () AS total_count FROM filtered
  )
  SELECT
    counted.id, counted.user_id, counted.user_role, counted.action_type,
    counted.entity_type, counted.entity_id, counted.entity_label,
    counted.description, counted.metadata, counted.created_at, counted.total_count
  FROM counted
  ORDER BY counted.created_at DESC
  LIMIT _limit OFFSET _offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_activity(uuid, timestamptz, timestamptz, text[], text[], text, int, int) TO authenticated;

-- =====================================================
-- 5. Trigger mirrors of existing notify_* events
-- =====================================================

-- Audit status changes (pass / fail / override)
CREATE OR REPLACE FUNCTION public.activity_audit_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_action text;
  v_desc text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Audit Passed','Audit Failed') THEN
    -- Try to resolve actor from reviewed_by name -> profile id
    SELECT id INTO v_actor
    FROM public.profiles
    WHERE lower(btrim(full_name)) = lower(btrim(COALESCE(NEW.reviewed_by, '')))
    LIMIT 1;

    IF NEW.status = 'Audit Passed' THEN
      IF COALESCE(NEW.passed_with_failures, false) = true THEN
        v_action := 'audit_pass_with_override';
        v_desc := 'Passed (with override) ' || NEW.file_name;
      ELSE
        v_action := 'audit_passed';
        v_desc := 'Passed audit ' || NEW.file_name;
      END IF;
    ELSE
      v_action := 'audit_failed';
      v_desc := 'Failed audit ' || NEW.file_name;
    END IF;

    IF v_actor IS NOT NULL THEN
      PERFORM public.log_activity(
        v_actor, v_action, 'audit', NEW.id, NEW.file_name, v_desc,
        jsonb_build_object(
          'previous_status', OLD.status,
          'new_status', NEW.status,
          'is_re_audit', COALESCE(NEW.is_re_audit, false),
          'passed_with_failures', COALESCE(NEW.passed_with_failures, false),
          'review_comment', NEW.review_comment
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_audit_status ON public.audits;
CREATE TRIGGER trg_activity_audit_status
  AFTER UPDATE ON public.audits
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_audit_status_change();

-- Re-audit submissions (one row per submission)
CREATE OR REPLACE FUNCTION public.activity_re_audit_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_file text;
BEGIN
  SELECT file_name INTO v_file FROM public.audits WHERE id = NEW.audit_id;
  PERFORM public.log_activity(
    NEW.submitted_by,
    CASE WHEN NEW.replaced_pdf OR NEW.replaced_zip THEN 're_audit_submitted' ELSE 're_audit_requested' END,
    'audit', NEW.audit_id, v_file,
    'Submitted for re-audit: ' || COALESCE(v_file, NEW.audit_id::text),
    jsonb_build_object(
      'replaced_pdf', NEW.replaced_pdf,
      'replaced_zip', NEW.replaced_zip,
      'submission_comment', NEW.submission_comment,
      're_audit_note', NEW.re_audit_note,
      'submitted_by_role', NEW.submitted_by_role
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_re_audit ON public.re_audit_submissions;
CREATE TRIGGER trg_activity_re_audit
  AFTER INSERT ON public.re_audit_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_re_audit_submission();

-- Burn queue: send and restore
CREATE OR REPLACE FUNCTION public.activity_burn_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity(
      NEW.sent_by, 'audit_sent_to_burn', 'audit', NEW.audit_id, NEW.file_name,
      'Sent to burn queue: ' || NEW.file_name,
      jsonb_build_object('reason', NEW.reason)
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.restored_at IS NULL AND NEW.restored_at IS NOT NULL THEN
    PERFORM public.log_activity(
      NEW.restored_by, 'audit_restored_from_burn', 'audit', NEW.audit_id, NEW.file_name,
      'Restored from burn queue: ' || NEW.file_name,
      jsonb_build_object('original_reason', NEW.reason)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_burn_queue ON public.burn_queue;
CREATE TRIGGER trg_activity_burn_queue
  AFTER INSERT OR UPDATE ON public.burn_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_burn_queue();

-- FM override (per-interview reassignment)
CREATE OR REPLACE FUNCTION public.activity_fm_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_file text;
  v_new_fm text;
BEGIN
  SELECT file_name INTO v_file FROM public.audits WHERE id = NEW.audit_id;
  SELECT full_name INTO v_new_fm FROM public.profiles WHERE id = NEW.field_manager_id;
  PERFORM public.log_activity(
    NEW.assigned_by, 'fm_reassigned', 'fm_override', NEW.audit_id, v_file,
    'Reassigned ' || COALESCE(v_file, NEW.audit_id::text) || ' to ' || COALESCE(v_new_fm, 'FM'),
    jsonb_build_object('field_manager_id', NEW.field_manager_id, 'field_manager_name', v_new_fm)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_fm_override ON public.interview_fm_overrides;
CREATE TRIGGER trg_activity_fm_override
  AFTER INSERT OR UPDATE ON public.interview_fm_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_fm_override();

-- Team assignment status changes (approve / reject)
CREATE OR REPLACE FUNCTION public.activity_team_assignment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved','rejected') THEN
    PERFORM public.log_activity(
      NEW.approved_by,
      CASE WHEN NEW.status = 'approved' THEN 'team_request_approved' ELSE 'team_request_rejected' END,
      'team_assignment', NEW.id, NEW.interviewer_code,
      CASE WHEN NEW.status = 'approved' THEN 'Approved' ELSE 'Rejected' END
        || ' team request for ' || NEW.interviewer_code,
      jsonb_build_object('interviewer_code', NEW.interviewer_code, 'field_manager_id', NEW.field_manager_id)
    );
  ELSIF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    PERFORM public.log_activity(
      NEW.field_manager_id, 'team_request_created', 'team_assignment', NEW.id, NEW.interviewer_code,
      'Requested interviewer ' || NEW.interviewer_code,
      jsonb_build_object('interviewer_code', NEW.interviewer_code, 'contractor_id', NEW.contractor_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_team_assignment ON public.team_assignments;
CREATE TRIGGER trg_activity_team_assignment
  AFTER INSERT OR UPDATE ON public.team_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_team_assignment_status();

-- Profile changes: approval / suspension
CREATE OR REPLACE FUNCTION public.activity_profile_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_approved = true AND COALESCE(OLD.is_approved, false) = false THEN
    PERFORM public.log_activity(
      COALESCE(NEW.approved_by, auth.uid()),
      'user_approved', 'user', NEW.id, NEW.full_name,
      'Approved user ' || NEW.full_name,
      jsonb_build_object('email', NEW.email)
    );
  END IF;
  IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
    PERFORM public.log_activity(
      auth.uid(),
      CASE NEW.account_status
        WHEN 'suspended' THEN 'user_suspended'
        WHEN 'terminated' THEN 'user_terminated'
        WHEN 'active' THEN 'user_reactivated'
        ELSE 'user_status_changed'
      END,
      'user', NEW.id, NEW.full_name,
      'Account status changed for ' || NEW.full_name || ' -> ' || NEW.account_status,
      jsonb_build_object('previous', OLD.account_status, 'new', NEW.account_status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_profile_status ON public.profiles;
CREATE TRIGGER trg_activity_profile_status
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_profile_status();

-- Payment created
CREATE OR REPLACE FUNCTION public.activity_payment_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_activity(
    NEW.created_by, 'payment_created', 'payment', NEW.id, NEW.folder_name,
    'Created payment for ' || NEW.folder_name || ' (' || NEW.names_count || ' names)',
    jsonb_build_object(
      'invoice_number', NEW.invoice_number,
      'amount', NEW.amount,
      'names_count', NEW.names_count,
      'contractor_name', NEW.contractor_name
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_payment_created ON public.payment_records;
CREATE TRIGGER trg_activity_payment_created
  AFTER INSERT ON public.payment_records
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_payment_created();

-- Announcement created
CREATE OR REPLACE FUNCTION public.activity_announcement_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_activity(
    NEW.created_by, 'announcement_created', 'announcement', NEW.id, NEW.title,
    'Created announcement: ' || NEW.title,
    jsonb_build_object('target_type', NEW.target_type, 'priority', NEW.priority)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_announcement_created ON public.announcements;
CREATE TRIGGER trg_activity_announcement_created
  AFTER INSERT ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_announcement_created();

-- Push notification created
CREATE OR REPLACE FUNCTION public.activity_push_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_activity(
    NEW.created_by, 'push_sent', 'push_notification', NEW.id, NEW.title,
    'Sent push notification: ' || NEW.title,
    jsonb_build_object('target_type', NEW.target_type)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_push_created ON public.push_notifications;
CREATE TRIGGER trg_activity_push_created
  AFTER INSERT ON public.push_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_push_created();

-- New audit uploaded
CREATE OR REPLACE FUNCTION public.activity_audit_uploaded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.uploaded_by IS NOT NULL THEN
    PERFORM public.log_activity(
      NEW.uploaded_by, 'pdf_uploaded', 'audit', NEW.id, NEW.file_name,
      'Uploaded interview ' || NEW.file_name,
      jsonb_build_object('status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_audit_uploaded ON public.audits;
CREATE TRIGGER trg_activity_audit_uploaded
  AFTER INSERT ON public.audits
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_audit_uploaded();