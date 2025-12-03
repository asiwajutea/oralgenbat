-- Create table to store audit checklist progress
CREATE TABLE public.audit_checklist_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_index integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  has_failures boolean NOT NULL DEFAULT false,
  failure_comments text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(audit_id)
);

-- Enable RLS
ALTER TABLE public.audit_checklist_progress ENABLE ROW LEVEL SECURITY;

-- Auditors can manage their own progress
CREATE POLICY "Auditors can view checklist progress"
ON public.audit_checklist_progress
FOR SELECT
USING (
  has_role(auth.uid(), 'auditor') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Auditors can insert checklist progress"
ON public.audit_checklist_progress
FOR INSERT
WITH CHECK (
  auth.uid() = reviewer_id AND (
    has_role(auth.uid(), 'auditor') OR 
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'super_admin')
  )
);

CREATE POLICY "Auditors can update checklist progress"
ON public.audit_checklist_progress
FOR UPDATE
USING (
  auth.uid() = reviewer_id AND (
    has_role(auth.uid(), 'auditor') OR 
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'super_admin')
  )
);

CREATE POLICY "Auditors can delete checklist progress"
ON public.audit_checklist_progress
FOR DELETE
USING (
  auth.uid() = reviewer_id AND (
    has_role(auth.uid(), 'auditor') OR 
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'super_admin')
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_audit_checklist_progress_updated_at
BEFORE UPDATE ON public.audit_checklist_progress
FOR EACH ROW
EXECUTE FUNCTION public.update_interview_metadata_updated_at();