
-- =========================================================
-- 1) INBOX: inline processor + drain trigger + backfill
-- =========================================================

CREATE OR REPLACE FUNCTION public.process_chat_event_inline(_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evt record;
  v_payload jsonb;
  v_audit_id uuid;
  v_file_name text;
  v_contractor_id text;
  v_interviewer_code text;
  v_fm_id uuid;
  v_auditor_id uuid;
  v_conv_id uuid;
  v_user_id uuid;
  v_target text;
  v_ann_id uuid;
BEGIN
  SELECT * INTO v_evt FROM public.chat_pending_events WHERE id = _event_id AND processed_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  v_payload := v_evt.payload;

  BEGIN
    IF v_evt.event_type = 'audit_failed' THEN
      v_audit_id := (v_payload->>'audit_id')::uuid;
      v_file_name := v_payload->>'file_name';

      SELECT id INTO v_conv_id FROM public.chat_conversations
       WHERE audit_id = v_audit_id AND category = 'failed_audit' LIMIT 1;

      SELECT contractor_id, interviewer_code INTO v_contractor_id, v_interviewer_code
      FROM public.interview_metadata WHERE audit_id = v_audit_id LIMIT 1;

      -- Resolve FM
      SELECT field_manager_id INTO v_fm_id
      FROM public.interview_fm_overrides WHERE audit_id = v_audit_id LIMIT 1;
      IF v_fm_id IS NULL AND v_interviewer_code IS NOT NULL AND v_contractor_id IS NOT NULL THEN
        SELECT field_manager_id INTO v_fm_id FROM public.team_assignments
         WHERE interviewer_code = v_interviewer_code AND contractor_id = v_contractor_id
           AND status = 'approved' ORDER BY created_at DESC LIMIT 1;
      END IF;

      -- Resolve auditor by full_name
      IF v_payload->>'reviewed_by' IS NOT NULL THEN
        SELECT id INTO v_auditor_id FROM public.profiles
         WHERE lower(btrim(full_name)) = lower(btrim(v_payload->>'reviewed_by')) LIMIT 1;
      END IF;

      IF v_conv_id IS NULL THEN
        INSERT INTO public.chat_conversations (type, category, title, contractor_id, audit_id, created_by)
        VALUES ('audit_thread', 'failed_audit', 'Failed Audit – ' || COALESCE(v_file_name, v_audit_id::text),
                v_contractor_id, v_audit_id, v_auditor_id)
        RETURNING id INTO v_conv_id;
      END IF;

      -- Participants: FM + auditor + same-contractor (contractor/sub_contractor) + admins
      INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
      SELECT v_conv_id, uid, CASE WHEN uid = v_fm_id THEN 'owner' ELSE 'member' END
      FROM (
        SELECT v_fm_id AS uid WHERE v_fm_id IS NOT NULL
        UNION
        SELECT v_auditor_id WHERE v_auditor_id IS NOT NULL
        UNION
        SELECT p.id FROM public.profiles p
          JOIN public.user_roles ur ON ur.user_id = p.id
         WHERE (p.contractor_id = v_contractor_id OR p.active_contractor_id = v_contractor_id)
           AND ur.role IN ('contractor','sub_contractor')
        UNION
        SELECT user_id FROM public.user_roles WHERE role IN ('admin','super_admin')
      ) s
      WHERE uid IS NOT NULL
      ON CONFLICT (conversation_id, user_id) DO NOTHING;

      INSERT INTO public.chat_messages (conversation_id, sender_id, message_type, body, metadata)
      VALUES (v_conv_id, NULL, 'audit_action',
        'Audit failed: ' || COALESCE(v_file_name, ''),
        jsonb_build_object(
          'audit_id', v_audit_id,
          'file_name', v_file_name,
          'review_comment', v_payload->>'review_comment',
          'action_plan', v_payload->>'action_plan',
          'reviewed_by', v_payload->>'reviewed_by',
          'artifact_correction', v_payload->'artifact_correction',
          'actions', jsonb_build_array('view_review','mark_resolved','resubmit_with_correction','resubmit_no_correction')
        ));

    ELSIF v_evt.event_type = 'tracking_comment_added' THEN
      v_audit_id := (v_payload->>'audit_id')::uuid;
      v_file_name := v_payload->>'file_name';
      v_contractor_id := v_payload->>'contractor_id';
      v_user_id := NULLIF(v_payload->>'user_id','')::uuid;

      SELECT id INTO v_conv_id FROM public.chat_conversations
       WHERE audit_id = v_audit_id AND category = 'tracking_comment' LIMIT 1;

      IF v_conv_id IS NULL THEN
        INSERT INTO public.chat_conversations (type, category, title, contractor_id, audit_id, created_by)
        VALUES ('audit_thread', 'tracking_comment', 'Tracking – ' || COALESCE(v_file_name, v_audit_id::text),
                v_contractor_id, v_audit_id, v_user_id)
        RETURNING id INTO v_conv_id;

        INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
        SELECT v_conv_id, uid, 'member' FROM (
          SELECT v_user_id AS uid WHERE v_user_id IS NOT NULL
          UNION
          SELECT p.id FROM public.profiles p
            JOIN public.user_roles ur ON ur.user_id = p.id
           WHERE (p.contractor_id = v_contractor_id OR p.active_contractor_id = v_contractor_id)
             AND ur.role IN ('contractor','sub_contractor','field_manager')
          UNION
          SELECT user_id FROM public.user_roles WHERE role IN ('admin','super_admin')
        ) s
        WHERE uid IS NOT NULL
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
      END IF;

      INSERT INTO public.chat_messages (conversation_id, sender_id, message_type, body, metadata)
      VALUES (v_conv_id, v_user_id, 'text', v_payload->>'comment',
        jsonb_build_object('audit_id', v_audit_id,
                           'tracking_comment_id', v_payload->>'comment_id',
                           'file_name', v_file_name));

    ELSIF v_evt.event_type = 'push_delivered' THEN
      v_user_id := NULLIF(v_payload->>'user_id','')::uuid;
      IF v_user_id IS NOT NULL THEN
        SELECT cc.id INTO v_conv_id
        FROM public.chat_conversations cc
        JOIN public.chat_participants cp ON cp.conversation_id = cc.id
        WHERE cc.category = 'push' AND cc.type = 'system' AND cp.user_id = v_user_id
        ORDER BY cc.created_at DESC LIMIT 1;

        IF v_conv_id IS NULL THEN
          INSERT INTO public.chat_conversations (type, category, title, created_by)
          VALUES ('system', 'push', 'Notifications', NULL)
          RETURNING id INTO v_conv_id;
          INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
          VALUES (v_conv_id, v_user_id, 'member')
          ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END IF;

        INSERT INTO public.chat_messages (conversation_id, sender_id, message_type, body, metadata)
        VALUES (v_conv_id, NULL, 'system', COALESCE(v_payload->>'title','Notification'),
          jsonb_build_object('message', v_payload->>'message',
                             'url', v_payload->>'url',
                             'push_notification_id', v_payload->>'push_notification_id'));
      END IF;

    ELSIF v_evt.event_type = 'announcement_published' THEN
      v_target := COALESCE(v_payload->>'target_type','all');
      v_ann_id := NULLIF(v_payload->>'announcement_id','')::uuid;
      FOR v_user_id IN
        SELECT DISTINCT p.id
        FROM public.profiles p
        LEFT JOIN public.user_roles ur ON ur.user_id = p.id
        WHERE p.is_approved = true
          AND (
            v_target = 'all'
            OR (v_target = 'user' AND p.id = ANY(
                  ARRAY(SELECT (jsonb_array_elements_text(v_payload->'target_user_ids'))::uuid)))
            OR (v_target = 'contractor' AND (p.contractor_id = v_payload->>'target_contractor_id'
                                          OR p.active_contractor_id = v_payload->>'target_contractor_id'))
            OR (v_target = 'role' AND ur.role::text = v_payload->>'target_role')
          )
      LOOP
        SELECT cc.id INTO v_conv_id
        FROM public.chat_conversations cc
        JOIN public.chat_participants cp ON cp.conversation_id = cc.id
        WHERE cc.category = 'announcement' AND cc.type = 'system' AND cp.user_id = v_user_id
        ORDER BY cc.created_at DESC LIMIT 1;

        IF v_conv_id IS NULL THEN
          INSERT INTO public.chat_conversations (type, category, title, created_by)
          VALUES ('system','announcement','Announcements', NULL)
          RETURNING id INTO v_conv_id;
          INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
          VALUES (v_conv_id, v_user_id, 'member')
          ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END IF;

        INSERT INTO public.chat_messages (conversation_id, sender_id, message_type, body, metadata)
        VALUES (v_conv_id, NULLIF(v_payload->>'created_by','')::uuid, 'system',
          COALESCE(v_payload->>'title','New announcement'),
          jsonb_build_object('announcement_id', v_ann_id,
                             'content', v_payload->>'content',
                             'cta_text', v_payload->>'cta_text',
                             'cta_url', v_payload->>'cta_url',
                             'style', v_payload->'style'));
      END LOOP;
    END IF;

    UPDATE public.chat_pending_events SET processed_at = now(), error = NULL WHERE id = _event_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.chat_pending_events SET error = SQLERRM WHERE id = _event_id;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_drain_chat_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.process_chat_event_inline(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_pending_events_drain ON public.chat_pending_events;
CREATE TRIGGER chat_pending_events_drain
AFTER INSERT ON public.chat_pending_events
FOR EACH ROW EXECUTE FUNCTION public.trg_drain_chat_event();

-- Backfill existing unprocessed events
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.chat_pending_events WHERE processed_at IS NULL ORDER BY created_at LOOP
    PERFORM public.process_chat_event_inline(r.id);
  END LOOP;
END $$;

-- =========================================================
-- 2) Per-user exceptions on chat blocks
-- =========================================================
ALTER TABLE public.chat_user_blocks
  ADD COLUMN IF NOT EXISTS except_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.can_message_users(_recipient_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_contractor text;
  caller_role app_role;
  rec record;
  v_block record;
BEGIN
  IF caller IS NULL THEN RETURN false; END IF;
  IF public.has_role(caller, 'super_admin'::app_role) THEN RETURN true; END IF;

  SELECT COALESCE(active_contractor_id, contractor_id) INTO caller_contractor
  FROM public.profiles WHERE id = caller;
  SELECT role INTO caller_role FROM public.user_roles WHERE user_id = caller LIMIT 1;
  IF caller_role IS NULL THEN RETURN false; END IF;

  FOR rec IN
    SELECT p.id, COALESCE(p.active_contractor_id, p.contractor_id) AS contractor_id,
           (SELECT role FROM public.user_roles WHERE user_id = p.id LIMIT 1) AS role
    FROM public.profiles p
    WHERE p.id = ANY(_recipient_ids)
  LOOP
    -- Recipient-level block with exceptions
    SELECT * INTO v_block FROM public.chat_user_blocks WHERE blocked_user_id = rec.id;
    IF FOUND THEN
      IF NOT (caller = ANY(v_block.except_user_ids)) THEN
        RETURN false;
      END IF;
    END IF;

    IF rec.contractor_id IS DISTINCT FROM caller_contractor THEN
      RETURN false;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.chat_messaging_policies
      WHERE from_role = caller_role AND to_role = rec.role AND allowed = true
    ) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- =========================================================
-- 3) Upload locks + quotas
-- =========================================================
CREATE TABLE IF NOT EXISTS public.upload_lock_settings (
  scope_type text NOT NULL CHECK (scope_type IN ('global','contractor','field_manager','interviewer')),
  scope_id   text NOT NULL DEFAULT '',
  locked     boolean NOT NULL DEFAULT true,
  reason     text,
  set_by     uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS public.upload_quota_settings (
  scope_type   text NOT NULL CHECK (scope_type IN ('field_manager','interviewer')),
  scope_id     text NOT NULL,
  metric       text NOT NULL CHECK (metric IN ('interviews','names')),
  limit_value  integer NOT NULL CHECK (limit_value >= 0),
  reset_at     timestamptz,
  reset_period text NOT NULL DEFAULT 'one_off' CHECK (reset_period IN ('one_off','weekly','monthly')),
  set_by       uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_type, scope_id, metric)
);

