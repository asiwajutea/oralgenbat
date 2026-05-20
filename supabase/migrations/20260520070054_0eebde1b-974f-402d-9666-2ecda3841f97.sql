
-- 1) Rewrite get_assignable_field_managers to support all roles
CREATE OR REPLACE FUNCTION public.get_assignable_field_managers(_for_contractor text DEFAULT NULL)
RETURNS TABLE(id uuid, full_name text, contractor_id text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  caller uuid := auth.uid();
  is_admin_user boolean;
  caller_contractors text[];
BEGIN
  IF caller IS NULL THEN
    RETURN;
  END IF;

  is_admin_user := public.has_role(caller, 'admin'::app_role)
                OR public.has_role(caller, 'super_admin'::app_role);

  -- Admins: optionally scope, otherwise return all approved FMs
  IF is_admin_user THEN
    IF _for_contractor IS NOT NULL AND _for_contractor <> '' THEN
      RETURN QUERY
        SELECT p.id, p.full_name, p.contractor_id
        FROM public.profiles p
        INNER JOIN public.user_roles ur ON ur.user_id = p.id
        WHERE ur.role = 'field_manager'
          AND COALESCE(p.is_approved, false) = true
          AND (p.contractor_id = _for_contractor
               OR EXISTS (
                 SELECT 1 FROM public.user_contractor_assignments uca
                 WHERE uca.user_id = p.id AND uca.contractor_id = _for_contractor
               ))
        ORDER BY p.full_name;
    ELSE
      RETURN QUERY
        SELECT p.id, p.full_name, p.contractor_id
        FROM public.profiles p
        INNER JOIN public.user_roles ur ON ur.user_id = p.id
        WHERE ur.role = 'field_manager'
          AND COALESCE(p.is_approved, false) = true
        ORDER BY p.full_name;
    END IF;
    RETURN;
  END IF;

  -- Build the set of contractor_ids relevant to the caller:
  --   • caller.contractor_id / active_contractor_id
  --   • any rows in user_contractor_assignments for the caller
  --   • for sub_contractors, contractors of their assigned FMs
  SELECT ARRAY(
    SELECT DISTINCT c FROM (
      SELECT p.contractor_id AS c FROM public.profiles p WHERE p.id = caller AND p.contractor_id IS NOT NULL
      UNION
      SELECT p.active_contractor_id FROM public.profiles p WHERE p.id = caller AND p.active_contractor_id IS NOT NULL
      UNION
      SELECT uca.contractor_id FROM public.user_contractor_assignments uca WHERE uca.user_id = caller
      UNION
      SELECT fmp.contractor_id
      FROM public.field_manager_subcontractor_assignments fmsa
      JOIN public.profiles fmp ON fmp.id = fmsa.field_manager_id
      WHERE fmsa.sub_contractor_id = caller
        AND COALESCE(fmsa.is_active, true) = true
        AND fmp.contractor_id IS NOT NULL
    ) s
    WHERE c IS NOT NULL AND c <> ''
  ) INTO caller_contractors;

  RETURN QUERY
    SELECT DISTINCT p.id, p.full_name, p.contractor_id
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE ur.role = 'field_manager'
      AND COALESCE(p.is_approved, false) = true
      AND (
        -- share a contractor scope
        (caller_contractors IS NOT NULL AND array_length(caller_contractors, 1) > 0
          AND (p.contractor_id = ANY(caller_contractors)
               OR EXISTS (
                 SELECT 1 FROM public.user_contractor_assignments uca
                 WHERE uca.user_id = p.id AND uca.contractor_id = ANY(caller_contractors)
               )))
        -- sub_contractor: also include FMs explicitly assigned to this SC
        OR EXISTS (
          SELECT 1 FROM public.field_manager_subcontractor_assignments fmsa
          WHERE fmsa.field_manager_id = p.id
            AND fmsa.sub_contractor_id = caller
            AND COALESCE(fmsa.is_active, true) = true
        )
      )
    ORDER BY p.full_name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_assignable_field_managers(text) TO authenticated;


-- 2) Upload lock exemptions
CREATE TABLE IF NOT EXISTS public.upload_lock_exemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('user','role')),
  scope_value text NOT NULL,           -- user uuid as text OR role name
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_value)
);

