ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS passed_with_failures boolean DEFAULT false;
ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS pass_override_reason text;
ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS pass_override_action_plan text;