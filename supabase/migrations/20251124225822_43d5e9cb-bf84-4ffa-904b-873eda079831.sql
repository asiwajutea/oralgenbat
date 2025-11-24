-- Create function to get cleanable audit files (passed audits 30+ days old)
CREATE OR REPLACE FUNCTION public.get_cleanable_audit_files(
  min_age_days integer DEFAULT 30,
  contractor_filter text DEFAULT NULL
)
RETURNS TABLE (
  audit_id uuid,
  file_name text,
  status audit_status,
  reviewed_at timestamp with time zone,
  mobile_zip_uploaded_at timestamp with time zone,
  zip_url text,
  photo_count bigint,
  has_metadata boolean,
  days_since_review integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as audit_id,
    a.file_name,
    a.status,
    a.reviewed_at,
    a.mobile_zip_uploaded_at,
    a.mobile_zip_url as zip_url,
    COALESCE(p.photo_count, 0) as photo_count,
    (m.id IS NOT NULL) as has_metadata,
    EXTRACT(DAY FROM (NOW() - a.reviewed_at))::integer as days_since_review
  FROM audits a
  LEFT JOIN interview_metadata m ON m.audit_id = a.id
  LEFT JOIN (
    SELECT audit_id, COUNT(*) as photo_count
    FROM interview_photos
    GROUP BY audit_id
  ) p ON p.audit_id = a.id
  WHERE 
    a.status = 'Audit Passed'
    AND a.reviewed_at IS NOT NULL
    AND a.reviewed_at <= (NOW() - (min_age_days || ' days')::INTERVAL)
    AND a.mobile_zip_url IS NOT NULL
    AND m.id IS NOT NULL
    AND (contractor_filter IS NULL OR m.contractor_id = contractor_filter)
  ORDER BY a.reviewed_at ASC;
END;
$$;

-- Create audit trail table for file cleanup
CREATE TABLE IF NOT EXISTS public.audit_file_cleanup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid REFERENCES audits(id) ON DELETE CASCADE,
  deleted_by uuid REFERENCES profiles(id),
  deleted_at timestamp with time zone DEFAULT now(),
  zip_url text,
  zip_deleted boolean DEFAULT false,
  photos_deleted integer DEFAULT 0,
  notes text
);

-- Enable RLS on cleanup log
ALTER TABLE public.audit_file_cleanup_log ENABLE ROW LEVEL SECURITY;

-- RLS policy for cleanup log
CREATE POLICY "Admins can view cleanup log"
ON public.audit_file_cleanup_log FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Admins can insert cleanup log"
ON public.audit_file_cleanup_log FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);