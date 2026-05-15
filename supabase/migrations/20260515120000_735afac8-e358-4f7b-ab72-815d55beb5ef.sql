-- Drop trigger first to stop firing into the dead edge function
DROP TRIGGER IF EXISTS trg_dispatch_email_on_notification ON public.user_notifications;
DROP FUNCTION IF EXISTS public.dispatch_email_on_notification() CASCADE;

-- Drop updated_at triggers and helper
DROP TRIGGER IF EXISTS trg_email_templates_updated_at ON public.email_templates;
DROP TRIGGER IF EXISTS trg_user_email_prefs_updated_at ON public.user_email_preferences;
DROP FUNCTION IF EXISTS public.email_set_updated_at() CASCADE;

-- Drop tables
DROP TABLE IF EXISTS public.email_notification_logs CASCADE;
DROP TABLE IF EXISTS public.email_templates CASCADE;
DROP TABLE IF EXISTS public.user_email_preferences CASCADE;