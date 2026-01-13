-- =============================================
-- PUSH NOTIFICATION SYSTEM TABLES
-- =============================================

-- Store user notification preferences and push subscription data
CREATE TABLE public.user_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  push_subscription JSONB,
  notify_inactivity BOOLEAN DEFAULT true,
  notify_new_interviews BOOLEAN DEFAULT true,
  notify_re_audit BOOLEAN DEFAULT true,
  notify_failed_audit BOOLEAN DEFAULT true,
  notify_milestones BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Store individual notifications for each user
CREATE TABLE public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- ACHIEVEMENT SYSTEM TABLES
-- =============================================

-- Achievement definitions
CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  category TEXT NOT NULL,
  criteria_type TEXT NOT NULL,
  criteria_value INTEGER NOT NULL,
  criteria_field TEXT,
  badge_color TEXT DEFAULT 'gold',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User achievements (earned)
CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT now(),
  progress_value INTEGER DEFAULT 0,
  UNIQUE(user_id, achievement_id)
);

-- Track progress toward achievements
CREATE TABLE public.user_achievement_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  current_value INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievement_progress ENABLE ROW LEVEL SECURITY;

-- Notification Settings Policies
CREATE POLICY "Users can view their own notification settings"
ON public.user_notification_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification settings"
ON public.user_notification_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification settings"
ON public.user_notification_settings FOR UPDATE
USING (auth.uid() = user_id);

-- User Notifications Policies
CREATE POLICY "Users can view their own notifications"
ON public.user_notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.user_notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert notifications"
ON public.user_notifications FOR INSERT
WITH CHECK (true);

-- Achievements Policies (public read, admin write)
CREATE POLICY "Anyone can view achievements"
ON public.achievements FOR SELECT
USING (true);

CREATE POLICY "Admins can manage achievements"
ON public.achievements FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- User Achievements Policies
CREATE POLICY "Users can view their own achievements"
ON public.user_achievements FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can view others achievements"
ON public.user_achievements FOR SELECT
USING (true);

CREATE POLICY "Service role can insert user achievements"
ON public.user_achievements FOR INSERT
WITH CHECK (true);

-- User Achievement Progress Policies
CREATE POLICY "Users can view their own progress"
ON public.user_achievement_progress FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage progress"
ON public.user_achievement_progress FOR ALL
USING (true);

-- =============================================
-- SEED ACHIEVEMENT DEFINITIONS
-- =============================================

INSERT INTO public.achievements (code, name, description, icon, category, criteria_type, criteria_value, criteria_field, badge_color) VALUES
-- General achievements (all users)
('first_steps', 'First Steps', 'Complete your first action in the system', 'Footprints', 'general', 'count', 1, 'actions', 'bronze'),
('dedicated_user', 'Dedicated User', 'Stay active for 7 consecutive days', 'Calendar', 'general', 'streak', 7, 'login_streak', 'silver'),
('veteran', 'Veteran', 'Stay active for 30 consecutive days', 'Award', 'general', 'streak', 30, 'login_streak', 'gold'),

-- Auditor achievements
('first_review', 'First Review', 'Complete your first audit review', 'FileCheck', 'auditor', 'count', 1, 'reviews', 'bronze'),
('sharp_eye', 'Sharp Eye', 'Complete 10 audit reviews', 'Eye', 'auditor', 'count', 10, 'reviews', 'bronze'),
('quality_guardian', 'Quality Guardian', 'Complete 50 audit reviews', 'Shield', 'auditor', 'count', 50, 'silver', 'silver'),
('master_auditor', 'Master Auditor', 'Complete 100 audit reviews', 'Crown', 'auditor', 'count', 100, 'reviews', 'gold'),
('elite_reviewer', 'Elite Reviewer', 'Complete 500 audit reviews', 'Star', 'auditor', 'count', 500, 'reviews', 'platinum'),
('speed_demon', 'Speed Demon', 'Complete 10 reviews in a single day', 'Zap', 'auditor', 'speed', 10, 'daily_reviews', 'gold'),
('accuracy_expert', 'Accuracy Expert', 'Maintain less than 5% re-audit rate', 'Target', 'auditor', 'rate', 95, 'accuracy_rate', 'platinum'),

-- Field Manager achievements
('team_builder', 'Team Builder', 'Register 5 interviewers to your team', 'Users', 'field_manager', 'count', 5, 'team_size', 'bronze'),
('team_leader', 'Team Leader', 'Register 10 interviewers to your team', 'UserPlus', 'field_manager', 'count', 10, 'team_size', 'silver'),
('quality_focus', 'Quality Focus', 'Maintain 90%+ team pass rate', 'CheckCircle', 'field_manager', 'rate', 90, 'pass_rate', 'gold'),
('high_volume', 'High Volume', 'Team submits 100 interviews', 'TrendingUp', 'field_manager', 'count', 100, 'team_interviews', 'silver'),
('zero_defects', 'Zero Defects', 'Achieve 10 consecutive passed audits', 'Trophy', 'field_manager', 'streak', 10, 'pass_streak', 'platinum'),

-- Contractor achievements
('growing_business', 'Growing Business', 'Submit 50 interviews total', 'Briefcase', 'contractor', 'count', 50, 'total_interviews', 'bronze'),
('major_contributor', 'Major Contributor', 'Submit 200 interviews total', 'Building', 'contractor', 'count', 200, 'total_interviews', 'silver'),
('industry_leader', 'Industry Leader', 'Submit 500 interviews total', 'Globe', 'contractor', 'count', 500, 'total_interviews', 'gold'),
('quality_champion', 'Quality Champion', 'Maintain 95%+ pass rate', 'Medal', 'contractor', 'rate', 95, 'pass_rate', 'platinum'),
('rapid_turnaround', 'Rapid Turnaround', 'Submit re-audits within 24 hours consistently', 'Clock', 'contractor', 'speed', 5, 'fast_reaudits', 'gold'),

