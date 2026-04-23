CREATE OR REPLACE FUNCTION public.detect_interview_fraud_flag(p_audit_id uuid)
RETURNS TABLE (
  is_flagged boolean,
  interviewer_code text,
  contractor_id text,
  interview_date date,
  interview_time time without time zone,
  collisions jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_contractor text;
  v_date date;
  v_time time without time zone;
  v_file_name text;
  v_parts text[];
BEGIN
  -- Try metadata first
  SELECT m.interviewer_code, m.contractor_id, m.interview_date, m.interview_time
    INTO v_code, v_contractor, v_date, v_time
  FROM interview_metadata m
  WHERE m.audit_id = p_audit_id
  LIMIT 1;

  -- Fallback: parse from file_name NGXX_XXXX_YYYYMMDD_HHMM
  IF v_code IS NULL OR v_date IS NULL OR v_time IS NULL THEN
    SELECT a.file_name INTO v_file_name FROM audits a WHERE a.id = p_audit_id;
    IF v_file_name IS NOT NULL THEN
      v_parts := regexp_match(
        v_file_name,
        '^(NG\d{2})_(\d{3,4})_(\d{8})_(\d{4})'
      );
      IF v_parts IS NOT NULL THEN
        v_contractor := COALESCE(v_contractor, v_parts[1]);
        v_code := COALESCE(v_code, v_parts[2]);
        v_date := COALESCE(
          v_date,
          to_date(v_parts[3], 'YYYYMMDD')
        );
        v_time := COALESCE(
          v_time,
          to_timestamp(v_parts[4], 'HH24MI')::time
        );
      END IF;
    END IF;
  END IF;

  -- If we still don't have what we need, return unflagged
  IF v_code IS NULL OR v_date IS NULL OR v_time IS NULL THEN
    RETURN QUERY SELECT false, v_code, v_contractor, v_date, v_time, '[]'::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  WITH others AS (
    SELECT
      m.audit_id,
      a.file_name,
      m.total_names,
      m.interview_time,
      ABS(EXTRACT(EPOCH FROM (m.interview_time - v_time)))::int AS seconds_apart
    FROM interview_metadata m
    JOIN audits a ON a.id = m.audit_id
    LEFT JOIN burn_queue bq ON bq.audit_id = m.audit_id
    WHERE m.interviewer_code = v_code
      AND (v_contractor IS NULL OR m.contractor_id = v_contractor)
      AND m.interview_date = v_date
      AND m.audit_id IS NOT NULL
      AND m.audit_id <> p_audit_id
      AND bq.id IS NULL
      AND ABS(EXTRACT(EPOCH FROM (m.interview_time - v_time))) <= 1800
  ),
  agg AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'audit_id', audit_id,
        'file_name', file_name,
        'total_names', total_names,
        'interview_time', interview_time,
        'minutes_apart', ROUND(seconds_apart / 60.0, 1)
      )
      ORDER BY seconds_apart ASC
    ), '[]'::jsonb) AS arr,
    COUNT(*) AS n
    FROM others
  )
  SELECT
    (agg.n > 0) AS is_flagged,
    v_code,
    v_contractor,
    v_date,
    v_time,
    agg.arr
  FROM agg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_interview_fraud_flag(uuid) TO authenticated;