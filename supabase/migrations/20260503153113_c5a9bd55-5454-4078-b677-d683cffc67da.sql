
INSERT INTO storage.buckets (id, name, public)
VALUES ('team-exports', 'team-exports', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read team exports" ON storage.objects;
CREATE POLICY "Public read team exports"
ON storage.objects FOR SELECT
USING (bucket_id = 'team-exports');
