-- 1. Add uploaded_by column (nullable so legacy rows remain valid)
ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Trigger: prevent overwriting uploaded_by once set
CREATE OR REPLACE FUNCTION public.preserve_audit_uploaded_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.uploaded_by IS NOT NULL THEN
    NEW.uploaded_by := OLD.uploaded_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_audit_uploaded_by_trg ON public.audits;
CREATE TRIGGER preserve_audit_uploaded_by_trg
BEFORE UPDATE ON public.audits
FOR EACH ROW
EXECUTE FUNCTION public.preserve_audit_uploaded_by();

-- 3. Helper to determine role-based visibility for upload tracking
CREATE OR REPLACE FUNCTION public.user_can_view_audit_for_tracking(_user_id uuid, _audit_id uuid, _file_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contractor_id text;
  v_active_contractor_id text;
  v_full_name text;
  v_eff_cid text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'admin'::app_role)
     OR public.has_role(_user_id, 'super_admin'::app_role)
     OR public.has_role(_user_id, 'quality_assurance_manager'::app_role) THEN
    RETURN true;
  END IF;

  SELECT contractor_id, active_contractor_id, full_name
    INTO v_contractor_id, v_active_contractor_id, v_full_name
  FROM public.profiles WHERE id = _user_id;

  IF public.has_role(_user_id, 'contractor'::app_role) THEN
    IF v_contractor_id IS NOT NULL
       AND (_file_name ILIKE v_contractor_id || '_%'
            OR EXISTS (SELECT 1 FROM public.interview_metadata im
                       WHERE im.audit_id = _audit_id
                         AND im.contractor_id = v_contractor_id)) THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'sub_contractor'::app_role) THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.interview_metadata im
      JOIN public.profiles fm ON fm.full_name = im.field_manager
      JOIN public.field_manager_subcontractor_assignments a
        ON a.field_manager_id = fm.id
       AND a.sub_contractor_id = _user_id
       AND COALESCE(a.is_active, true) = true
      WHERE im.audit_id = _audit_id
    );
  END IF;

  IF public.has_role(_user_id, 'field_manager'::app_role) THEN
    RETURN EXISTS (
      SELECT 1 FROM public.interview_metadata im
      WHERE im.audit_id = _audit_id
        AND (
          im.field_manager = v_full_name
          OR EXISTS (
            SELECT 1 FROM public.team_assignments ta
            WHERE ta.field_manager_id = _user_id
              AND ta.status = 'approved'
              AND ta.interviewer_code = im.interviewer_code
          )
        )
    );
  END IF;

  IF public.has_role(_user_id, 'auditor'::app_role) THEN
    v_eff_cid := COALESCE(v_active_contractor_id, v_contractor_id);
    RETURN (
      v_eff_cid IS NOT NULL AND _file_name ILIKE v_eff_cid || '_%'
    ) OR EXISTS (
      SELECT 1 FROM public.audits aa
      WHERE aa.id = _audit_id AND aa.reviewed_by = v_full_name
    );
  END IF;

  RETURN false;
END;
$$;

-- 4. Replace get_upload_tracking_interviews
DROP FUNCTION IF EXISTS public.get_upload_tracking_interviews(timestamptz, timestamptz, text, text, integer, integer, text);

CREATE OR REPLACE FUNCTION public.get_upload_tracking_interviews(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_artifact text DEFAULT NULL
)
RETURNS TABLE(
  audit_id uuid, file_name text, uploaded_at timestamptz, status audit_status,
  is_re_audit boolean, re_audit_count integer, artifact_correction text[],
  review_comment text, action_plan text, passed_with_failures boolean,
  pass_override_reason text, pass_override_action_plan text,
  reviewed_at timestamptz, reviewed_by text, interviewee_name text,
  field_manager text, interviewer_name text, interviewer_code text,
  interview_location text, total_names integer,
  uploaded_by_name text, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_full_admin boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_is_full_admin := public.has_role(v_uid, 'admin'::app_role)
                  OR public.has_role(v_uid, 'super_admin'::app_role)
                  OR public.has_role(v_uid, 'quality_assurance_manager'::app_role);

  RETURN QUERY
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
      m.total_names,
      up.full_name AS uploaded_by_name
    FROM public.audits a
    LEFT JOIN public.interview_metadata m ON m.audit_id = a.id
    LEFT JOIN public.profiles up ON up.id = a.uploaded_by
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
      AND (
        v_is_full_admin
        OR public.user_can_view_audit_for_tracking(v_uid, a.id, a.file_name)
      )
  ),
  counted AS (
    SELECT *, COUNT(*) OVER () AS total_count FROM filtered
  )
  SELECT
    counted.audit_id, counted.file_name, counted.uploaded_at, counted.status,
    counted.is_re_audit, counted.re_audit_count, counted.artifact_correction,
    counted.review_comment, counted.action_plan, counted.passed_with_failures,
    counted.pass_override_reason, counted.pass_override_action_plan,
    counted.reviewed_at, counted.reviewed_by, counted.interviewee_name,
    counted.field_manager, counted.interviewer_name, counted.interviewer_code,
    counted.interview_location, counted.total_names, counted.uploaded_by_name,
    counted.total_count
  FROM counted
  ORDER BY counted.uploaded_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 5. Replace get_upload_tracking_stats with role scoping
