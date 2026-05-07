
-- =========================================================
-- 1. UPLOAD ATTEMPTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.upload_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  detected_kind text NOT NULL, -- 'pdf' | 'metadata_zip' | 'unknown'
  mode text NOT NULL,          -- 'new' | 're_audit'
  status text NOT NULL,        -- 'success' | 'failed' | 'duplicate' | 'locked' | 'quota_blocked'
  message text,
  audit_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS upload_attempts_user_idx ON public.upload_attempts(user_id, created_at DESC);
ALTER TABLE public.upload_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own upload attempts" ON public.upload_attempts;
CREATE POLICY "Users insert own upload attempts" ON public.upload_attempts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own upload attempts" ON public.upload_attempts;
CREATE POLICY "Users view own upload attempts" ON public.upload_attempts
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- =========================================================
-- 2. PENALTY SETTINGS / EXEMPTIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.penalty_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_by uuid NOT NULL,
  set_by_role app_role NOT NULL,
  scope_type text NOT NULL, -- 'global' | 'contractor' | 'sub_contractor'
  scope_id text,            -- contractor_id or sub_contractor user id
  target_role app_role NOT NULL, -- 'sub_contractor' | 'field_manager'
  charge_mode text NOT NULL CHECK (charge_mode IN ('per_name','per_interview')),
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'NGN',
  effective_from date NOT NULL DEFAULT '2026-04-21',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX IF NOT EXISTS penalty_settings_scope_idx ON public.penalty_settings(scope_type, scope_id, target_role) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.penalty_exemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_id uuid NOT NULL REFERENCES public.penalty_settings(id) ON DELETE CASCADE,
  exempt_user_id uuid NOT NULL,
  cascade_to_subordinates boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (setting_id, exempt_user_id)
);

ALTER TABLE public.penalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penalty_exemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved read penalty settings" ON public.penalty_settings;
CREATE POLICY "Approved read penalty settings" ON public.penalty_settings
  FOR SELECT TO authenticated USING (is_user_approved(auth.uid()));

DROP POLICY IF EXISTS "Authorized manage penalty settings" ON public.penalty_settings;
CREATE POLICY "Authorized manage penalty settings" ON public.penalty_settings
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'contractor'::app_role) OR has_role(auth.uid(),'sub_contractor'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'contractor'::app_role) OR has_role(auth.uid(),'sub_contractor'::app_role)
  );

DROP POLICY IF EXISTS "Approved read penalty exemptions" ON public.penalty_exemptions;
CREATE POLICY "Approved read penalty exemptions" ON public.penalty_exemptions
  FOR SELECT TO authenticated USING (is_user_approved(auth.uid()));

DROP POLICY IF EXISTS "Authorized manage penalty exemptions" ON public.penalty_exemptions;
CREATE POLICY "Authorized manage penalty exemptions" ON public.penalty_exemptions
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'contractor'::app_role) OR has_role(auth.uid(),'sub_contractor'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'contractor'::app_role) OR has_role(auth.uid(),'sub_contractor'::app_role)
  );

-- =========================================================
-- 3. PENALTY CHARGES / PAYMENTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.penalty_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL,
  charged_user_id uuid NOT NULL,
  charged_user_role app_role NOT NULL,
  setting_id uuid REFERENCES public.penalty_settings(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'open', -- open | partial | paid | waived | removed
  paid_amount numeric NOT NULL DEFAULT 0,
  removed_by uuid,
  removed_at timestamptz,
  removed_reason text,
  appeal_reason text,
  appeal_status text,         -- pending | accepted | rejected
  appeal_decided_by uuid,
  appeal_decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS penalty_charges_unique
  ON public.penalty_charges(audit_id, charged_user_id)
  WHERE status <> 'removed';
CREATE INDEX IF NOT EXISTS penalty_charges_user_idx ON public.penalty_charges(charged_user_id, status);

CREATE TABLE IF NOT EXISTS public.penalty_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id uuid REFERENCES public.penalty_charges(id) ON DELETE SET NULL,
  charged_user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN',
  declared_by uuid NOT NULL,
  declared_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  status text NOT NULL DEFAULT 'pending_confirmation', -- pending_confirmation | confirmed | rejected
  note text
);
CREATE INDEX IF NOT EXISTS penalty_payments_user_idx ON public.penalty_payments(charged_user_id);

ALTER TABLE public.penalty_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penalty_payments ENABLE ROW LEVEL SECURITY;

