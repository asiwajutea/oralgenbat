
-- Create interview_fm_overrides table for per-interview FM reassignment
CREATE TABLE public.interview_fm_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id uuid NOT NULL UNIQUE,
  field_manager_id uuid NOT NULL,
  assigned_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text
);

-- Enable RLS
ALTER TABLE public.interview_fm_overrides ENABLE ROW LEVEL SECURITY;

-- All approved users can view overrides
CREATE POLICY "Approved users can view overrides"
ON public.interview_fm_overrides
FOR SELECT
USING (is_user_approved(auth.uid()));

-- Authorized roles can insert overrides
CREATE POLICY "Authorized users can insert overrides"
ON public.interview_fm_overrides
FOR INSERT
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'field_manager') OR
    has_role(auth.uid(), 'contractor') OR
    has_role(auth.uid(), 'sub_contractor') OR
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'super_admin')
  )
);

-- Authorized roles can update overrides
CREATE POLICY "Authorized users can update overrides"
ON public.interview_fm_overrides
FOR UPDATE
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'field_manager') OR
    has_role(auth.uid(), 'contractor') OR
    has_role(auth.uid(), 'sub_contractor') OR
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'super_admin')
  )
);

-- Admins can delete overrides
CREATE POLICY "Admins can delete overrides"
ON public.interview_fm_overrides
FOR DELETE
USING (
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'super_admin')
);
