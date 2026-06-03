-- 1. Rewrite notify_failed_audit:
--    - Scoped recipients (FM, SC under FM, Contractor for interview, Admins under FM)
--    - FM gets full body, others get short summary
--    - SMS HTTP call removed (deactivated)
CREATE OR REPLACE FUNCTION public.notify_failed_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contractor_id TEXT;
  v_interviewer_code TEXT;
  v_fm_id UUID;
  v_short_msg TEXT;
  v_full_msg TEXT;
  v_meta JSONB;
  v_uid UUID;
BEGIN
  -- Only on transition into Audit Failed
  IF NEW.status = 'Audit Failed' AND (OLD.status IS NULL OR OLD.status <> 'Audit Failed') THEN

    SELECT contractor_id, interviewer_code
      INTO v_contractor_id, v_interviewer_code
      FROM public.interview_metadata
     WHERE audit_id = NEW.id;

    -- Resolve FM via team_assignments
    SELECT field_manager_id INTO v_fm_id
      FROM public.team_assignments
     WHERE interviewer_code = v_interviewer_code
       AND status = 'approved'
     ORDER BY created_at DESC
     LIMIT 1;

    v_short_msg := 'Interview "' || NEW.file_name || '" failed audit (agent '
                   || COALESCE(v_interviewer_code, 'unknown') || ').';
    v_full_msg  := 'Interview "' || NEW.file_name
                   || '" from your team has failed audit.'
                   || CASE WHEN COALESCE(trim(NEW.review_comment),'') <> ''
                           THEN E'\nReason: ' || NEW.review_comment ELSE '' END;
    v_meta := jsonb_build_object(
      'audit_id', NEW.id,
      'file_name', NEW.file_name,
      'interviewer_code', v_interviewer_code,
      'contractor_id', v_contractor_id
    );

    -- Field Manager: full message
    IF v_fm_id IS NOT NULL THEN
      INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
      VALUES (v_fm_id, 'failed_audit', 'Team Interview Failed Audit', v_full_msg,
              v_meta || jsonb_build_object('summary_only', false, 'review_comment', NEW.review_comment));
    END IF;

    -- Sub-contractor(s) linked to that FM: short summary
    IF v_fm_id IS NOT NULL THEN
      INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
      SELECT sca.sub_contractor_id, 'failed_audit', 'Interview Failed Audit', v_short_msg,
             v_meta || jsonb_build_object('summary_only', true)
        FROM public.field_manager_subcontractor_assignments sca
       WHERE sca.field_manager_id = v_fm_id
         AND COALESCE(sca.is_active, true) = true
         AND sca.sub_contractor_id IS DISTINCT FROM v_fm_id;
    END IF;

    -- Contractor users for that contractor: short summary
    IF v_contractor_id IS NOT NULL THEN
      INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
      SELECT p.id, 'failed_audit', 'Interview Failed Audit', v_short_msg,
             v_meta || jsonb_build_object('summary_only', true)
        FROM public.profiles p
        INNER JOIN public.user_roles ur ON ur.user_id = p.id
       WHERE (p.contractor_id = v_contractor_id OR p.active_contractor_id = v_contractor_id)
         AND ur.role = 'contractor';
    END IF;

    -- Admin(s) linked to that FM: short summary
    IF v_fm_id IS NOT NULL THEN
      INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
      SELECT faa.admin_id, 'failed_audit', 'Interview Failed Audit', v_short_msg,
             v_meta || jsonb_build_object('summary_only', true)
        FROM public.field_manager_admin_assignments faa
       WHERE faa.field_manager_id = v_fm_id
         AND COALESCE(faa.is_active, true) = true;
    END IF;

    -- NOTE: outbound SMS notification is intentionally disabled.
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Age-group distribution RPC for the Analytics dashboard.
CREATE OR REPLACE FUNCTION public.get_interview_age_distribution(
  _contractor_ids text[] DEFAULT NULL,
  _interviewer_codes text[] DEFAULT NULL
)
RETURNS TABLE (bucket text, bucket_order int, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      CASE
        WHEN interviewee_age IS NULL OR interviewee_age <= 0 THEN 'Unknown'
        WHEN interviewee_age < 40  THEN 'Under 40'
        WHEN interviewee_age < 55  THEN '40-54'
        WHEN interviewee_age < 65  THEN '55-64'
        WHEN interviewee_age < 75  THEN '65-74'
        WHEN interviewee_age < 85  THEN '75-84'
        ELSE '85+'
      END AS bucket
    FROM public.interview_metadata m
    WHERE (_contractor_ids   IS NULL OR m.contractor_id     = ANY(_contractor_ids))
      AND (_interviewer_codes IS NULL OR m.interviewer_code = ANY(_interviewer_codes))
  )
  SELECT bucket,
         CASE bucket
           WHEN 'Under 40' THEN 1
           WHEN '40-54'    THEN 2
           WHEN '55-64'    THEN 3
           WHEN '65-74'    THEN 4
           WHEN '75-84'    THEN 5
           WHEN '85+'      THEN 6
           ELSE 7
         END AS bucket_order,
         COUNT(*)::bigint AS count
    FROM base
   GROUP BY bucket
   ORDER BY bucket_order;
$function$;

GRANT EXECUTE ON FUNCTION public.get_interview_age_distribution(text[], text[]) TO authenticated;