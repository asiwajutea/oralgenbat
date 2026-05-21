
-- Quick FAIL for re-audit
CREATE OR REPLACE FUNCTION public.re_audit_quick_fail(
  _audit_id uuid,
  _review_comment text,
  _action_plan text,
  _artifact_correction text[],
  _reused_previous boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_audit record;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (has_role(v_uid, 'auditor'::app_role) OR has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Only auditors can quick-fail re-audits';
  END IF;

  SELECT * INTO v_audit FROM public.audits WHERE id = _audit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Audit not found';
  END IF;
  IF COALESCE(v_audit.is_re_audit, false) = false THEN
    RAISE EXCEPTION 'Quick fail is only available for re-audits';
  END IF;
  IF _review_comment IS NULL OR length(trim(_review_comment)) < 5 THEN
    RAISE EXCEPTION 'A failure reason is required';
  END IF;

  SELECT COALESCE(full_name, email) INTO v_name FROM public.profiles WHERE id = v_uid;

  UPDATE public.audits
  SET status = 'Audit Failed'::audit_status,
      review_comment = _review_comment,
      action_plan = _action_plan,
      artifact_correction = _artifact_correction,
      reviewed_at = now(),
      reviewed_by = COALESCE(v_name, 'Unknown'),
      locked_by = NULL,
      locked_at = NULL,
      review_started_at = NULL,
      last_modified = now()
  WHERE id = _audit_id;

  INSERT INTO public.user_activity_log (user_id, user_role, action_type, entity_type, entity_id, entity_label, description, metadata)
  VALUES (
    v_uid,
    (SELECT role FROM public.user_roles WHERE user_id = v_uid LIMIT 1),
    'audit_quick_failed',
    'audit',
    _audit_id,
    v_audit.file_name,
    'Quick-failed re-audit',
    jsonb_build_object('reused_previous_feedback', _reused_previous)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.re_audit_quick_fail(uuid, text, text, text[], boolean) TO authenticated;

-- Quick PASS for re-audit
CREATE OR REPLACE FUNCTION public.re_audit_quick_pass(_audit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_audit record;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (has_role(v_uid, 'auditor'::app_role) OR has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Only auditors can quick-pass re-audits';
  END IF;

  SELECT * INTO v_audit FROM public.audits WHERE id = _audit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Audit not found';
  END IF;
  IF COALESCE(v_audit.is_re_audit, false) = false THEN
    RAISE EXCEPTION 'Quick pass is only available for re-audits';
  END IF;

  SELECT COALESCE(full_name, email) INTO v_name FROM public.profiles WHERE id = v_uid;

  UPDATE public.audits
  SET status = 'Audit Passed'::audit_status,
      review_comment = NULL,
      action_plan = NULL,
      artifact_correction = NULL,
      reviewed_at = now(),
      reviewed_by = COALESCE(v_name, 'Unknown'),
      locked_by = NULL,
      locked_at = NULL,
      review_started_at = NULL,
      last_modified = now()
  WHERE id = _audit_id;

  -- Clean up checklist progress like the normal pass flow does
  DELETE FROM public.audit_checklist_progress WHERE audit_id = _audit_id;

  INSERT INTO public.user_activity_log (user_id, user_role, action_type, entity_type, entity_id, entity_label, description, metadata)
  VALUES (
    v_uid,
    (SELECT role FROM public.user_roles WHERE user_id = v_uid LIMIT 1),
    'audit_quick_passed',
    'audit',
    _audit_id,
    v_audit.file_name,
    'Quick-passed re-audit',
    '{}'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.re_audit_quick_pass(uuid) TO authenticated;
