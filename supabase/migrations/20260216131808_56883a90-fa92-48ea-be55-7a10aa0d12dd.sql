
-- 1. Notify on Audit Passed
CREATE OR REPLACE FUNCTION public.notify_audit_passed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_contractor_id TEXT;
  v_interviewer_code TEXT;
  v_field_manager_user_id UUID;
BEGIN
  IF NEW.status = 'Audit Passed' AND (OLD.status IS NULL OR OLD.status != 'Audit Passed') THEN
    SELECT contractor_id, interviewer_code INTO v_contractor_id, v_interviewer_code
    FROM public.interview_metadata WHERE audit_id = NEW.id LIMIT 1;

    -- Notify contractor users
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    SELECT p.id, 'audit_passed', 'Interview Passed Audit',
      'Interview "' || NEW.file_name || '" has passed audit review',
      jsonb_build_object('audit_id', NEW.id, 'file_name', NEW.file_name)
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE (p.contractor_id = v_contractor_id OR p.active_contractor_id = v_contractor_id)
      AND ur.role IN ('contractor', 'sub_contractor');

    -- Notify field manager
    SELECT field_manager_id INTO v_field_manager_user_id
    FROM public.team_assignments
    WHERE interviewer_code = v_interviewer_code AND status = 'approved' LIMIT 1;

    IF v_field_manager_user_id IS NOT NULL THEN
      INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
      VALUES (v_field_manager_user_id, 'audit_passed', 'Team Interview Passed Audit',
        'Interview "' || NEW.file_name || '" from your team has passed audit',
        jsonb_build_object('audit_id', NEW.id, 'file_name', NEW.file_name, 'interviewer_code', v_interviewer_code));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_notify_audit_passed
AFTER UPDATE ON public.audits
FOR EACH ROW EXECUTE FUNCTION public.notify_audit_passed();