DROP FUNCTION IF EXISTS public.get_upload_tracking_stats(timestamptz, timestamptz, text);

CREATE OR REPLACE FUNCTION public.get_upload_tracking_stats(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_granularity text DEFAULT 'day'
)
RETURNS TABLE(
  period text, period_start timestamptz, interviews_uploaded bigint,
  interviews_with_metadata bigint, interviews_without_metadata bigint, total_names bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_full_admin boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_is_full_admin := public.has_role(v_uid, 'admin'::app_role)
                  OR public.has_role(v_uid, 'super_admin'::app_role)
                  OR public.has_role(v_uid, 'quality_assurance_manager'::app_role);

  RETURN QUERY
  SELECT
    to_char(date_trunc(p_granularity, a.uploaded_at), 'YYYY-MM-DD') AS period,
    date_trunc(p_granularity, a.uploaded_at) AS period_start,
    count(*)::bigint AS interviews_uploaded,
    count(m.id)::bigint AS interviews_with_metadata,
    (count(*) - count(m.id))::bigint AS interviews_without_metadata,
    coalesce(sum(m.total_names), 0)::bigint AS total_names
  FROM public.audits a
  LEFT JOIN public.interview_metadata m ON m.audit_id = a.id
  WHERE a.uploaded_at >= p_start_date
    AND a.uploaded_at < p_end_date
    AND (
      v_is_full_admin
      OR public.user_can_view_audit_for_tracking(v_uid, a.id, a.file_name)
    )
  GROUP BY date_trunc(p_granularity, a.uploaded_at)
  ORDER BY period_start;
END;
$$;

-- 6. Update get_contractor_audits to also return uploaded_by_name
DROP FUNCTION IF EXISTS public.get_contractor_audits(text, boolean, text, text[], text, text, text, timestamptz, timestamptz, integer, integer, boolean);

CREATE OR REPLACE FUNCTION public.get_contractor_audits(
  p_contractor_id text,
  p_is_auditor boolean DEFAULT false,
  p_auditor_name text DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_reviewer text DEFAULT NULL,
  p_interviewer text DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0,
  p_sort_by_artifacts boolean DEFAULT true
)
RETURNS TABLE(
  id uuid, file_name text, file_url text, status audit_status,
  uploaded_at timestamptz, last_modified timestamptz,
  mobile_zip_url text, mobile_zip_uploaded_at timestamptz,
  reviewed_by text, is_re_audit boolean, re_audit_count integer,
  original_status audit_status, locked_by uuid, locked_at timestamptz,
  review_comment text, action_plan text, artifact_correction text[],
  artifact_correction_resolved_at timestamptz, artifact_correction_resolved_by uuid,
  review_duration_seconds integer, review_started_at timestamptz,
  reviewed_at timestamptz, uploaded_by_name text, total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_one_hour_ago TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
  v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total
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
  );

  RETURN QUERY
  SELECT
    a.id, a.file_name, a.file_url, a.status, a.uploaded_at, a.last_modified,
    a.mobile_zip_url, a.mobile_zip_uploaded_at, a.reviewed_by,
    COALESCE(a.is_re_audit, false), COALESCE(a.re_audit_count, 0),
    a.original_status, a.locked_by, a.locked_at,
    a.review_comment, a.action_plan, a.artifact_correction,
    a.artifact_correction_resolved_at, a.artifact_correction_resolved_by,
    a.review_duration_seconds, a.review_started_at, a.reviewed_at,
    up.full_name AS uploaded_by_name,
    v_total
  FROM audits a
  LEFT JOIN profiles up ON up.id = a.uploaded_by
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
$$;