-- Helper: is user a superior of charged user?
CREATE OR REPLACE FUNCTION public.is_penalty_superior(_actor uuid, _charged uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    has_role(_actor,'admin'::app_role)
    OR has_role(_actor,'super_admin'::app_role)
    OR has_role(_actor,'contractor'::app_role)
    OR (
      has_role(_actor,'sub_contractor'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.field_manager_subcontractor_assignments
        WHERE sub_contractor_id = _actor AND field_manager_id = _charged AND is_active = true
      )
    )
$$;

DROP POLICY IF EXISTS "View penalty charges" ON public.penalty_charges;
CREATE POLICY "View penalty charges" ON public.penalty_charges
  FOR SELECT TO authenticated USING (
    charged_user_id = auth.uid() OR public.is_penalty_superior(auth.uid(), charged_user_id)
  );

DROP POLICY IF EXISTS "Insert penalty charges" ON public.penalty_charges;
CREATE POLICY "Insert penalty charges" ON public.penalty_charges
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "Update penalty charges" ON public.penalty_charges;
CREATE POLICY "Update penalty charges" ON public.penalty_charges
  FOR UPDATE TO authenticated USING (
    public.is_penalty_superior(auth.uid(), charged_user_id) OR charged_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "View penalty payments" ON public.penalty_payments;
CREATE POLICY "View penalty payments" ON public.penalty_payments
  FOR SELECT TO authenticated USING (
    charged_user_id = auth.uid() OR public.is_penalty_superior(auth.uid(), charged_user_id)
  );

DROP POLICY IF EXISTS "Insert penalty payments" ON public.penalty_payments;
CREATE POLICY "Insert penalty payments" ON public.penalty_payments
  FOR INSERT TO authenticated WITH CHECK (
    declared_by = auth.uid()
    AND (charged_user_id = auth.uid() OR public.is_penalty_superior(auth.uid(), charged_user_id))
  );

DROP POLICY IF EXISTS "Update penalty payments" ON public.penalty_payments;
CREATE POLICY "Update penalty payments" ON public.penalty_payments
  FOR UPDATE TO authenticated USING (
    public.is_penalty_superior(auth.uid(), charged_user_id)
  );

-- =========================================================
-- 4. TRIGGER: raise charges on first failure
-- =========================================================
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
  -- only on transition into Failed and only first audit
  IF NEW.status <> 'Failed' THEN RETURN NEW; END IF;
  IF OLD.status = 'Failed' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.re_audit_count,0) > 0 OR COALESCE(NEW.is_re_audit,false) THEN RETURN NEW; END IF;

  -- guard: this audit may not have been charged before (re-failed scenario)
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

  -- resolve FM: prefer per-interview override
  SELECT field_manager_id INTO v_fm FROM public.interview_fm_overrides WHERE audit_id = NEW.id LIMIT 1;
  IF v_fm IS NULL THEN
    SELECT ta.field_manager_id INTO v_fm
    FROM public.team_assignments ta
    WHERE ta.interviewer_code = v_meta.interviewer_code AND ta.contractor_id = v_meta.contractor_id
    LIMIT 1;
  END IF;

  -- resolve sub-contractors over that FM
  IF v_fm IS NOT NULL THEN
    SELECT array_agg(DISTINCT sub_contractor_id)
      INTO v_subs
    FROM public.field_manager_subcontractor_assignments
    WHERE field_manager_id = v_fm AND is_active = true;
  END IF;

  -- iterate active settings whose effective_from <= uploaded_at
  FOR v_setting IN
    SELECT * FROM public.penalty_settings
    WHERE is_active
      AND NEW.uploaded_at::date >= effective_from
  LOOP
    -- filter scope
    IF v_setting.scope_type = 'contractor' AND v_setting.scope_id IS DISTINCT FROM v_meta.contractor_id THEN CONTINUE; END IF;
    IF v_setting.scope_type = 'sub_contractor' THEN
      IF v_subs IS NULL OR NOT (v_setting.scope_id::uuid = ANY (v_subs)) THEN CONTINUE; END IF;
    END IF;

    -- target FM
    IF v_setting.target_role = 'field_manager'::app_role AND v_fm IS NOT NULL THEN
      -- exemption (direct)
      IF NOT EXISTS (
        SELECT 1 FROM public.penalty_exemptions e
        WHERE e.setting_id = v_setting.id AND e.exempt_user_id = v_fm
      )
      -- cascade exemption: any exempt sub_contractor over this FM with cascade=true
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

    -- target sub-contractor(s)
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

DROP TRIGGER IF EXISTS trg_raise_penalty_charges ON public.audits;
CREATE TRIGGER trg_raise_penalty_charges
AFTER UPDATE OF status ON public.audits
FOR EACH ROW EXECUTE FUNCTION public.raise_penalty_charges_on_failure();

-- =========================================================
-- 5. RPCs
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_penalty_summary(_user_id uuid)
RETURNS TABLE(currency text, total_charged numeric, total_paid numeric, balance numeric, open_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH c AS (
    SELECT currency,
      SUM(CASE WHEN status IN ('open','partial','paid') THEN amount ELSE 0 END) AS charged,
      SUM(CASE WHEN status IN ('open','partial','paid') THEN paid_amount ELSE 0 END) AS paid,
      COUNT(*) FILTER (WHERE status IN ('open','partial')) AS oc
    FROM public.penalty_charges
    WHERE charged_user_id = _user_id
    GROUP BY currency
  )
  SELECT currency, charged, paid, charged - paid, oc::int FROM c
$$;
GRANT EXECUTE ON FUNCTION public.get_penalty_summary(uuid) TO authenticated;

-- declare a payment (charged user)
CREATE OR REPLACE FUNCTION public.declare_penalty_payment(_charge_id uuid, _amount numeric, _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_currency text := 'NGN';
  v_id uuid;
BEGIN
  IF _charge_id IS NOT NULL THEN
    SELECT charged_user_id, currency INTO v_user, v_currency FROM public.penalty_charges WHERE id = _charge_id;
    IF v_user IS NULL THEN RAISE EXCEPTION 'Charge not found'; END IF;
    IF v_user <> auth.uid() THEN RAISE EXCEPTION 'Only the charged user can declare a payment'; END IF;
  ELSE
    v_user := auth.uid();
  END IF;
  INSERT INTO public.penalty_payments(charge_id, charged_user_id, amount, currency, declared_by, note)
  VALUES (_charge_id, v_user, _amount, v_currency, auth.uid(), _note)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.declare_penalty_payment(uuid, numeric, text) TO authenticated;

-- confirm payment (superior). On accept, apply to charge(s) FIFO when charge_id null.
CREATE OR REPLACE FUNCTION public.confirm_penalty_payment(_payment_id uuid, _accept boolean, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_p record;
  v_remaining numeric;
  v_c record;
BEGIN
  SELECT * INTO v_p FROM public.penalty_payments WHERE id = _payment_id;
  IF v_p IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF NOT public.is_penalty_superior(auth.uid(), v_p.charged_user_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT _accept THEN
    UPDATE public.penalty_payments SET status='rejected', confirmed_by=auth.uid(), confirmed_at=now(), note=COALESCE(_note,note)
    WHERE id=_payment_id;
    RETURN;
  END IF;

  UPDATE public.penalty_payments SET status='confirmed', confirmed_by=auth.uid(), confirmed_at=now(), note=COALESCE(_note,note)
  WHERE id=_payment_id;

  v_remaining := v_p.amount;
  IF v_p.charge_id IS NOT NULL THEN
    UPDATE public.penalty_charges
      SET paid_amount = LEAST(amount, paid_amount + v_remaining),
          status = CASE WHEN paid_amount + v_remaining >= amount THEN 'paid' ELSE 'partial' END
      WHERE id = v_p.charge_id;
  ELSE
    FOR v_c IN
      SELECT id, amount, paid_amount FROM public.penalty_charges
      WHERE charged_user_id = v_p.charged_user_id AND status IN ('open','partial') AND currency = v_p.currency
      ORDER BY created_at ASC
    LOOP
      EXIT WHEN v_remaining <= 0;
      DECLARE v_apply numeric := LEAST(v_c.amount - v_c.paid_amount, v_remaining);
      BEGIN
        UPDATE public.penalty_charges
          SET paid_amount = paid_amount + v_apply,
              status = CASE WHEN paid_amount + v_apply >= amount THEN 'paid' ELSE 'partial' END
          WHERE id = v_c.id;
        v_remaining := v_remaining - v_apply;
      END;
    END LOOP;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_penalty_payment(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_penalty_charge(_charge_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  SELECT charged_user_id INTO v_user FROM public.penalty_charges WHERE id=_charge_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Charge not found'; END IF;
  IF NOT public.is_penalty_superior(auth.uid(), v_user) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.penalty_charges
    SET status='removed', removed_by=auth.uid(), removed_at=now(), removed_reason=_reason
    WHERE id=_charge_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.remove_penalty_charge(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.appeal_penalty_charge(_charge_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  SELECT charged_user_id INTO v_user FROM public.penalty_charges WHERE id=_charge_id;
  IF v_user <> auth.uid() THEN RAISE EXCEPTION 'Only charged user can appeal'; END IF;
  UPDATE public.penalty_charges SET appeal_reason=_reason, appeal_status='pending' WHERE id=_charge_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.appeal_penalty_charge(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_penalty_appeal(_charge_id uuid, _accept boolean, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  SELECT charged_user_id INTO v_user FROM public.penalty_charges WHERE id=_charge_id;
  IF NOT public.is_penalty_superior(auth.uid(), v_user) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.penalty_charges
    SET appeal_status = CASE WHEN _accept THEN 'accepted' ELSE 'rejected' END,
        appeal_decided_by = auth.uid(),
        appeal_decided_at = now(),
        status = CASE WHEN _accept THEN 'waived' ELSE status END,
        removed_reason = COALESCE(_note, removed_reason)
    WHERE id=_charge_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decide_penalty_appeal(uuid, boolean, text) TO authenticated;
