
CREATE OR REPLACE FUNCTION public.get_cleanable_audit_files(min_age_days integer DEFAULT 30, contractor_filter text DEFAULT NULL::text)
 RETURNS TABLE(audit_id uuid, file_name text, status audit_status, reviewed_at timestamp with time zone, mobile_zip_uploaded_at timestamp with time zone, zip_url text, photo_count bigint, has_metadata boolean, days_since_review integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as audit_id,
    a.file_name,
    a.status,
    a.reviewed_at,
    a.mobile_zip_uploaded_at,
    a.mobile_zip_url as zip_url,
    COALESCE(photo_sub.photo_count, 0) as photo_count,
    (m.id IS NOT NULL) as has_metadata,
    EXTRACT(DAY FROM (NOW() - a.reviewed_at))::integer as days_since_review
  FROM audits a
  LEFT JOIN interview_metadata m ON m.audit_id = a.id
  LEFT JOIN (
    SELECT ip.audit_id as photo_audit_id, COUNT(*) as photo_count
    FROM interview_photos ip
    GROUP BY ip.audit_id
  ) photo_sub ON photo_sub.photo_audit_id = a.id
  WHERE 
    a.status = 'Audit Passed'
    AND a.reviewed_at IS NOT NULL
    AND a.reviewed_at <= (NOW() - (min_age_days || ' days')::INTERVAL)
    AND a.mobile_zip_url IS NOT NULL
    AND (contractor_filter IS NULL OR m.contractor_id = contractor_filter)
  ORDER BY a.reviewed_at ASC;
END;
$function$;
