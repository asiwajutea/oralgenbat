-- Drop the old SELECT policy
DROP POLICY IF EXISTS "Field managers can view own assignments" ON team_assignments;

-- Create new scoped SELECT policy
CREATE POLICY "Field managers and authorized users can view assignments"
ON team_assignments 
FOR SELECT
TO authenticated
USING (
  -- Field managers can view their own submissions
  (auth.uid() = field_manager_id)
  OR
  -- Contractors can only view assignments for their contractor_id
  (has_role(auth.uid(), 'contractor'::app_role) 
   AND contractor_id = (SELECT contractor_id FROM profiles WHERE id = auth.uid()))
  OR
  -- Admins can view all assignments
  has_role(auth.uid(), 'admin'::app_role)
  OR
  has_role(auth.uid(), 'super_admin'::app_role)
);