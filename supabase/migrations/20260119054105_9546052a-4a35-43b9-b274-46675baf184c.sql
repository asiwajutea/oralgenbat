-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Update the notify_failed_audit function to also trigger SMS notification
CREATE OR REPLACE FUNCTION public.notify_failed_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    
    -- Notify contractor users (existing in-app notification logic)
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
    
    -- Notify field manager (existing in-app notification logic)
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
    
    -- Notify admins (existing in-app notification logic)
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    SELECT 
      ur.user_id,
      'failed_audit',
      'Interview Failed Audit',
      'Interview "' || NEW.file_name || '" has failed audit review',
      jsonb_build_object('audit_id', NEW.id, 'file_name', NEW.file_name)
    FROM public.user_roles ur
    WHERE ur.role = 'admin';
    
    -- NEW: Call edge function to send SMS notifications to Field Managers and Sub-Contractors
    PERFORM net.http_post(
      url := 'https://qygxzefyqedhbkkfuojv.supabase.co/functions/v1/send-failed-audit-sms',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5Z3h6ZWZ5cWVkaGJra2Z1b2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDcxODUsImV4cCI6MjA3OTE4MzE4NX0.7MlUHcrtjxj1IYbBA93_NyII5cwpMgkT0_yVvSJ9gjk'
      ),
      body := jsonb_build_object(
        'audit_id', NEW.id,
        'file_name', NEW.file_name,
        'interviewer_code', v_interviewer_code,
        'contractor_id', v_contractor_id,
        'review_comment', NEW.review_comment
      )
    );
  END IF;
  
  RETURN NEW;
END;
$function$;