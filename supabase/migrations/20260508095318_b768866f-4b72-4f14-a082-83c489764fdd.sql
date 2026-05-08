
CREATE OR REPLACE FUNCTION public.raise_penalty_charges_on_failure()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_meta record;
  v_fm uuid;
  v_subs uuid[];
  v_sub uuid;
  v_setting record;
  v_amount numeric;
  v_total_names integer;
  v_already_charged boolean;
BEGIN
  -- only on transition into Audit Failed and only first audit
  IF NEW.status <> 'Audit Failed'::audit_status THEN RETURN NEW; END IF;
  IF OLD.status = 'Audit Failed'::audit_status THEN RETURN NEW; END IF;
  IF COALESCE(NEW.re_audit_count,0) > 0 OR COALESCE(NEW.is_re_audit,false) THEN RETURN NEW; END IF;

  SELECT EXISTS(SELECT 1 FROM public.penalty_charges WHERE audit_id = NEW.id AND status <> 'removed')
    INTO v_already_charged;
  IF v_already_charged THEN RETURN NEW; END IF;

  SELECT m.contractor_id, m.interviewer_code, COALESCE(m.total_names,0) AS total_names
    INTO v_meta
  FROM public.interview_metadata m
  WHERE m.audit_id = NEW.id
  LIMIT 1;

  IF v_meta IS NULL THEN RETURN NEW; END IF;
  v_total_names := v_meta.total_names;

  SELECT field_manager_id INTO v_fm FROM public.interview_fm_overrides WHERE audit_id = NEW.id LIMIT 1;
  IF v_fm IS NULL THEN
    SELECT ta.field_manager_id INTO v_fm
    FROM public.team_assignments ta
    WHERE ta.interviewer_code = v_meta.interviewer_code AND ta.contractor_id = v_meta.contractor_id
    LIMIT 1;
  END IF;

  IF v_fm IS NOT NULL THEN
    SELECT array_agg(DISTINCT sub_contractor_id)
      INTO v_subs
    FROM public.field_manager_subcontractor_assignments
    WHERE field_manager_id = v_fm AND is_active = true;
  END IF;

  FOR v_setting IN
    SELECT * FROM public.penalty_settings
    WHERE is_active
      AND NEW.uploaded_at::date >= effective_from
  LOOP
    IF v_setting.scope_type = 'contractor' AND v_setting.scope_id IS DISTINCT FROM v_meta.contractor_id THEN CONTINUE; END IF;
    IF v_setting.scope_type = 'sub_contractor' THEN
      IF v_subs IS NULL OR NOT (v_setting.scope_id::uuid = ANY (v_subs)) THEN CONTINUE; END IF;
    END IF;

    IF v_setting.target_role = 'field_manager'::app_role AND v_fm IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.penalty_exemptions e
        WHERE e.setting_id = v_setting.id AND e.exempt_user_id = v_fm
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.penalty_exemptions e
        WHERE e.setting_id = v_setting.id
          AND e.cascade_to_subordinates
          AND v_subs IS NOT NULL
          AND e.exempt_user_id = ANY (v_subs)
      ) THEN
        v_amount := CASE WHEN v_setting.charge_mode='per_name' THEN v_setting.amount * v_total_names ELSE v_setting.amount END;
        IF v_amount > 0 THEN
          INSERT INTO public.penalty_charges (audit_id, charged_user_id, charged_user_role, setting_id, amount, currency)
          VALUES (NEW.id, v_fm, 'field_manager'::app_role, v_setting.id, v_amount, v_setting.currency)
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END IF;

    IF v_setting.target_role = 'sub_contractor'::app_role AND v_subs IS NOT NULL THEN
      FOREACH v_sub IN ARRAY v_subs LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.penalty_exemptions e
          WHERE e.setting_id = v_setting.id AND e.exempt_user_id = v_sub
        ) THEN
          v_amount := CASE WHEN v_setting.charge_mode='per_name' THEN v_setting.amount * v_total_names ELSE v_setting.amount END;
          IF v_amount > 0 THEN
            INSERT INTO public.penalty_charges (audit_id, charged_user_id, charged_user_role, setting_id, amount, currency)
            VALUES (NEW.id, v_sub, 'sub_contractor'::app_role, v_setting.id, v_amount, v_setting.currency)
            ON CONFLICT DO NOTHING;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
