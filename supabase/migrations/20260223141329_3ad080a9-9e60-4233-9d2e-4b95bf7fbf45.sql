
-- Update notify_push_notification trigger to also call send-web-push edge function
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

  -- Call send-web-push edge function to deliver real browser push notifications
  PERFORM net.http_post(
    url := 'https://qygxzefyqedhbkkfuojv.supabase.co/functions/v1/send-web-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5Z3h6ZWZ5cWVkaGJra2Z1b2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDcxODUsImV4cCI6MjA3OTE4MzE4NX0.7MlUHcrtjxj1IYbBA93_NyII5cwpMgkT0_yVvSJ9gjk'
    ),
    body := jsonb_build_object(
      'push_notification_id', NEW.id,
      'title', NEW.title,
      'message', NEW.message,
      'target_type', NEW.target_type,
      'target_roles', NEW.target_roles,
      'target_user_ids', NEW.target_user_ids
    )
  );
  
  RETURN NEW;
END;
$function$;

-- Also update all notification triggers to call send-web-push for real-time push delivery
-- We'll create a helper function that sends web push for any user_notification insert
CREATE OR REPLACE FUNCTION public.send_web_push_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Call send-web-push edge function for individual notifications
  PERFORM net.http_post(
    url := 'https://qygxzefyqedhbkkfuojv.supabase.co/functions/v1/send-web-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5Z3h6ZWZ5cWVkaGJra2Z1b2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDcxODUsImV4cCI6MjA3OTE4MzE4NX0.7MlUHcrtjxj1IYbBA93_NyII5cwpMgkT0_yVvSJ9gjk'
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'type', NEW.type,
      'notification_id', NEW.id
    )
  );
  
  RETURN NEW;
END;
$function$;

-- Create trigger on user_notifications to send web push for ALL notification types
DROP TRIGGER IF EXISTS trigger_send_web_push_on_notification ON public.user_notifications;
CREATE TRIGGER trigger_send_web_push_on_notification
  AFTER INSERT ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.send_web_push_on_notification();
