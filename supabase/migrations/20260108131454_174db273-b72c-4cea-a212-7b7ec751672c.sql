-- Create user_session_history table for tracking login sessions
CREATE TABLE public.user_session_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  logout_reason TEXT, -- 'manual', 'inactivity', 'tab_close', etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_session_history ENABLE ROW LEVEL SECURITY;

-- Users can view their own session history
CREATE POLICY "Users can view own session history"
ON public.user_session_history
FOR SELECT
USING (auth.uid() = user_id);

-- Super admins and admins can view all session history
CREATE POLICY "Admins can view all session history"
ON public.user_session_history
FOR SELECT
USING (
  public.has_role(auth.uid(), 'super_admin') OR 
  public.has_role(auth.uid(), 'admin')
);

-- Users can insert their own session records
CREATE POLICY "Users can insert own sessions"
ON public.user_session_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own session records (to set end time)
CREATE POLICY "Users can update own sessions"
ON public.user_session_history
FOR UPDATE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_session_history_user_id ON public.user_session_history(user_id);
CREATE INDEX idx_session_history_started_at ON public.user_session_history(session_started_at DESC);