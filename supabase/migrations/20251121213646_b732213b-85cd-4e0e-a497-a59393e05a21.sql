-- Allow users to update their own profile (only specific fields)
-- This policy ensures users can modify full_name and phone but not email or contractor_id
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id 
  AND email = (SELECT email FROM profiles WHERE id = auth.uid())
  AND contractor_id = (SELECT contractor_id FROM profiles WHERE id = auth.uid())
);