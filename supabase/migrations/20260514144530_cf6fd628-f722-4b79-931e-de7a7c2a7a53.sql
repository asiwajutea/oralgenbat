CREATE OR REPLACE FUNCTION public.get_status_counts(p_contractor_id text DEFAULT NULL::text, p_auditor_name text DEFAULT NULL::text, p_is_auditor boolean DEFAULT false)
 RETURNS TABLE(status_key text, count bigint, total_names bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_one_hour_ago timestamptz := now() - interval '1 hour';
BEGIN
  RETURN QUERY
  WITH burned AS (
    SELECT bq.audit_id FROM burn_queue bq WHERE bq.restored_at IS NULL
  ),
  base AS (
    SELECT
      a.id, a.status, a.locked_by, a.locked_at, a.is_re_audit, a.reviewed_by,
      a.file_url, a.file_name, a.mobile_zip_url,
      COALESCE(m.total_names, 0) AS names,
      m.contractor_id AS meta_contractor_id
    FROM audits a
    LEFT JOIN interview_metadata m ON m.audit_id = a.id
    WHERE a.id NOT IN (SELECT audit_id FROM burned)
      AND (
        p_contractor_id IS NULL
        OR m.contractor_id = p_contractor_id
        OR (m.contractor_id IS NULL AND split_part(a.file_name, '_', 1) = p_contractor_id)
      )
  )
  SELECT 'Pending'::text, count(*)::bigint, coalesce(sum(b.names),0)::bigint
  FROM base b
  WHERE b.status IN ('Pending', 'Awaiting Review')
    AND coalesce(b.is_re_audit, false) = false
    AND (NOT p_is_auditor OR (b.file_url IS NOT NULL AND b.mobile_zip_url IS NOT NULL))
  UNION ALL
  SELECT 'Audit Passed'::text, count(*)::bigint, coalesce(sum(b.names),0)::bigint
  FROM base b WHERE b.status = 'Audit Passed'
  UNION ALL
  SELECT 'Audit Failed'::text, count(*)::bigint, coalesce(sum(b.names),0)::bigint
  FROM base b WHERE b.status = 'Audit Failed'
  UNION ALL
  SELECT 'In Progress'::text, count(*)::bigint, coalesce(sum(b.names),0)::bigint
  FROM base b
  WHERE b.locked_by IS NOT NULL AND b.locked_at >= v_one_hour_ago
  UNION ALL
  -- Re-Audit: any re-audit still awaiting/pending review
  SELECT 'Re-Audit'::text, count(*)::bigint, coalesce(sum(b.names),0)::bigint
  FROM base b
  WHERE coalesce(b.is_re_audit, false) = true
    AND b.status IN ('Pending', 'Awaiting Review')
    AND (p_auditor_name IS NULL OR b.reviewed_by = p_auditor_name)
  UNION ALL
  -- Ready for Review: NOT re-audits
  SELECT 'Ready for Review'::text, count(*)::bigint, coalesce(sum(b.names),0)::bigint
  FROM base b
  WHERE b.status IN ('Pending', 'Awaiting Review')
    AND coalesce(b.is_re_audit, false) = false
    AND b.file_url IS NOT NULL AND b.mobile_zip_url IS NOT NULL;
END;
$function$;