ALTER TABLE public.upload_lock_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_quota_settings ENABLE ROW LEVEL SECURITY;

-- Helper: does the caller's contractor scope cover this lock/quota row?
CREATE OR REPLACE FUNCTION public.contractor_scope_covers(_scope_type text, _scope_id text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_contractor text;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF NOT (public.has_role(v_uid,'contractor'::app_role) OR public.has_role(v_uid,'sub_contractor'::app_role)) THEN
    RETURN false;
  END IF;
  SELECT COALESCE(active_contractor_id, contractor_id) INTO v_contractor FROM public.profiles WHERE id = v_uid;
  IF v_contractor IS NULL THEN RETURN false; END IF;

  IF _scope_type = 'contractor' THEN
    RETURN _scope_id = v_contractor;
  ELSIF _scope_type = 'field_manager' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.team_assignments ta
      WHERE ta.field_manager_id::text = _scope_id AND ta.contractor_id = v_contractor
    );
  ELSIF _scope_type = 'interviewer' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.team_assignments ta
      WHERE ta.interviewer_code = _scope_id AND ta.contractor_id = v_contractor
    );
  END IF;
  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "Approved users read upload locks" ON public.upload_lock_settings;
CREATE POLICY "Approved users read upload locks"
ON public.upload_lock_settings FOR SELECT TO authenticated
USING (public.is_user_approved(auth.uid()));

