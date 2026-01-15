-- Create a security definer function to get a user's display name by ID
-- This allows any authenticated user to look up display names without full profile access
CREATE OR REPLACE FUNCTION public.get_user_display_name(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(full_name, email, 'Unknown User')
  FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$$;