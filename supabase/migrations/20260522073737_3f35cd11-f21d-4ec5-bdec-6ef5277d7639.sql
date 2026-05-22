
-- 1) Patch assert_upload_allowed to honor upload_lock_exemptions for ALL lock scopes
CREATE OR REPLACE FUNCTION public.assert_upload_allowed(_file_name text, _new_names integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parts text[];
  v_contractor text;
  v_interviewer text;
  v_fm_id uuid;
  v_lock record;
  v_q record;
  v_used bigint;
  v_window_start timestamptz;
  v_codes text[];
  v_uid uuid := auth.uid();
  v_exempt boolean := false;
BEGIN
  v_parts := string_to_array(_file_name, '_');
  IF array_length(v_parts,1) < 4 THEN
    RAISE EXCEPTION 'Invalid file name pattern: %', _file_name;
  END IF;
  v_contractor := v_parts[2];
  v_interviewer := v_parts[3];

  -- Compute exemption ONCE based on current user (covers any lock scope)
  IF v_uid IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.upload_lock_exemptions
      WHERE scope_type = 'user' AND scope_value = v_uid::text
    ) INTO v_exempt;

    IF NOT v_exempt THEN
      SELECT EXISTS (
        SELECT 1 FROM public.upload_lock_exemptions e
        WHERE e.scope_type = 'role'
          AND public.has_role(v_uid, e.scope_value::app_role)
      ) INTO v_exempt;
    END IF;
  END IF;

  SELECT field_manager_id INTO v_fm_id
  FROM public.team_assignments
  WHERE interviewer_code = v_interviewer AND contractor_id = v_contractor AND status = 'approved'
  ORDER BY created_at DESC LIMIT 1;

  IF NOT v_exempt THEN
    FOR v_lock IN
      SELECT * FROM public.upload_lock_settings
      WHERE locked = true AND (
           (scope_type = 'global')
        OR (scope_type = 'contractor' AND scope_id = v_contractor)
        OR (scope_type = 'field_manager' AND v_fm_id IS NOT NULL AND scope_id = v_fm_id::text)
        OR (scope_type = 'interviewer' AND scope_id = v_interviewer)
      )
    LOOP
      RAISE EXCEPTION 'Uploads are locked (%): %', v_lock.scope_type, COALESCE(v_lock.reason, 'no reason provided');
    END LOOP;
  END IF;

  FOR v_q IN
    SELECT * FROM public.upload_quota_settings
    WHERE (scope_type = 'interviewer' AND scope_id = v_interviewer)
       OR (scope_type = 'field_manager' AND v_fm_id IS NOT NULL AND scope_id = v_fm_id::text)
  LOOP
    v_window_start := public.upload_quota_window_start(v_q.reset_at, v_q.reset_period);
    IF v_q.scope_type = 'interviewer' THEN
      v_codes := ARRAY[v_interviewer];
    ELSE
      SELECT array_agg(DISTINCT ta.interviewer_code) INTO v_codes
      FROM public.team_assignments ta WHERE ta.field_manager_id::text = v_q.scope_id AND ta.status='approved';
    END IF;

    IF v_q.metric = 'interviews' THEN
      SELECT COUNT(*) INTO v_used FROM public.audits a
        JOIN public.interview_metadata im ON im.audit_id = a.id
       WHERE a.uploaded_at >= v_window_start
         AND a.file_url IS NOT NULL AND a.mobile_zip_url IS NOT NULL
         AND im.interviewer_code = ANY(v_codes);
      IF v_used + 1 > v_q.limit_value THEN
        RAISE EXCEPTION 'Interview upload quota exceeded for % %: % / %',
          v_q.scope_type, v_q.scope_id, v_used, v_q.limit_value;
      END IF;
    ELSE
      SELECT COALESCE(SUM(im.total_names),0) INTO v_used FROM public.audits a
        JOIN public.interview_metadata im ON im.audit_id = a.id
       WHERE a.uploaded_at >= v_window_start
         AND im.interviewer_code = ANY(v_codes);
      IF v_used + COALESCE(_new_names,0) > v_q.limit_value THEN
        RAISE EXCEPTION 'Names upload quota exceeded for % %: % + % > %',
          v_q.scope_type, v_q.scope_id, v_used, _new_names, v_q.limit_value;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'contractor_id', v_contractor,
                            'interviewer_code', v_interviewer, 'field_manager_id', v_fm_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_upload_allowed(text,integer) TO authenticated;

-- 2) Pass-with-override "warn" flag
ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS pass_override_warn boolean NOT NULL DEFAULT false;

-- 3) Acknowledgements for the override warning nag modal
CREATE TABLE IF NOT EXISTS public.override_warning_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL,
  user_id uuid NOT NULL,
  acked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_override_warning_acks_user ON public.override_warning_acks(user_id);
