
CREATE OR REPLACE FUNCTION public.email_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  available_vars JSONB NOT NULL DEFAULT '[]'::jsonb,
  notification_type TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view email templates" ON public.email_templates FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Admins can update email templates" ON public.email_templates FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Admins can insert email templates" ON public.email_templates FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER trg_email_templates_updated_at BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.email_set_updated_at();

CREATE TABLE IF NOT EXISTS public.email_notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  subject TEXT,
  body_preview TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  provider_response JSONB,
  audit_id UUID,
  triggered_by_event TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_notification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON public.email_notification_logs(template_key);
ALTER TABLE public.email_notification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view email logs" ON public.email_notification_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Admins can delete email logs" ON public.email_notification_logs FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TABLE IF NOT EXISTS public.user_email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  emails_enabled BOOLEAN NOT NULL DEFAULT true,
  notify_audit_passed BOOLEAN NOT NULL DEFAULT true,
  notify_failed_audit BOOLEAN NOT NULL DEFAULT true,
  notify_re_audit BOOLEAN NOT NULL DEFAULT true,
  notify_new_interviews BOOLEAN NOT NULL DEFAULT true,
  notify_team_requests BOOLEAN NOT NULL DEFAULT true,
  notify_agent_reassigned BOOLEAN NOT NULL DEFAULT true,
  notify_interview_assigned BOOLEAN NOT NULL DEFAULT true,
  notify_account_status BOOLEAN NOT NULL DEFAULT true,
  notify_new_registration BOOLEAN NOT NULL DEFAULT true,
  notify_payment BOOLEAN NOT NULL DEFAULT true,
  notify_data_entry_complete BOOLEAN NOT NULL DEFAULT true,
  notify_issues BOOLEAN NOT NULL DEFAULT true,
  notify_comments BOOLEAN NOT NULL DEFAULT true,
  notify_milestones BOOLEAN NOT NULL DEFAULT true,
  notify_inactivity BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_email_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own email preferences" ON public.user_email_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own email preferences" ON public.user_email_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own email preferences" ON public.user_email_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all email preferences" ON public.user_email_preferences FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER trg_user_email_prefs_updated_at BEFORE UPDATE ON public.user_email_preferences
  FOR EACH ROW EXECUTE FUNCTION public.email_set_updated_at();

INSERT INTO public.email_templates (key, name, description, notification_type, subject, body_html, body_text, available_vars) VALUES
('audit_passed','Audit Passed','Sent when an interview passes audit','audit_passed',
 'Your interview {{file_name}} passed audit',
 '<p>Hi {{recipient_name}},</p><p>Good news — interview <strong>{{file_name}}</strong> has passed audit.</p><p>{{message}}</p><p>— BAT Audit</p>',
 E'Hi {{recipient_name}},\n\nInterview {{file_name}} has passed audit.\n\n{{message}}\n\n— BAT Audit',
 '["recipient_name","file_name","message","interviewer_code","contractor_id"]'::jsonb),
('audit_failed','Audit Failed','Sent when an interview fails audit','failed_audit',
 'Action required: {{file_name}} failed audit',
 '<p>Hi {{recipient_name}},</p><p>Interview <strong>{{file_name}}</strong> has failed audit.</p><p>{{message}}</p><p>Please review and submit corrections.</p><p>— BAT Audit</p>',
 E'Hi {{recipient_name}},\n\nInterview {{file_name}} has failed audit.\n\n{{message}}\n\nPlease submit corrections.\n\n— BAT Audit',
 '["recipient_name","file_name","message","interviewer_code","contractor_id"]'::jsonb),
('re_audit_requested','Re-Audit Requested','Sent when an interview is sent for re-audit','re_audit',
 'Re-audit requested: {{file_name}}',
 '<p>Hi {{recipient_name}},</p><p>{{message}}</p><p>— BAT Audit</p>',
 E'Hi {{recipient_name}},\n\n{{message}}\n\n— BAT Audit',
 '["recipient_name","file_name","message"]'::jsonb),
('new_interview_uploaded','New Interview Uploaded','Sent when a new interview is uploaded','new_interviews',
 'New interview uploaded: {{file_name}}',
 '<p>Hi {{recipient_name}},</p><p>A new interview <strong>{{file_name}}</strong> has been uploaded.</p><p>{{message}}</p>',
 E'Hi {{recipient_name}},\n\nNew interview {{file_name}} uploaded.\n\n{{message}}',
 '["recipient_name","file_name","message"]'::jsonb),
('team_request','Team Request','Team assignment request, approval, or rejection','team_requests',
 'Team update: {{title}}',
 '<p>Hi {{recipient_name}},</p><p><strong>{{title}}</strong></p><p>{{message}}</p>',
 E'Hi {{recipient_name}},\n\n{{title}}\n\n{{message}}',
 '["recipient_name","title","message"]'::jsonb),