DROP POLICY IF EXISTS "Admins manage upload locks" ON public.upload_lock_settings;
CREATE POLICY "Admins manage upload locks"
ON public.upload_lock_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role));

DROP POLICY IF EXISTS "Contractors manage their upload locks" ON public.upload_lock_settings;
CREATE POLICY "Contractors manage their upload locks"
ON public.upload_lock_settings FOR ALL TO authenticated
USING (public.contractor_scope_covers(scope_type, scope_id))
WITH CHECK (public.contractor_scope_covers(scope_type, scope_id));

DROP POLICY IF EXISTS "Approved users read upload quotas" ON public.upload_quota_settings;
CREATE POLICY "Approved users read upload quotas"
ON public.upload_quota_settings FOR SELECT TO authenticated
USING (public.is_user_approved(auth.uid()));

DROP POLICY IF EXISTS "Admins manage upload quotas" ON public.upload_quota_settings;
CREATE POLICY "Admins manage upload quotas"
ON public.upload_quota_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role));

DROP POLICY IF EXISTS "Contractors manage their upload quotas" ON public.upload_quota_settings;
CREATE POLICY "Contractors manage their upload quotas"
ON public.upload_quota_settings FOR ALL TO authenticated
USING (public.contractor_scope_covers(scope_type, scope_id))
WITH CHECK (public.contractor_scope_covers(scope_type, scope_id));

