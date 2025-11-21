-- Create team_assignments table
CREATE TABLE public.team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_manager_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interviewer_code TEXT NOT NULL,
  contractor_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  notes TEXT,
  UNIQUE(field_manager_id, interviewer_code)
);

-- Create re_audit_submissions table
CREATE TABLE public.re_audit_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES auth.users(id),
  submitted_by_role app_role NOT NULL,
  submission_comment TEXT,
  replaced_pdf BOOLEAN DEFAULT false,
  replaced_zip BOOLEAN DEFAULT false,
  new_pdf_url TEXT,
  new_zip_url TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns to audits table
ALTER TABLE public.audits 
ADD COLUMN IF NOT EXISTS is_re_audit BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS re_audit_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS original_status audit_status;

-- Enable RLS on new tables
ALTER TABLE public.team_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.re_audit_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for team_assignments
CREATE POLICY "Field managers can insert own assignments"
ON public.team_assignments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = field_manager_id);

CREATE POLICY "Field managers can view own assignments"
ON public.team_assignments
FOR SELECT
TO authenticated
USING (
  auth.uid() = field_manager_id OR
  has_role(auth.uid(), 'contractor'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Authorized users can update assignments"
ON public.team_assignments
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'contractor'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Field managers can delete pending assignments"
ON public.team_assignments
FOR DELETE
TO authenticated
USING (auth.uid() = field_manager_id AND status = 'pending');

-- RLS Policies for re_audit_submissions
CREATE POLICY "Field managers and contractors can insert submissions"
ON public.re_audit_submissions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = submitted_by AND
  (has_role(auth.uid(), 'field_manager'::app_role) OR has_role(auth.uid(), 'contractor'::app_role))
);

CREATE POLICY "Authorized users can view submissions"
ON public.re_audit_submissions
FOR SELECT
TO authenticated
USING (
  auth.uid() = submitted_by OR
  has_role(auth.uid(), 'auditor'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- Create function to mark audit for re-audit
CREATE OR REPLACE FUNCTION public.mark_audit_for_reaudit(
  _audit_id UUID,
  _submitted_by UUID,
  _submitted_by_role app_role,
  _comment TEXT,
  _new_pdf_url TEXT DEFAULT NULL,
  _new_zip_url TEXT DEFAULT NULL
) RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update audit
  UPDATE audits 
  SET 
    is_re_audit = true,
    re_audit_count = re_audit_count + 1,
    original_status = CASE WHEN original_status IS NULL THEN status ELSE original_status END,
    status = 'Awaiting Review'::audit_status,
    file_url = COALESCE(_new_pdf_url, file_url),
    mobile_zip_url = COALESCE(_new_zip_url, mobile_zip_url),
    last_modified = now()
  WHERE id = _audit_id;
  
  -- Log the submission
  INSERT INTO re_audit_submissions (
    audit_id,
    submitted_by,
    submitted_by_role,
    submission_comment,
    replaced_pdf,
    replaced_zip,
    new_pdf_url,
    new_zip_url
  ) VALUES (
    _audit_id,
    _submitted_by,
    _submitted_by_role,
    _comment,
    _new_pdf_url IS NOT NULL,
    _new_zip_url IS NOT NULL,
    _new_pdf_url,
    _new_zip_url
  );
END;
$$;