CREATE OR REPLACE FUNCTION public.get_upload_tracking_error_stats(
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE (
  completed_checklists bigint,
  total_questions bigint,
  failed_questions bigint,
  first_audits_total bigint,
  first_audits_failed bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_privileged boolean;
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  v_is_privileged := has_role(v_uid, 'admin'::app_role)
    OR has_role(v_uid, 'super_admin'::app_role)
    OR has_role(v_uid, 'quality_assurance_manager'::app_role);

  RETURN QUERY
  WITH scoped_audits AS (
    SELECT a.id
    FROM audits a
    WHERE a.uploaded_at >= p_start_date
      AND a.uploaded_at < p_end_date
      AND (v_is_privileged OR public.user_can_view_audit_for_tracking(v_uid, a.id, a.file_name))
  ),
  completed_runs AS (
    SELECT
      acp.audit_id,
      acp.items,
      acp.has_failures,
      acp.created_at
    FROM audit_checklist_progress acp
    JOIN scoped_audits sa ON sa.id = acp.audit_id
    WHERE acp.is_completed = true
  ),
  first_runs AS (
    SELECT DISTINCT ON (audit_id)
      audit_id,
      has_failures
    FROM completed_runs
    ORDER BY audit_id, created_at ASC
  ),
  failure_counts AS (
    SELECT
      cr.audit_id,
      (
        SELECT COUNT(*)::bigint
        FROM jsonb_array_elements(cr.items) i
        WHERE LOWER(COALESCE(i->>'answer', '')) = 'no'
      ) AS no_count
    FROM completed_runs cr
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM completed_runs) AS completed_checklists,
    (SELECT COUNT(*)::bigint * 14 FROM completed_runs) AS total_questions,
    COALESCE((SELECT SUM(no_count) FROM failure_counts), 0)::bigint AS failed_questions,
    (SELECT COUNT(*)::bigint FROM first_runs) AS first_audits_total,
    (SELECT COUNT(*)::bigint FROM first_runs WHERE has_failures = true) AS first_audits_failed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_upload_tracking_error_stats(timestamptz, timestamptz) TO authenticated;