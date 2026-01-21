-- Create SMS notification logs table
CREATE TABLE public.sms_notification_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID REFERENCES public.audits(id),
  file_name TEXT,
  interviewer_code TEXT,
  contractor_id TEXT,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  recipients_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_response JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_notification_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view SMS logs
CREATE POLICY "Admins can view SMS logs"
  ON public.sms_notification_logs
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Service role can insert logs (from edge function)
CREATE POLICY "Service role can insert SMS logs"
  ON public.sms_notification_logs
  FOR INSERT
  WITH CHECK (true);

-- Add index for faster queries
CREATE INDEX idx_sms_logs_created_at ON public.sms_notification_logs(created_at DESC);
CREATE INDEX idx_sms_logs_status ON public.sms_notification_logs(status);