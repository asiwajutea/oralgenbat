
-- Add DELETE policy for re_audit_submissions (admin/super_admin)
CREATE POLICY "Admins can delete re_audit_submissions"
ON public.re_audit_submissions
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- Add DELETE policy for audit_checklist_progress (admin/super_admin)
CREATE POLICY "Admins can delete checklist progress"
ON public.audit_checklist_progress
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- Add DELETE policy for artifact_correction_comments (admin/super_admin)
CREATE POLICY "Admins can delete correction comments"
ON public.artifact_correction_comments
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- Also need to allow admins to read checklist progress for analytics
CREATE POLICY "All approved users can view checklist progress"
ON public.audit_checklist_progress
FOR SELECT
TO authenticated
USING (is_user_approved(auth.uid()));
