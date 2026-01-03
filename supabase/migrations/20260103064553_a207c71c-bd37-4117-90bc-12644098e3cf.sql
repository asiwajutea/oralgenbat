-- Add PDF manual adjustment flag to interview_metadata
ALTER TABLE public.interview_metadata
ADD COLUMN pdf_scores_manually_adjusted BOOLEAN DEFAULT FALSE;

-- Create data entry teams table
CREATE TABLE public.data_entry_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Create interview assignments table
CREATE TABLE public.interview_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.data_entry_teams(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  total_names INTEGER,
  notes TEXT,
  UNIQUE(audit_id)
);

-- Enable RLS on new tables
ALTER TABLE public.data_entry_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for data_entry_teams
CREATE POLICY "Admins can manage teams"
ON public.data_entry_teams
FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Approved users can view teams"
ON public.data_entry_teams
FOR SELECT
USING (is_user_approved(auth.uid()));

-- RLS Policies for interview_assignments
CREATE POLICY "Admins can manage assignments"
ON public.interview_assignments
FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Approved users can view assignments"
ON public.interview_assignments
FOR SELECT
USING (is_user_approved(auth.uid()));