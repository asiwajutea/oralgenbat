-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Field managers and contractors can insert submissions" ON public.re_audit_submissions;

-- Create updated policy including admin and super_admin
CREATE POLICY "Authorized users can insert submissions" 
ON public.re_audit_submissions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = submitted_by AND (
    has_role(auth.uid(), 'field_manager'::app_role) OR 
    has_role(auth.uid(), 'contractor'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role)
  )
);