-- Migrate existing contractor_id from profiles to user_contractor_assignments
-- This ensures users with a contractor_id in their profile have it in the assignments table
INSERT INTO user_contractor_assignments (user_id, contractor_id, is_primary, assigned_at)
SELECT 
  p.id as user_id,
  p.contractor_id,
  CASE 
    WHEN EXISTS (SELECT 1 FROM user_contractor_assignments WHERE user_id = p.id) THEN false
    ELSE true
  END as is_primary,
  now() as assigned_at
FROM profiles p
WHERE p.contractor_id IS NOT NULL
AND p.contractor_id != ''
AND NOT EXISTS (
  SELECT 1 FROM user_contractor_assignments uca 
  WHERE uca.user_id = p.id AND uca.contractor_id = p.contractor_id
);

-- Update active_contractor_id to default to contractor_id where it's null
UPDATE profiles
SET active_contractor_id = contractor_id
WHERE active_contractor_id IS NULL 
AND contractor_id IS NOT NULL 
AND contractor_id != '';