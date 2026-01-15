
-- Add sub_contractor role to team_assignments policies

-- Update SELECT policy to include sub_contractors
DROP POLICY IF EXISTS "Field managers and authorized users can view assignments" ON public.team_assignments;
CREATE POLICY "Field managers and authorized users can view assignments" 
ON public.team_assignments 
FOR SELECT
USING (
  (auth.uid() = field_manager_id) OR 
  (has_role(auth.uid(), 'contractor'::app_role) AND (contractor_id = ( SELECT profiles.contractor_id FROM profiles WHERE (profiles.id = auth.uid())))) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role) OR
  (has_role(auth.uid(), 'sub_contractor'::app_role) AND field_manager_id IN (
    SELECT fmsa.field_manager_id 
    FROM field_manager_subcontractor_assignments fmsa 
    WHERE fmsa.sub_contractor_id = auth.uid() AND fmsa.is_active = true
  ))
);

-- Update UPDATE policy to include sub_contractors
DROP POLICY IF EXISTS "Contractors can update own contractor assignments" ON public.team_assignments;
CREATE POLICY "Contractors and sub_contractors can update assignments" 
ON public.team_assignments 
FOR UPDATE
USING (
  (has_role(auth.uid(), 'contractor'::app_role) AND (contractor_id = ( SELECT profiles.contractor_id FROM profiles WHERE (profiles.id = auth.uid())))) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role) OR
  (has_role(auth.uid(), 'sub_contractor'::app_role) AND field_manager_id IN (
    SELECT fmsa.field_manager_id 
    FROM field_manager_subcontractor_assignments fmsa 
    WHERE fmsa.sub_contractor_id = auth.uid() AND fmsa.is_active = true
  ))
);

-- Update INSERT policy to include sub_contractors
DROP POLICY IF EXISTS "Authorized users can insert team assignments" ON public.team_assignments;
CREATE POLICY "Authorized users can insert team assignments" 
ON public.team_assignments 
FOR INSERT
WITH CHECK (
  (auth.uid() = field_manager_id) OR 
  (has_role(auth.uid(), 'contractor'::app_role) AND (contractor_id = ( SELECT profiles.contractor_id FROM profiles WHERE (profiles.id = auth.uid())))) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role) OR
  (has_role(auth.uid(), 'sub_contractor'::app_role) AND field_manager_id IN (
    SELECT fmsa.field_manager_id 
    FROM field_manager_subcontractor_assignments fmsa 
    WHERE fmsa.sub_contractor_id = auth.uid() AND fmsa.is_active = true
  ))
);

-- Allow sub_contractors to view profiles of their assigned field managers
DROP POLICY IF EXISTS "Sub-contractors can view assigned FM profiles" ON public.profiles;
CREATE POLICY "Sub-contractors can view assigned FM profiles"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'sub_contractor'::app_role) AND 
  id IN (
    SELECT fmsa.field_manager_id 
    FROM field_manager_subcontractor_assignments fmsa 
    WHERE fmsa.sub_contractor_id = auth.uid() AND fmsa.is_active = true
  )
);
