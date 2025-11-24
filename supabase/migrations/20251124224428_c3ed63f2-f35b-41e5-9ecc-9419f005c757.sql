-- Create function to safely query storage usage
CREATE OR REPLACE FUNCTION public.get_storage_usage()
RETURNS TABLE (
  bucket_id text,
  file_count bigint,
  total_size_bytes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.bucket_id,
    COUNT(*)::bigint as file_count,
    COALESCE(SUM((o.metadata->>'size')::bigint), 0)::bigint as total_size_bytes
  FROM storage.objects o
  WHERE o.bucket_id IN ('audit-pdfs', 'mobile-zips', 'interview-photos')
  GROUP BY o.bucket_id;
END;
$$;