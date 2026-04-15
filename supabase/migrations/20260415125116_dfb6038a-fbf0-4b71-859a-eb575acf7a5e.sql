CREATE OR REPLACE FUNCTION public.get_upload_tracking_stats(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_granularity text DEFAULT 'day'
)
RETURNS TABLE (
  period text,
  period_start timestamptz,
  interviews_uploaded bigint,
  interviews_with_metadata bigint,
  interviews_without_metadata bigint,
  total_names bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_char(date_trunc(p_granularity, a.uploaded_at), 'YYYY-MM-DD') AS period,
    date_trunc(p_granularity, a.uploaded_at) AS period_start,
    count(*)::bigint AS interviews_uploaded,
    count(m.id)::bigint AS interviews_with_metadata,
    (count(*) - count(m.id))::bigint AS interviews_without_metadata,
    coalesce(sum(m.total_names), 0)::bigint AS total_names
  FROM audits a
  LEFT JOIN interview_metadata m ON m.audit_id = a.id
  WHERE a.uploaded_at >= p_start_date
    AND a.uploaded_at < p_end_date
  GROUP BY date_trunc(p_granularity, a.uploaded_at)
  ORDER BY period_start;
$$;