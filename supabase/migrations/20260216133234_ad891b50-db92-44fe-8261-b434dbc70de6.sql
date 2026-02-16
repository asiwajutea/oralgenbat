
-- Enable realtime on user_notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;

-- Add new notification setting columns
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS notify_audit_passed boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_team_requests boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_interview_assigned boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_data_entry_complete boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_account_status boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_new_registration boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_payment boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_agent_reassigned boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_issues boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_comments boolean DEFAULT true;