('agent_reassigned','Agent Reassigned','Sent when an agent is reassigned between FMs','agent_reassigned',
 'Agent reassigned',
 '<p>Hi {{recipient_name}},</p><p>{{message}}</p>',
 E'Hi {{recipient_name}},\n\n{{message}}',
 '["recipient_name","message"]'::jsonb),
('interview_assigned','Interview Assigned','Sent when an interview is assigned to data entry','interview_assigned',
 'Interview assigned to you: {{file_name}}',
 '<p>Hi {{recipient_name}},</p><p>Interview <strong>{{file_name}}</strong> has been assigned to you.</p><p>{{message}}</p>',
 E'Hi {{recipient_name}},\n\nInterview {{file_name}} assigned to you.\n\n{{message}}',
 '["recipient_name","file_name","message"]'::jsonb),
('account_status','Account Status Change','Sent on account approval or suspension','account_status',
 'Account update',
 '<p>Hi {{recipient_name}},</p><p>{{title}}</p><p>{{message}}</p>',
 E'Hi {{recipient_name}},\n\n{{title}}\n\n{{message}}',
 '["recipient_name","title","message"]'::jsonb),
('new_registration','New Registration Pending','Sent to admins when a new user registers','new_registration',
 'New user awaiting approval',
 '<p>Hi {{recipient_name}},</p><p>{{message}}</p><p>Please review pending registrations.</p>',
 E'Hi {{recipient_name}},\n\n{{message}}\n\nPlease review pending registrations.',
 '["recipient_name","message"]'::jsonb),
('payment_recorded','Payment Recorded','Sent on payment / booklet journey updates','payment',
 'Payment update',
 '<p>Hi {{recipient_name}},</p><p>{{title}}</p><p>{{message}}</p>',
 E'Hi {{recipient_name}},\n\n{{title}}\n\n{{message}}',
 '["recipient_name","title","message"]'::jsonb),
('data_entry_complete','Data Entry Complete','Sent when data entry is completed','data_entry_complete',
 'Data entry complete: {{file_name}}',
 '<p>Hi {{recipient_name}},</p><p>Data entry has been completed for <strong>{{file_name}}</strong>.</p>',
 E'Hi {{recipient_name}},\n\nData entry complete for {{file_name}}.',
 '["recipient_name","file_name","message"]'::jsonb),
('issue_flagged','Issue Flagged / Resolved','Sent on issue flag or resolution','issues',
 '{{title}}',
 '<p>Hi {{recipient_name}},</p><p><strong>{{title}}</strong></p><p>{{message}}</p>',
 E'Hi {{recipient_name}},\n\n{{title}}\n\n{{message}}',
 '["recipient_name","title","message"]'::jsonb),
('comment_reply','Comment Reply','Sent on comment replies','comments',
 'New comment on {{file_name}}',
 '<p>Hi {{recipient_name}},</p><p>{{message}}</p>',
 E'Hi {{recipient_name}},\n\n{{message}}',
 '["recipient_name","file_name","message"]'::jsonb),
('achievement_earned','Achievement Earned','Sent when a user earns a new achievement','milestones',
 'You earned a new achievement!',
 '<p>Hi {{recipient_name}},</p><p>{{message}}</p><p>Keep up the great work!</p>',
 E'Hi {{recipient_name}},\n\n{{message}}\n\nKeep up the great work!',
 '["recipient_name","message"]'::jsonb),
('inactivity_reminder','Inactivity Reminder','Sent after extended inactivity','inactivity',
 'We miss you on BAT Audit',
 '<p>Hi {{recipient_name}},</p><p>{{message}}</p>',
 E'Hi {{recipient_name}},\n\n{{message}}',
 '["recipient_name","message"]'::jsonb),
('test_email','Test Email','Used by the admin test send button',NULL,
 'BAT Audit – test email',
 '<p>This is a <strong>test email</strong> from BAT Audit sent at {{timestamp}}.</p><p>If you received this, the email service is working correctly.</p>',
 'This is a test email from BAT Audit sent at {{timestamp}}. If you received this, the email service is working correctly.',
 '["timestamp","recipient_name"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.dispatch_email_on_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://qygxzefyqedhbkkfuojv.supabase.co/functions/v1/send-email-notification',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5Z3h6ZWZ5cWVkaGJra2Z1b2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDcxODUsImV4cCI6MjA3OTE4MzE4NX0.7MlUHcrtjxj1IYbBA93_NyII5cwpMgkT0_yVvSJ9gjk'
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'notification_type', NEW.type,
      'title', NEW.title,
      'message', NEW.message,
      'metadata', NEW.metadata,
      'notification_id', NEW.id
    )
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_dispatch_email_on_notification ON public.user_notifications;
CREATE TRIGGER trg_dispatch_email_on_notification
  AFTER INSERT ON public.user_notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_email_on_notification();
