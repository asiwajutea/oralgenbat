
-- =============================================
-- 1. MAKE STORAGE BUCKETS PRIVATE
-- =============================================
UPDATE storage.buckets SET public = false WHERE id IN ('audit-pdfs', 'mobile-zips', 'interview-photos', 'interview-audio');

-- =============================================
-- 2. ADD STORAGE RLS POLICIES
-- =============================================

-- audit-pdfs: approved users can read, approved users can upload
CREATE POLICY "Approved users can read audit PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'audit-pdfs' AND is_user_approved(auth.uid()));

CREATE POLICY "Approved users can upload audit PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'audit-pdfs' AND is_user_approved(auth.uid()));

CREATE POLICY "Approved users can update audit PDFs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'audit-pdfs' AND is_user_approved(auth.uid()));

CREATE POLICY "Admins can delete audit PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'audit-pdfs' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')));

-- mobile-zips
CREATE POLICY "Approved users can read mobile ZIPs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'mobile-zips' AND is_user_approved(auth.uid()));

CREATE POLICY "Approved users can upload mobile ZIPs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mobile-zips' AND is_user_approved(auth.uid()));

CREATE POLICY "Approved users can update mobile ZIPs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'mobile-zips' AND is_user_approved(auth.uid()));

CREATE POLICY "Admins can delete mobile ZIPs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'mobile-zips' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')));

-- interview-photos
CREATE POLICY "Approved users can read interview photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'interview-photos' AND is_user_approved(auth.uid()));

CREATE POLICY "Approved users can upload interview photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'interview-photos' AND is_user_approved(auth.uid()));

CREATE POLICY "Approved users can update interview photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'interview-photos' AND is_user_approved(auth.uid()));

CREATE POLICY "Admins can delete interview photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'interview-photos' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')));

-- interview-audio
CREATE POLICY "Approved users can read interview audio"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'interview-audio' AND is_user_approved(auth.uid()));

CREATE POLICY "Approved users can upload interview audio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'interview-audio' AND is_user_approved(auth.uid()));

CREATE POLICY "Approved users can update interview audio"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'interview-audio' AND is_user_approved(auth.uid()));

CREATE POLICY "Admins can delete interview audio"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'interview-audio' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')));

-- =============================================
-- 3. FIX user_notifications INSERT POLICY
-- =============================================
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Service role inserts notifications" ON public.user_notifications;
-- Only service_role (triggers) can insert. No client-side INSERT needed.
-- Triggers run as SECURITY DEFINER so they bypass RLS.

-- =============================================
-- 4. FIX sms_notification_logs INSERT POLICY
-- =============================================
DROP POLICY IF EXISTS "Service role can insert SMS logs" ON public.sms_notification_logs;
-- Edge function uses service_role key which bypasses RLS, so no INSERT policy needed.

-- =============================================
-- 5. FIX user_achievement_progress ALL POLICY
-- =============================================
DROP POLICY IF EXISTS "Service role can manage progress" ON public.user_achievement_progress;
-- Edge function (check-achievements) uses service_role key which bypasses RLS.
-- Keep only the user's own SELECT policy.

-- =============================================
-- 6. FIX user_achievements INSERT POLICY
-- =============================================
DROP POLICY IF EXISTS "Service role can insert user achievements" ON public.user_achievements;
-- Edge function uses service_role key which bypasses RLS, so no INSERT policy needed from public.

-- =============================================
-- 7. FIX admin_notifications INSERT POLICY
-- =============================================
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.admin_notifications;
CREATE POLICY "Admins can insert notifications"
ON public.admin_notifications FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- =============================================
-- 8. RESTRICT audits DELETE TO ADMINS ONLY
-- =============================================
DROP POLICY IF EXISTS "Authenticated approved users can delete audits" ON public.audits;
CREATE POLICY "Only admins can delete audits"
ON public.audits FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- =============================================
-- 9. RESTRICT interview_metadata DELETE TO ADMINS
-- =============================================
DROP POLICY IF EXISTS "Authenticated approved users can delete metadata" ON public.interview_metadata;
CREATE POLICY "Only admins can delete metadata"
ON public.interview_metadata FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
