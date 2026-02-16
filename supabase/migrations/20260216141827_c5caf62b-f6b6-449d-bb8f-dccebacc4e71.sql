
CREATE OR REPLACE FUNCTION public.get_contractor_audits(
  p_contractor_id TEXT,
  p_is_auditor BOOLEAN DEFAULT false,
  p_auditor_name TEXT DEFAULT NULL,
  p_statuses TEXT[] DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT NULL,
  p_interviewer TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0,
  p_sort_by_artifacts BOOLEAN DEFAULT true
)
RETURNS TABLE (
  id UUID,
  file_name TEXT,
  file_url TEXT,
  status audit_status,
  uploaded_at TIMESTAMPTZ,
  last_modified TIMESTAMPTZ,
  mobile_zip_url TEXT,
  mobile_zip_uploaded_at TIMESTAMPTZ,
  reviewed_by TEXT,
  is_re_audit BOOLEAN,
  re_audit_count INT,
  original_status audit_status,
  locked_by UUID,
  locked_at TIMESTAMPTZ,
  review_comment TEXT,
  action_plan TEXT,
  artifact_correction TEXT[],
  artifact_correction_resolved_at TIMESTAMPTZ,
  artifact_correction_resolved_by UUID,
  review_duration_seconds INT,
  review_started_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_one_hour_ago TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
  v_total BIGINT;
BEGIN
  -- First get the total count
  SELECT COUNT(*) INTO v_total
  FROM audits a
  WHERE (
    -- Contractor scoping: match via metadata OR file_name prefix
    EXISTS (SELECT 1 FROM interview_metadata im WHERE im.audit_id = a.id AND im.contractor_id = p_contractor_id)
    OR (p_is_auditor AND a.file_name ILIKE p_contractor_id || '_%')
  )
  -- Status filters
  AND (p_statuses IS NULL OR array_length(p_statuses, 1) IS NULL OR
    CASE
      WHEN p_statuses = ARRAY['Ready for Review'] THEN
        a.status IN ('Pending', 'Awaiting Review') AND a.file_url IS NOT NULL AND a.mobile_zip_url IS NOT NULL
      WHEN p_statuses = ARRAY['Re-Audit'] THEN
        a.is_re_audit = true AND a.status = 'Awaiting Review'
        AND (NOT p_is_auditor OR p_auditor_name IS NULL OR a.reviewed_by = p_auditor_name)
      WHEN p_statuses = ARRAY['In Progress'] THEN
        a.locked_by IS NOT NULL AND a.locked_at >= v_one_hour_ago
      ELSE
        a.status::text = ANY(p_statuses)
        OR ('In Progress' = ANY(p_statuses) AND a.locked_by IS NOT NULL AND a.locked_at >= v_one_hour_ago)
        OR ('Re-Audit' = ANY(p_statuses) AND a.is_re_audit = true AND a.status = 'Awaiting Review'
            AND (NOT p_is_auditor OR p_auditor_name IS NULL OR a.reviewed_by = p_auditor_name))
        OR ('Ready for Review' = ANY(p_statuses) AND a.status IN ('Pending', 'Awaiting Review') AND a.file_url IS NOT NULL AND a.mobile_zip_url IS NOT NULL)
    END
  )
  -- Search filters
  AND (p_search IS NULL OR p_search = '' OR a.file_name ILIKE '%' || p_search || '%')
  AND (p_reviewer IS NULL OR p_reviewer = '' OR a.reviewed_by ILIKE '%' || p_reviewer || '%')
  AND (p_interviewer IS NULL OR p_interviewer = '' OR a.file_name ILIKE '%_' || p_interviewer || '_%')
  AND (p_start_date IS NULL OR a.uploaded_at >= p_start_date)
  AND (p_end_date IS NULL OR a.uploaded_at <= p_end_date)
  -- Auditor visibility: hide incomplete artifacts for pending/awaiting (non re-audit)
  AND (
    NOT p_is_auditor OR p_auditor_name IS NULL
    OR NOT (a.status IN ('Pending', 'Awaiting Review') AND COALESCE(a.is_re_audit, false) = false)
    OR (a.file_url IS NOT NULL AND a.mobile_zip_url IS NOT NULL)
  )
  -- Auditor: re-audits only show if reviewed by them
  AND (
    NOT p_is_auditor OR p_auditor_name IS NULL
    OR NOT (COALESCE(a.is_re_audit, false) = true AND a.status = 'Awaiting Review')
    OR a.reviewed_by = p_auditor_name
  );

  -- Return paginated results with total_count
  RETURN QUERY
  SELECT
    a.id, a.file_name, a.file_url, a.status, a.uploaded_at, a.last_modified,
    a.mobile_zip_url, a.mobile_zip_uploaded_at, a.reviewed_by,
    COALESCE(a.is_re_audit, false), COALESCE(a.re_audit_count, 0),
    a.original_status, a.locked_by, a.locked_at,
    a.review_comment, a.action_plan, a.artifact_correction,
    a.artifact_correction_resolved_at, a.artifact_correction_resolved_by,
    a.review_duration_seconds, a.review_started_at, a.reviewed_at,
    v_total
  FROM audits a
  WHERE (
    EXISTS (SELECT 1 FROM interview_metadata im WHERE im.audit_id = a.id AND im.contractor_id = p_contractor_id)
    OR (p_is_auditor AND a.file_name ILIKE p_contractor_id || '_%')
  )
  AND (p_statuses IS NULL OR array_length(p_statuses, 1) IS NULL OR
    CASE
      WHEN p_statuses = ARRAY['Ready for Review'] THEN
        a.status IN ('Pending', 'Awaiting Review') AND a.file_url IS NOT NULL AND a.mobile_zip_url IS NOT NULL
      WHEN p_statuses = ARRAY['Re-Audit'] THEN
        a.is_re_audit = true AND a.status = 'Awaiting Review'
        AND (NOT p_is_auditor OR p_auditor_name IS NULL OR a.reviewed_by = p_auditor_name)
      WHEN p_statuses = ARRAY['In Progress'] THEN
        a.locked_by IS NOT NULL AND a.locked_at >= v_one_hour_ago
      ELSE
        a.status::text = ANY(p_statuses)
        OR ('In Progress' = ANY(p_statuses) AND a.locked_by IS NOT NULL AND a.locked_at >= v_one_hour_ago)
        OR ('Re-Audit' = ANY(p_statuses) AND a.is_re_audit = true AND a.status = 'Awaiting Review'
            AND (NOT p_is_auditor OR p_auditor_name IS NULL OR a.reviewed_by = p_auditor_name))
        OR ('Ready for Review' = ANY(p_statuses) AND a.status IN ('Pending', 'Awaiting Review') AND a.file_url IS NOT NULL AND a.mobile_zip_url IS NOT NULL)
    END
  )
  AND (p_search IS NULL OR p_search = '' OR a.file_name ILIKE '%' || p_search || '%')
  AND (p_reviewer IS NULL OR p_reviewer = '' OR a.reviewed_by ILIKE '%' || p_reviewer || '%')
  AND (p_interviewer IS NULL OR p_interviewer = '' OR a.file_name ILIKE '%_' || p_interviewer || '_%')
  AND (p_start_date IS NULL OR a.uploaded_at >= p_start_date)
  AND (p_end_date IS NULL OR a.uploaded_at <= p_end_date)
  AND (
    NOT p_is_auditor OR p_auditor_name IS NULL
    OR NOT (a.status IN ('Pending', 'Awaiting Review') AND COALESCE(a.is_re_audit, false) = false)
    OR (a.file_url IS NOT NULL AND a.mobile_zip_url IS NOT NULL)
  )
  AND (
    NOT p_is_auditor OR p_auditor_name IS NULL
    OR NOT (COALESCE(a.is_re_audit, false) = true AND a.status = 'Awaiting Review')
    OR a.reviewed_by = p_auditor_name
  )
  ORDER BY
    CASE WHEN p_sort_by_artifacts THEN a.mobile_zip_url END DESC NULLS LAST,
    a.uploaded_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;
