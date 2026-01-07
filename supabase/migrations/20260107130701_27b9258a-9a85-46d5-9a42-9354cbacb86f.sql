-- Add review timer start time to audits
ALTER TABLE audits ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMP WITH TIME ZONE;

-- Create admin notifications table for system alerts
CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Only admins can read notifications
CREATE POLICY "Admins can read notifications"
  ON admin_notifications FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  );

-- Only admins can update (mark as read)
CREATE POLICY "Admins can update notifications"
  ON admin_notifications FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  );

-- Allow inserts from authenticated users (for edge functions via service role)
CREATE POLICY "Authenticated can insert notifications"
  ON admin_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);