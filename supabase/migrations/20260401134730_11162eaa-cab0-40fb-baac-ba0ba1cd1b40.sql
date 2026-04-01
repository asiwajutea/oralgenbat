
CREATE OR REPLACE FUNCTION public.get_review_stats()
RETURNS TABLE(
  total_reviews bigint,
  total_names bigint,
  passed_reviews bigint,
  passed_names bigint,
  failed_reviews bigint,
  failed_names bigint,
  monthly_reviews bigint,
  monthly_names bigint,
  burned_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH burned AS (
    SELECT audit_id FROM burn_queue WHERE restored_at IS NULL
  ),
  reviewed AS (
    SELECT 
      a.id,
      a.status,
      a.reviewed_at,
      COALESCE(m.total_names, 0) AS names
    FROM audits a
    LEFT JOIN interview_metadata m ON m.audit_id = a.id
    WHERE a.reviewed_at IS NOT NULL
      AND a.id NOT IN (SELECT audit_id FROM burned)
  )
  SELECT
    COUNT(*)::bigint AS total_reviews,
    COALESCE(SUM(names), 0)::bigint AS total_names,
    COUNT(*) FILTER (WHERE status = 'Audit Passed')::bigint AS passed_reviews,
    COALESCE(SUM(names) FILTER (WHERE status = 'Audit Passed'), 0)::bigint AS passed_names,
    COUNT(*) FILTER (WHERE status = 'Audit Failed')::bigint AS failed_reviews,
    COALESCE(SUM(names) FILTER (WHERE status = 'Audit Failed'), 0)::bigint AS failed_names,
    COUNT(*) FILTER (WHERE reviewed_at >= date_trunc('month', now()))::bigint AS monthly_reviews,
    COALESCE(SUM(names) FILTER (WHERE reviewed_at >= date_trunc('month', now())), 0)::bigint AS monthly_names,
    (SELECT COUNT(*)::bigint FROM burned) AS burned_count
  FROM reviewed;
$$;
