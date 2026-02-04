-- Announcements table
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  cta_text text,
  cta_url text,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  scheduled_at timestamptz,
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  display_frequency text DEFAULT 'once' CHECK (display_frequency IN ('once', 'every_login', 'daily', 'weekly')),
  require_acknowledgment boolean DEFAULT false,
  target_type text DEFAULT 'all' CHECK (target_type IN ('all', 'contractor', 'role', 'user')),
  target_contractor_id text,
  target_role app_role,
  target_user_ids uuid[],
  priority integer DEFAULT 0,
  style text DEFAULT 'info' CHECK (style IN ('info', 'warning', 'success', 'announcement'))
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Dismissals table
CREATE TABLE public.announcement_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid REFERENCES public.announcements(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  dismissed_at timestamptz DEFAULT now(),
  acknowledged boolean DEFAULT false,
  UNIQUE(announcement_id, user_id)
);

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for announcements

-- Super admins can manage all announcements
CREATE POLICY "Super admins can manage all announcements"
  ON public.announcements FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

-- Authorized creators can insert announcements
CREATE POLICY "Authorized creators can insert announcements"
  ON public.announcements FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'super_admin') OR
    has_role(auth.uid(), 'contractor') OR
    has_role(auth.uid(), 'sub_contractor') OR
    has_role(auth.uid(), 'quality_assurance_manager')
  );

-- Users can view targeted active announcements
CREATE POLICY "Users can view targeted active announcements"
  ON public.announcements FOR SELECT
  USING (
    is_active = true AND
    (scheduled_at IS NULL OR scheduled_at <= now()) AND
    (expires_at IS NULL OR expires_at > now()) AND
    (
      target_type = 'all' OR
      (target_type = 'contractor' AND target_contractor_id IN (
        SELECT contractor_id FROM public.profiles WHERE id = auth.uid()
        UNION
        SELECT active_contractor_id FROM public.profiles WHERE id = auth.uid()
      )) OR
      (target_type = 'role' AND target_role IN (
        SELECT role FROM public.user_roles WHERE user_id = auth.uid()
      )) OR
      (target_type = 'user' AND auth.uid() = ANY(target_user_ids))
    )
  );

-- Creators can update own announcements
CREATE POLICY "Creators can update own announcements"
  ON public.announcements FOR UPDATE
  USING (created_by = auth.uid());

-- Creators can delete own announcements
CREATE POLICY "Creators can delete own announcements"
  ON public.announcements FOR DELETE
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'super_admin'));

-- RLS Policies for dismissals

-- Users can insert own dismissals
CREATE POLICY "Users can insert own dismissals"
  ON public.announcement_dismissals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view own dismissals
CREATE POLICY "Users can view own dismissals"
  ON public.announcement_dismissals FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update own dismissals
CREATE POLICY "Users can update own dismissals"
  ON public.announcement_dismissals FOR UPDATE
  USING (auth.uid() = user_id);