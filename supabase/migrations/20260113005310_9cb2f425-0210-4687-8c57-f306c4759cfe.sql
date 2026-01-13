-- Create user_contractor_assignments table for multi-contractor support
CREATE TABLE public.user_contractor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contractor_id TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_user_contractor UNIQUE (user_id, contractor_id)
);

-- Create indexes for fast lookups
CREATE INDEX idx_user_contractor_user_id ON user_contractor_assignments(user_id);
CREATE INDEX idx_user_contractor_contractor_id ON user_contractor_assignments(contractor_id);

-- Enable RLS
ALTER TABLE user_contractor_assignments ENABLE ROW LEVEL SECURITY;

-- Users can view their own contractor assignments
CREATE POLICY "Users can view own contractor assignments" 
ON user_contractor_assignments
FOR SELECT 
USING (auth.uid() = user_id);

-- Admins can manage all contractor assignments
CREATE POLICY "Admins can manage contractor assignments" 
ON user_contractor_assignments
FOR ALL 
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- Add active_contractor_id column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_contractor_id TEXT;

-- Set default active_contractor_id to current contractor_id for existing users
UPDATE profiles SET active_contractor_id = contractor_id WHERE active_contractor_id IS NULL;

-- Allow users to update their own active_contractor_id
CREATE POLICY "Users can update own active_contractor_id"
ON profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);