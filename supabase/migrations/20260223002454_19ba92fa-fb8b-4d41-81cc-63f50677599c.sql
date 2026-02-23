
-- 1. Add DELETE policy on sms_notification_logs for admins
CREATE POLICY "Admins can delete SMS logs"
ON public.sms_notification_logs
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- 2. Create push_notifications table
CREATE TABLE public.push_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_type TEXT NOT NULL DEFAULT 'all',
  target_roles TEXT[] NULL,
  target_user_ids UUID[] NULL
);

ALTER TABLE public.push_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view push notifications"
ON public.push_notifications
FOR SELECT
USING (is_user_approved(auth.uid()));

CREATE POLICY "Admins and contractors can create push notifications"
ON public.push_notifications
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'contractor'::app_role) OR 
  has_role(auth.uid(), 'sub_contractor'::app_role) OR
  has_role(auth.uid(), 'quality_assurance_manager'::app_role)
);

-- 3. Create push_notification_deliveries table
CREATE TABLE public.push_notification_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  push_notification_id UUID NOT NULL REFERENCES public.push_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ NULL,
  interacted_at TIMESTAMPTZ NULL
);

ALTER TABLE public.push_notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push deliveries"
ON public.push_notification_deliveries
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own push deliveries"
ON public.push_notification_deliveries
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Approved users can insert push deliveries"
ON public.push_notification_deliveries
FOR INSERT
WITH CHECK (is_user_approved(auth.uid()));

CREATE POLICY "Admins can view all push deliveries"
ON public.push_notification_deliveries
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- 4. Add target_roles column to announcements
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS target_roles TEXT[] NULL;

-- 5. Create trigger for push notifications to create user_notifications
CREATE OR REPLACE FUNCTION public.notify_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert notification for targeted users
  INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
  SELECT 
    p.id,
    'push_notification',
    NEW.title,
    NEW.message,
    jsonb_build_object('push_notification_id', NEW.id)
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.is_approved = true
  AND (
    NEW.target_type = 'all' OR
    (NEW.target_type = 'roles' AND ur.role::text = ANY(NEW.target_roles)) OR
    (NEW.target_type = 'users' AND p.id = ANY(NEW.target_user_ids))
  );
  
  -- Also insert delivery records for tracking
  INSERT INTO public.push_notification_deliveries (push_notification_id, user_id)
  SELECT 
    NEW.id,
    p.id
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.is_approved = true
  AND (
    NEW.target_type = 'all' OR
    (NEW.target_type = 'roles' AND ur.role::text = ANY(NEW.target_roles)) OR
    (NEW.target_type = 'users' AND p.id = ANY(NEW.target_user_ids))
  );
  
  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_push_notification_created
AFTER INSERT ON public.push_notifications
FOR EACH ROW EXECUTE FUNCTION public.notify_push_notification();

-- 6. Update notify_new_announcement to support target_roles array
CREATE OR REPLACE FUNCTION public.notify_new_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active = true AND (NEW.scheduled_at IS NULL OR NEW.scheduled_at <= now()) THEN
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    SELECT 
      p.id,
      'announcement',
      'New Announcement: ' || NEW.title,
      LEFT(NEW.content, 100) || CASE WHEN LENGTH(NEW.content) > 100 THEN '...' ELSE '' END,
      jsonb_build_object('announcement_id', NEW.id)
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.is_approved = true
    AND (
      NEW.target_type = 'all' OR
      (NEW.target_type = 'contractor' AND (p.contractor_id = NEW.target_contractor_id OR p.active_contractor_id = NEW.target_contractor_id)) OR
      (NEW.target_type = 'role' AND (
        ur.role = NEW.target_role OR
        (NEW.target_roles IS NOT NULL AND ur.role::text = ANY(NEW.target_roles))
      )) OR
      (NEW.target_type = 'user' AND p.id = ANY(NEW.target_user_ids))
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Enable realtime for push_notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.push_notifications;
