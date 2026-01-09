-- Fix Field Manager Assignment - Allow contractors and admins to insert team assignments
DROP POLICY IF EXISTS "Field managers can insert own assignments" ON team_assignments;

CREATE POLICY "Authorized users can insert team assignments" 
ON team_assignments FOR INSERT TO authenticated 
WITH CHECK (
  auth.uid() = field_manager_id 
  OR 
  (has_role(auth.uid(), 'contractor'::app_role) 
   AND contractor_id = (SELECT profiles.contractor_id FROM profiles WHERE profiles.id = auth.uid()))
  OR
  has_role(auth.uid(), 'admin'::app_role)
  OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- Fix Export Batch History - Allow data entry roles to view
DROP POLICY IF EXISTS "Admins can view all export batches" ON team_export_batches;

CREATE POLICY "Authorized users can view export batches"
ON team_export_batches FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'data_entry_clerk'::app_role)
  OR has_role(auth.uid(), 'quality_assurance_manager'::app_role)
);