-- Admin achievements
('people_manager', 'People Manager', 'Approve 10 user registrations', 'UserCheck', 'admin', 'count', 10, 'approvals', 'bronze'),
('system_guardian', 'System Guardian', 'Process 50 admin actions', 'Settings', 'admin', 'count', 50, 'admin_actions', 'silver'),
('data_steward', 'Data Steward', 'Export 100 team assignments', 'Download', 'admin', 'count', 100, 'exports', 'gold');

-- =============================================
-- TRIGGERS AND FUNCTIONS
-- =============================================

-- Function to update notification settings timestamp
CREATE OR REPLACE FUNCTION public.update_notification_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON public.user_notification_settings
FOR EACH ROW EXECUTE FUNCTION public.update_notification_settings_updated_at();

-- Function to notify on new interview upload
CREATE OR REPLACE FUNCTION public.notify_new_interview()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notifications for all auditors and admins
  INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
  SELECT 
    ur.user_id,
    'new_interview',
    'New Interview Uploaded',
    'A new interview "' || NEW.file_name || '" is ready for review',
    jsonb_build_object('audit_id', NEW.id, 'file_name', NEW.file_name)
  FROM public.user_roles ur
  INNER JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role IN ('auditor', 'admin')
    AND p.is_approved = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_new_interview_upload
AFTER INSERT ON public.audits
FOR EACH ROW
WHEN (NEW.status = 'Awaiting Review')
EXECUTE FUNCTION public.notify_new_interview();

-- Function to notify on failed audit
CREATE OR REPLACE FUNCTION public.notify_failed_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_contractor_id TEXT;
  v_field_manager TEXT;
  v_interviewer_code TEXT;
  v_field_manager_user_id UUID;
BEGIN
  -- Only trigger when status changes to 'Audit Failed'
  IF NEW.status = 'Audit Failed' AND (OLD.status IS NULL OR OLD.status != 'Audit Failed') THEN
    -- Get metadata
    SELECT contractor_id, field_manager, interviewer_code
    INTO v_contractor_id, v_field_manager, v_interviewer_code
    FROM public.interview_metadata
    WHERE audit_id = NEW.id;
    
    -- Notify contractor users
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    SELECT 
      p.id,
      'failed_audit',
      'Interview Failed Audit',
      'Interview "' || NEW.file_name || '" has failed audit review',
      jsonb_build_object('audit_id', NEW.id, 'file_name', NEW.file_name, 'review_comment', NEW.review_comment)
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE (p.contractor_id = v_contractor_id OR p.active_contractor_id = v_contractor_id)
      AND ur.role = 'contractor';
    
    -- Get field manager user ID from team_assignments
    SELECT field_manager_id INTO v_field_manager_user_id
    FROM public.team_assignments
    WHERE interviewer_code = v_interviewer_code
      AND status = 'approved'
    LIMIT 1;
    
    -- Notify field manager
    IF v_field_manager_user_id IS NOT NULL THEN
      INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
      VALUES (
        v_field_manager_user_id,
        'failed_audit',
        'Team Interview Failed Audit',
        'Interview "' || NEW.file_name || '" from your team has failed audit',
        jsonb_build_object('audit_id', NEW.id, 'file_name', NEW.file_name, 'interviewer_code', v_interviewer_code)
      );
    END IF;
    
    -- Notify admins
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    SELECT 
      ur.user_id,
      'failed_audit',
      'Interview Failed Audit',
      'Interview "' || NEW.file_name || '" has failed audit review',
      jsonb_build_object('audit_id', NEW.id, 'file_name', NEW.file_name)
    FROM public.user_roles ur
    WHERE ur.role = 'admin';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_audit_failed
AFTER UPDATE ON public.audits
FOR EACH ROW
EXECUTE FUNCTION public.notify_failed_audit();

-- Function to notify on re-audit request
CREATE OR REPLACE FUNCTION public.notify_re_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_original_reviewer_id UUID;
  v_file_name TEXT;
BEGIN
  -- Get the original reviewer (auditor who failed it)
  SELECT reviewed_by, file_name 
  INTO v_original_reviewer_id, v_file_name
  FROM public.audits
  WHERE id = NEW.audit_id;
  
  -- Notify the original reviewer
  IF v_original_reviewer_id IS NOT NULL THEN
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    VALUES (
      v_original_reviewer_id,
      're_audit',
      'Re-Audit Submitted',
      'Interview "' || v_file_name || '" has been resubmitted for review',
      jsonb_build_object('audit_id', NEW.audit_id, 'file_name', v_file_name, 'submission_id', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_re_audit_submission
AFTER INSERT ON public.re_audit_submissions
FOR EACH ROW
EXECUTE FUNCTION public.notify_re_audit();

-- Create indexes for better query performance
CREATE INDEX idx_user_notifications_user_id ON public.user_notifications(user_id);
CREATE INDEX idx_user_notifications_is_read ON public.user_notifications(is_read);
CREATE INDEX idx_user_notifications_created_at ON public.user_notifications(created_at DESC);
CREATE INDEX idx_user_achievements_user_id ON public.user_achievements(user_id);
CREATE INDEX idx_user_achievement_progress_user_id ON public.user_achievement_progress(user_id);