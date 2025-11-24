-- Drop the existing overly permissive RLS policy
DROP POLICY IF EXISTS "Authorized users can update assignments" ON team_assignments;

-- Create new scoped policy: Contractors can only update assignments for their contractor_id
CREATE POLICY "Contractors can update own contractor assignments"
ON team_assignments 
FOR UPDATE
TO authenticated
USING (
  -- Contractors can only update requests for their contractor_id
  (has_role(auth.uid(), 'contractor'::app_role) 
   AND contractor_id = (SELECT contractor_id FROM profiles WHERE id = auth.uid()))
  OR
  -- Admins and super admins can update any request
  has_role(auth.uid(), 'admin'::app_role)
  OR
  has_role(auth.uid(), 'super_admin'::app_role)
);