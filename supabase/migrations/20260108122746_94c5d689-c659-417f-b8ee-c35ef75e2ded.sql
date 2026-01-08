-- Create table for tracking team export batches
CREATE TABLE public.team_export_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.data_entry_teams(id) ON DELETE CASCADE,
  export_batch_id TEXT NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  total_files INTEGER NOT NULL DEFAULT 0,
  total_names INTEGER NOT NULL DEFAULT 0,
  file_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create table for user presence tracking
CREATE TABLE public.user_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  session_started_at TIMESTAMPTZ,
  last_session_duration_seconds INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.team_export_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- RLS policies for team_export_batches
CREATE POLICY "Admins can view all export batches"
ON public.team_export_batches
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can insert export batches"
ON public.team_export_batches
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- RLS policies for user_presence
CREATE POLICY "Users can view their own presence"
ON public.user_presence
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all presence"
ON public.user_presence
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can update their own presence"
ON public.user_presence
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own presence"
ON public.user_presence
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Enable realtime for user_presence
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;

-- Create index for faster lookups
CREATE INDEX idx_team_export_batches_team_id ON public.team_export_batches(team_id);
CREATE INDEX idx_user_presence_is_online ON public.user_presence(is_online);