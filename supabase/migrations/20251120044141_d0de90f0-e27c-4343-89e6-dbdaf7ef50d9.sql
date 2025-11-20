-- Fix function search path security issue
CREATE OR REPLACE FUNCTION public.update_last_modified_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.last_modified = now();
  RETURN NEW;
END;
$$;