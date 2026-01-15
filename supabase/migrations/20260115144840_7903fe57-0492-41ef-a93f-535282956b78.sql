-- Create table for field manager to sub-contractor assignments
CREATE TABLE public.field_manager_subcontractor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sub_contractor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (field_manager_id, sub_contractor_id, is_active)
);

-- Enable RLS
ALTER TABLE public.field_manager_subcontractor_assignments ENABLE ROW LEVEL SECURITY;

-- Super admins can manage all FM-SubContractor assignments
CREATE POLICY "Super admins can manage all FM-SubContractor assignments"
ON public.field_manager_subcontractor_assignments
FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Sub-contractors can view their own FM assignments
CREATE POLICY "Sub-contractors can view their FM assignments"
ON public.field_manager_subcontractor_assignments
FOR SELECT
USING (sub_contractor_id = auth.uid());

-- Field managers can view their own sub-contractor assignments
CREATE POLICY "Field managers can view own sub-contractor assignments"
ON public.field_manager_subcontractor_assignments
FOR SELECT
USING (field_manager_id = auth.uid());

-- Admins can view all FM-SubContractor assignments
CREATE POLICY "Admins can view all FM-SubContractor assignments"
ON public.field_manager_subcontractor_assignments
FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'));