-- Compute the start of the current quota window
CREATE OR REPLACE FUNCTION public.upload_quota_window_start(_reset_at timestamptz, _reset_period text)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _reset_period = 'weekly'  THEN COALESCE(_reset_at, now()) - interval '7 days'
    WHEN _reset_period = 'monthly' THEN COALESCE(_reset_at, now()) - interval '1 month'
    ELSE '-infinity'::timestamptz
  END;
$$;

-- Usage RPC
CREATE OR REPLACE FUNCTION public.get_upload_quota_usage(_scope_type text, _scope_id text, _metric text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_q record;
  v_window_start timestamptz;
  v_codes text[];
  v_interviews bigint := 0;
  v_names bigint := 0;
BEGIN
  SELECT * INTO v_q FROM public.upload_quota_settings
   WHERE scope_type = _scope_type AND scope_id = _scope_id AND metric = _metric;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('limit', NULL, 'used', 0, 'reset_at', NULL, 'reset_period', NULL);
  END IF;
  v_window_start := public.upload_quota_window_start(v_q.reset_at, v_q.reset_period);

  IF _scope_type = 'interviewer' THEN
    v_codes := ARRAY[_scope_id];
  ELSE -- field_manager
    SELECT array_agg(DISTINCT ta.interviewer_code) INTO v_codes
    FROM public.team_assignments ta
    WHERE ta.field_manager_id::text = _scope_id AND ta.status = 'approved';
  END IF;

  IF v_codes IS NULL OR array_length(v_codes,1) IS NULL THEN
    RETURN jsonb_build_object('limit', v_q.limit_value, 'used', 0,
      'reset_at', v_q.reset_at, 'reset_period', v_q.reset_period);
  END IF;

  IF _metric = 'interviews' THEN
    SELECT COUNT(*) INTO v_interviews
    FROM public.audits a
    JOIN public.interview_metadata im ON im.audit_id = a.id
    WHERE a.uploaded_at >= v_window_start
      AND a.file_url IS NOT NULL
      AND a.mobile_zip_url IS NOT NULL
      AND im.interviewer_code = ANY(v_codes);
    RETURN jsonb_build_object('limit', v_q.limit_value, 'used', v_interviews,
      'reset_at', v_q.reset_at, 'reset_period', v_q.reset_period);
  ELSE
    SELECT COALESCE(SUM(im.total_names),0) INTO v_names
    FROM public.audits a
    JOIN public.interview_metadata im ON im.audit_id = a.id
    WHERE a.uploaded_at >= v_window_start
      AND im.interviewer_code = ANY(v_codes);
    RETURN jsonb_build_object('limit', v_q.limit_value, 'used', v_names,
      'reset_at', v_q.reset_at, 'reset_period', v_q.reset_period);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_upload_quota_usage(text,text,text) TO authenticated;

-- Pre-upload check
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
BEGIN
  -- filename pattern NGXX_XXXX_XXXXXXXX_XXXX
  v_parts := string_to_array(_file_name, '_');
  IF array_length(v_parts,1) < 4 THEN
    RAISE EXCEPTION 'Invalid file name pattern: %', _file_name;
  END IF;
  v_contractor := v_parts[2];
  v_interviewer := v_parts[3];

  -- Resolve FM
  SELECT field_manager_id INTO v_fm_id
  FROM public.team_assignments
  WHERE interviewer_code = v_interviewer AND contractor_id = v_contractor AND status = 'approved'
  ORDER BY created_at DESC LIMIT 1;

  -- Locks: global, contractor, field_manager, interviewer
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

  -- Quotas
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