ALTER TABLE public.override_warning_acks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own override acks" ON public.override_warning_acks;
CREATE POLICY "Users manage own override acks"
  ON public.override_warning_acks FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4) Notify FM / contractor / sub-contractor when an audit is passed with override.
CREATE OR REPLACE FUNCTION public.notify_pass_override(
  _audit_id uuid,
  _warn boolean,
  _reason text,
  _action_plan text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_audit record;
  v_parts text[];
  v_contractor text;
  v_interviewer text;
  v_fm_id uuid;
  v_actor text;
  v_recipient uuid;
  v_conv_id uuid;
  v_body text;
  v_meta jsonb;
  v_recipients uuid[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_audit FROM public.audits WHERE id = _audit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Audit not found';
  END IF;

  v_parts := string_to_array(v_audit.file_name, '_');
  IF array_length(v_parts,1) >= 4 THEN
    v_contractor := v_parts[2];
    v_interviewer := v_parts[3];
  END IF;

  SELECT COALESCE(full_name, email) INTO v_actor FROM public.profiles WHERE id = v_uid;

  -- Field manager
  SELECT field_manager_id INTO v_fm_id
  FROM public.team_assignments
  WHERE interviewer_code = v_interviewer AND contractor_id = v_contractor AND status='approved'
  ORDER BY created_at DESC LIMIT 1;
  IF v_fm_id IS NOT NULL THEN
    v_recipients := array_append(v_recipients, v_fm_id);
  END IF;

  -- Contractor users (matching contractor_id on profile)
  IF v_contractor IS NOT NULL THEN
    FOR v_recipient IN
      SELECT p.id FROM public.profiles p
      WHERE (p.contractor_id = v_contractor OR p.active_contractor_id = v_contractor)
        AND public.has_role(p.id, 'contractor'::app_role)
    LOOP
      v_recipients := array_append(v_recipients, v_recipient);
    END LOOP;
  END IF;

  -- Sub-contractors linked to that FM
  IF v_fm_id IS NOT NULL THEN
    FOR v_recipient IN
      SELECT sub_contractor_id FROM public.field_manager_subcontractor_assignments
       WHERE field_manager_id = v_fm_id AND COALESCE(is_active,true)=true
    LOOP
      v_recipients := array_append(v_recipients, v_recipient);
    END LOOP;
  END IF;

  -- de-dupe and exclude the actor
  SELECT ARRAY(SELECT DISTINCT u FROM unnest(v_recipients) u WHERE u <> v_uid) INTO v_recipients;

  v_body := format('Interview %s was passed with override by %s.%sReason: %s%s',
                   v_audit.file_name,
                   COALESCE(v_actor,'an auditor'),
                   E'\n',
                   COALESCE(_reason,'(no reason provided)'),
                   CASE WHEN _action_plan IS NOT NULL AND length(trim(_action_plan))>0
                        THEN E'\nAction plan: '||_action_plan ELSE '' END);

  v_meta := jsonb_build_object(
    'kind','pass_override',
    'audit_id', _audit_id,
    'file_name', v_audit.file_name,
    'warn', COALESCE(_warn,false),
    'priority', CASE WHEN _warn THEN 'high' ELSE 'normal' END,
    'auditor_id', v_uid,
    'auditor_name', v_actor
  );

  FOREACH v_recipient IN ARRAY v_recipients LOOP
    -- Find-or-create a direct conversation between actor and recipient pinned to the audit
    SELECT c.id INTO v_conv_id
    FROM public.chat_conversations c
    WHERE c.type = 'direct'
      AND c.audit_id = _audit_id
      AND EXISTS (SELECT 1 FROM public.chat_participants p WHERE p.conversation_id = c.id AND p.user_id = v_recipient)
      AND EXISTS (SELECT 1 FROM public.chat_participants p WHERE p.conversation_id = c.id AND p.user_id = v_uid)
    ORDER BY c.created_at DESC LIMIT 1;

    IF v_conv_id IS NULL THEN
      INSERT INTO public.chat_conversations (type, category, audit_id, created_by, title)
      VALUES ('direct', 'failed_audit', _audit_id, v_uid,
              'Pass with override: '||v_audit.file_name)
      RETURNING id INTO v_conv_id;
      INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
      VALUES (v_conv_id, v_uid, 'owner'),
             (v_conv_id, v_recipient, 'member');
    END IF;

    INSERT INTO public.chat_messages (conversation_id, sender_id, body, message_type, metadata)
    VALUES (v_conv_id, v_uid, v_body, 'text', v_meta);

    UPDATE public.chat_conversations
      SET last_message_at = now(),
          last_message_preview = left(v_body, 200),
          updated_at = now()
    WHERE id = v_conv_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_pass_override(uuid, boolean, text, text) TO authenticated;
