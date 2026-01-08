-- Create field_manager_admin_assignments table for tracking which field managers are assigned to which admins
CREATE TABLE public.field_manager_admin_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_manager_id UUID NOT NULL,
  admin_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(field_manager_id, admin_id)
);

-- Enable RLS
ALTER TABLE public.field_manager_admin_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies for field_manager_admin_assignments
CREATE POLICY "Super admins can manage all FM assignments"
ON public.field_manager_admin_assignments
FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can view their FM assignments"
ON public.field_manager_admin_assignments
FOR SELECT
USING (
  admin_id = auth.uid() OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Field managers can view own admin assignments"
ON public.field_manager_admin_assignments
FOR SELECT
USING (field_manager_id = auth.uid());

-- Add entry_status columns to interview_assignments
ALTER TABLE public.interview_assignments 
ADD COLUMN IF NOT EXISTS entry_status TEXT DEFAULT 'typing_in_progress';

ALTER TABLE public.interview_assignments 
ADD COLUMN IF NOT EXISTS entry_completed_by UUID;

ALTER TABLE public.interview_assignments 
ADD COLUMN IF NOT EXISTS entry_completed_at TIMESTAMPTZ;

-- RLS policy for data entry clerks and QA managers to update entry_status
CREATE POLICY "Data entry roles can update entry status"
ON public.interview_assignments
FOR UPDATE
USING (
  has_role(auth.uid(), 'data_entry_clerk') OR 
  has_role(auth.uid(), 'quality_assurance_manager') OR
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Data entry roles can view all assignments"
ON public.interview_assignments
FOR SELECT
USING (
  has_role(auth.uid(), 'data_entry_clerk') OR 
  has_role(auth.uid(), 'quality_assurance_manager')
);