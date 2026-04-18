DROP FUNCTION IF EXISTS public.get_upload_tracking_interviews(timestamptz, timestamptz, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_upload_tracking_interviews(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_artifact text DEFAULT NULL
)
RETURNS TABLE (
  audit_id uuid,
  file_name text,
  uploaded_at timestamptz,
  status audit_status,
  is_re_audit boolean,
  re_audit_count integer,
  artifact_correction text[],
  review_comment text,
  action_plan text,
  passed_with_failures boolean,
  pass_override_reason text,
  pass_override_action_plan text,
  reviewed_at timestamptz,
  reviewed_by text,
  interviewee_name text,
  field_manager text,
  interviewer_name text,
  interviewer_code text,
  interview_location text,
  total_names integer,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      a.id AS audit_id,
      a.file_name,
      a.uploaded_at,
      a.status,
      COALESCE(a.is_re_audit, false) AS is_re_audit,
      COALESCE(a.re_audit_count, 0) AS re_audit_count,
      a.artifact_correction,
      a.review_comment,
      a.action_plan,
      COALESCE(a.passed_with_failures, false) AS passed_with_failures,
      a.pass_override_reason,
      a.pass_override_action_plan,
      a.reviewed_at,
      a.reviewed_by,
      m.interviewee_name,
      m.field_manager,
      m.interviewer_name,
      m.interviewer_code,
      m.interview_location,
      m.total_names
    FROM public.audits a
    LEFT JOIN public.interview_metadata m ON m.audit_id = a.id
    WHERE a.uploaded_at >= p_start_date
      AND a.uploaded_at < p_end_date
      AND NOT EXISTS (
        SELECT 1 FROM public.burn_queue bq
        WHERE bq.audit_id = a.id AND bq.restored_at IS NULL
      )
      AND (p_search IS NULL OR a.file_name ILIKE '%' || p_search || '%')
      AND (
        p_status IS NULL
        OR (p_status = 'Passed' AND a.status = 'Audit Passed'::audit_status AND COALESCE(a.passed_with_failures, false) = false)
        OR (p_status = 'Failed' AND a.status = 'Audit Failed'::audit_status)
        OR (p_status = 'Awaiting Review' AND a.status = 'Awaiting Review'::audit_status)
        OR (p_status = 'Pending' AND a.status = 'Pending'::audit_status)
        OR (p_status = 'Pass with Override' AND a.status = 'Audit Passed'::audit_status AND COALESCE(a.passed_with_failures, false) = true)
      )
      AND (
        p_artifact IS NULL
        OR (a.artifact_correction IS NOT NULL AND p_artifact = ANY(a.artifact_correction))
      )
  ),
  counted AS (
    SELECT *, COUNT(*) OVER () AS total_count FROM filtered
  )
  SELECT
    audit_id,
    file_name,
    uploaded_at,
    status,
    is_re_audit,
    re_audit_count,
    artifact_correction,
    review_comment,
    action_plan,
    passed_with_failures,
    pass_override_reason,
    pass_override_action_plan,
    reviewed_at,
    reviewed_by,
    interviewee_name,
    field_manager,
    interviewer_name,
    interviewer_code,
    interview_location,
    total_names,
    total_count
  FROM counted
  ORDER BY uploaded_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_upload_tracking_interviews(timestamptz, timestamptz, text, text, integer, integer, text) TO authenticated;