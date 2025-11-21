-- Create user roles enum
CREATE TYPE public.app_role AS ENUM (
  'field_manager',
  'auditor', 
  'contractor',
  'admin',
  'super_admin'
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  contractor_id TEXT NOT NULL CHECK (contractor_id IN ('NG68', 'NG71', 'NG75')),
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user roles table (CRITICAL for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Helper function to check if user is approved
CREATE OR REPLACE FUNCTION public.is_user_approved(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_approved FROM public.profiles WHERE id = _user_id),
    FALSE
  )
$$;

-- Create trigger for profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    phone,
    contractor_id,
    is_approved
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'contractor_id',
    FALSE
  );
  
  -- Assign the role from metadata
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, (NEW.raw_user_meta_data->>'role')::app_role);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for profiles table
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Admins can update profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'super_admin')
);

-- RLS Policies for user_roles table
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'super_admin')
);

-- Update existing tables to require authentication and approval
DROP POLICY IF EXISTS "Allow all operations on audits" ON public.audits;

CREATE POLICY "Authenticated approved users can view audits"
ON public.audits FOR SELECT
TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Authenticated approved users can insert audits"
ON public.audits FOR INSERT
TO authenticated
WITH CHECK (public.is_user_approved(auth.uid()));

CREATE POLICY "Authenticated approved users can update audits"
ON public.audits FOR UPDATE
TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Authenticated approved users can delete audits"
ON public.audits FOR DELETE
TO authenticated
USING (public.is_user_approved(auth.uid()));

-- Update interview_metadata policies
DROP POLICY IF EXISTS "Allow all operations on interview_metadata" ON public.interview_metadata;

CREATE POLICY "Authenticated approved users can view metadata"
ON public.interview_metadata FOR SELECT
TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Authenticated approved users can insert metadata"
ON public.interview_metadata FOR INSERT
TO authenticated
WITH CHECK (public.is_user_approved(auth.uid()));

CREATE POLICY "Authenticated approved users can update metadata"
ON public.interview_metadata FOR UPDATE
TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Authenticated approved users can delete metadata"
ON public.interview_metadata FOR DELETE
TO authenticated
USING (public.is_user_approved(auth.uid()));

-- Update interview_photos policies
DROP POLICY IF EXISTS "Allow all operations on interview_photos" ON public.interview_photos;

CREATE POLICY "Authenticated approved users can view photos"
ON public.interview_photos FOR SELECT
TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Authenticated approved users can insert photos"
ON public.interview_photos FOR INSERT
TO authenticated
WITH CHECK (public.is_user_approved(auth.uid()));

CREATE POLICY "Authenticated approved users can update photos"
ON public.interview_photos FOR UPDATE
TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Authenticated approved users can delete photos"
ON public.interview_photos FOR DELETE
TO authenticated
USING (public.is_user_approved(auth.uid()));