-- 2. Notify on team assignment status change (approved/rejected)
CREATE OR REPLACE FUNCTION public.notify_team_assignment_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    VALUES (NEW.field_manager_id, 'team_request_approved', 'Team Request Approved',
      'Your request for interviewer ' || NEW.interviewer_code || ' has been approved',
      jsonb_build_object('interviewer_code', NEW.interviewer_code, 'assignment_id', NEW.id));
  ELSIF OLD.status = 'pending' AND NEW.status = 'rejected' THEN
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    VALUES (NEW.field_manager_id, 'team_request_rejected', 'Team Request Rejected',
      'Your request for interviewer ' || NEW.interviewer_code || ' has been rejected',
      jsonb_build_object('interviewer_code', NEW.interviewer_code, 'assignment_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_notify_team_assignment_status
AFTER UPDATE ON public.team_assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_team_assignment_status();

-- 3. Notify on new team request
CREATE OR REPLACE FUNCTION public.notify_new_team_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status = 'pending' THEN
    -- Notify contractors for this contractor_id
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    SELECT p.id, 'new_team_request', 'New Team Assignment Request',
      'A field manager has requested interviewer ' || NEW.interviewer_code,
      jsonb_build_object('interviewer_code', NEW.interviewer_code, 'field_manager_id', NEW.field_manager_id, 'assignment_id', NEW.id)
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE ur.role = 'contractor'
      AND (p.contractor_id = NEW.contractor_id OR p.active_contractor_id = NEW.contractor_id);

    -- Notify sub-contractors assigned to this field manager
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    SELECT fmsa.sub_contractor_id, 'new_team_request', 'New Team Assignment Request',
      'A field manager has requested interviewer ' || NEW.interviewer_code,
      jsonb_build_object('interviewer_code', NEW.interviewer_code, 'field_manager_id', NEW.field_manager_id, 'assignment_id', NEW.id)
    FROM public.field_manager_subcontractor_assignments fmsa
    WHERE fmsa.field_manager_id = NEW.field_manager_id AND fmsa.is_active = true;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_notify_new_team_request
AFTER INSERT ON public.team_assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_new_team_request();

-- 4. Notify on interview assigned to data entry team
CREATE OR REPLACE FUNCTION public.notify_interview_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_file_name TEXT;
  v_team_name TEXT;
BEGIN
  SELECT file_name INTO v_file_name FROM public.audits WHERE id = NEW.audit_id;
  SELECT name INTO v_team_name FROM public.data_entry_teams WHERE id = NEW.team_id;

  -- Notify all data_entry_clerk and quality_assurance_manager users
  INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
  SELECT ur.user_id, 'interview_assigned', 'Interview Assigned to Team',
    'Interview "' || COALESCE(v_file_name, 'Unknown') || '" assigned to team ' || COALESCE(v_team_name, 'Unknown'),
    jsonb_build_object('audit_id', NEW.audit_id, 'team_id', NEW.team_id, 'file_name', v_file_name)
  FROM public.user_roles ur
  INNER JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role IN ('data_entry_clerk', 'quality_assurance_manager') AND p.is_approved = true;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_notify_interview_assigned
AFTER INSERT ON public.interview_assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_interview_assigned();

-- 5. Notify on data entry completed
CREATE OR REPLACE FUNCTION public.notify_data_entry_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_file_name TEXT;
BEGIN
  IF NEW.entry_status = 'data_entry_complete' AND (OLD.entry_status IS NULL OR OLD.entry_status != 'data_entry_complete') THEN
    SELECT file_name INTO v_file_name FROM public.audits WHERE id = NEW.audit_id;

    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    SELECT ur.user_id, 'data_entry_complete', 'Data Entry Completed',
      'Data entry for interview "' || COALESCE(v_file_name, 'Unknown') || '" has been completed',
      jsonb_build_object('audit_id', NEW.audit_id, 'file_name', v_file_name)
    FROM public.user_roles ur
    WHERE ur.role IN ('admin', 'super_admin', 'quality_assurance_manager');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_notify_data_entry_complete
AFTER UPDATE ON public.interview_assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_data_entry_complete();

-- 6. Notify on account approved
CREATE OR REPLACE FUNCTION public.notify_account_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.is_approved = true AND (OLD.is_approved IS NULL OR OLD.is_approved = false) THEN
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    VALUES (NEW.id, 'account_approved', 'Account Approved',
      'Your account has been approved. You now have full access to the platform.',
      jsonb_build_object('approved_by', NEW.approved_by));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_notify_account_approved
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_account_approved();

-- 7. Notify on account suspended
CREATE OR REPLACE FUNCTION public.notify_account_suspended()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.account_status = 'suspended' AND (OLD.account_status IS NULL OR OLD.account_status != 'suspended') THEN
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    VALUES (NEW.id, 'account_suspended', 'Account Suspended',
      'Your account has been suspended. Please contact an administrator.',
      '{}'::jsonb);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_notify_account_suspended
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_account_suspended();

-- 8. Notify on new user registration
CREATE OR REPLACE FUNCTION public.notify_new_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
  SELECT ur.user_id, 'new_registration', 'New User Registration',
    NEW.full_name || ' (' || NEW.email || ') has registered and is pending approval',
    jsonb_build_object('user_id', NEW.id, 'full_name', NEW.full_name, 'email', NEW.email, 'contractor_id', NEW.contractor_id)
  FROM public.user_roles ur
  WHERE ur.role IN ('admin', 'super_admin');

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_notify_new_registration
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_new_registration();

-- 9. Notify on payment record created
CREATE OR REPLACE FUNCTION public.notify_payment_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
  SELECT p.id, 'payment_created', 'Payment Record Created',
    'A payment record for folder "' || NEW.folder_name || '" (' || NEW.names_count || ' names) has been created',
    jsonb_build_object('payment_id', NEW.id, 'folder_name', NEW.folder_name, 'names_count', NEW.names_count, 'invoice_number', NEW.invoice_number)
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'contractor'
    AND (p.contractor_id = NEW.contractor_name OR p.active_contractor_id = NEW.contractor_name);

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_notify_payment_created
AFTER INSERT ON public.payment_records
FOR EACH ROW EXECUTE FUNCTION public.notify_payment_created();

-- 10. Notify on agent reassigned to different FM
CREATE OR REPLACE FUNCTION public.notify_agent_reassigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF OLD.field_manager_id IS DISTINCT FROM NEW.field_manager_id THEN
    -- Notify old FM
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    VALUES (OLD.field_manager_id, 'agent_reassigned', 'Interviewer Reassigned',
      'Interviewer ' || NEW.interviewer_code || ' has been reassigned to another field manager',
      jsonb_build_object('interviewer_code', NEW.interviewer_code, 'assignment_id', NEW.id));

    -- Notify new FM
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    VALUES (NEW.field_manager_id, 'agent_reassigned', 'Interviewer Assigned to You',
      'Interviewer ' || NEW.interviewer_code || ' has been assigned to your team',
      jsonb_build_object('interviewer_code', NEW.interviewer_code, 'assignment_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_notify_agent_reassigned
AFTER UPDATE ON public.team_assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_agent_reassigned();