ALTER TABLE public.upload_lock_exemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view exemptions" ON public.upload_lock_exemptions;
CREATE POLICY "Approved users can view exemptions"
  ON public.upload_lock_exemptions FOR SELECT
  USING (public.is_user_approved(auth.uid()));

DROP POLICY IF EXISTS "Admins manage exemptions" ON public.upload_lock_exemptions;
CREATE POLICY "Admins manage exemptions"
  ON public.upload_lock_exemptions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));


CREATE OR REPLACE FUNCTION public.is_upload_allowed(_user_id uuid)
RETURNS TABLE (allowed boolean, reason text, scope text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  global_lock RECORD;
  exempt boolean := false;
BEGIN
  IF _user_id IS NULL THEN
    RETURN QUERY SELECT true, NULL::text, NULL::text; RETURN;
  END IF;

  SELECT * INTO global_lock
  FROM public.upload_lock_settings
  WHERE scope_type = 'global' AND locked = true
  LIMIT 1;

  IF FOUND THEN
    -- exempt by user id
    SELECT EXISTS (
      SELECT 1 FROM public.upload_lock_exemptions
      WHERE scope_type = 'user' AND scope_value = _user_id::text
    ) INTO exempt;

    -- exempt by role
    IF NOT exempt THEN
      SELECT EXISTS (
        SELECT 1 FROM public.upload_lock_exemptions e
        WHERE e.scope_type = 'role'
          AND public.has_role(_user_id, e.scope_value::app_role)
      ) INTO exempt;
    END IF;

    IF NOT exempt THEN
      RETURN QUERY SELECT false, COALESCE(global_lock.reason, 'Uploads are globally locked.'), 'global'::text;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, NULL::text, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_upload_allowed(uuid) TO authenticated;


-- 3) Review feedback history
CREATE TABLE IF NOT EXISTS public.review_feedback_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL,
  cycle_number int NOT NULL,
  review_comment text,
  action_plan text,
  artifact_correction text[],
  reviewed_by text,
  reviewed_by_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_feedback_history_audit ON public.review_feedback_history(audit_id, cycle_number DESC);

ALTER TABLE public.review_feedback_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view feedback history" ON public.review_feedback_history;
CREATE POLICY "Approved users can view feedback history"
  ON public.review_feedback_history FOR SELECT
  USING (public.is_user_approved(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete feedback history" ON public.review_feedback_history;
CREATE POLICY "Admins can delete feedback history"
  ON public.review_feedback_history FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- Inserts handled only via trigger (no insert/update policy = blocked for users; trigger uses SECURITY DEFINER context)

CREATE OR REPLACE FUNCTION public.snapshot_review_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'Audit Failed'
     AND (NEW.review_comment IS NOT NULL OR NEW.action_plan IS NOT NULL)
     AND (TG_OP = 'INSERT'
          OR OLD.status IS DISTINCT FROM NEW.status
          OR OLD.review_comment IS DISTINCT FROM NEW.review_comment
          OR OLD.action_plan IS DISTINCT FROM NEW.action_plan)
  THEN
    INSERT INTO public.review_feedback_history
      (audit_id, cycle_number, review_comment, action_plan, artifact_correction, reviewed_by, reviewed_by_id, reviewed_at)
    VALUES
      (NEW.id, COALESCE(NEW.re_audit_count, 0) + 1, NEW.review_comment, NEW.action_plan, NEW.artifact_correction, NEW.reviewed_by, NULL, COALESCE(NEW.reviewed_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_review_feedback ON public.audits;
CREATE TRIGGER trg_snapshot_review_feedback
  AFTER INSERT OR UPDATE ON public.audits
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_review_feedback();

-- Backfill (only for current failed audits without an existing row)
INSERT INTO public.review_feedback_history (audit_id, cycle_number, review_comment, action_plan, artifact_correction, reviewed_by, reviewed_at)
SELECT a.id, COALESCE(a.re_audit_count, 0) + 1, a.review_comment, a.action_plan, a.artifact_correction, a.reviewed_by, a.reviewed_at
FROM public.audits a
WHERE a.status = 'Audit Failed'
  AND (a.review_comment IS NOT NULL OR a.action_plan IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.review_feedback_history h WHERE h.audit_id = a.id
  );
