
-- =====================================================
-- 1. FM REASSIGNMENT: contractor-scoped RPC
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_assignable_field_managers(_for_contractor text DEFAULT NULL)
RETURNS TABLE(id uuid, full_name text, contractor_id text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_contractor text;
  is_admin_user boolean;
BEGIN
  IF caller IS NULL THEN
    RETURN;
  END IF;

  is_admin_user := public.has_role(caller, 'admin'::app_role)
                OR public.has_role(caller, 'super_admin'::app_role);

  -- Resolve the contractor we should scope to
  IF is_admin_user THEN
    -- Admins: optionally scope to a specific contractor; otherwise return all
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

  -- Non-admin: scope to caller's active contractor
  SELECT COALESCE(active_contractor_id, contractor_id)
    INTO caller_contractor
  FROM public.profiles
  WHERE id = caller;

  IF caller_contractor IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id, p.full_name, p.contractor_id
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE ur.role = 'field_manager'
      AND COALESCE(p.is_approved, false) = true
      AND (
        p.contractor_id = caller_contractor
        OR EXISTS (
          SELECT 1 FROM public.user_contractor_assignments uca
          WHERE uca.user_id = p.id AND uca.contractor_id = caller_contractor
        )
      )
    ORDER BY p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assignable_field_managers(text) TO authenticated;

-- =====================================================
-- 2. TIME-SLICED FM OWNERSHIP
-- =====================================================
CREATE TABLE IF NOT EXISTS public.team_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interviewer_code text NOT NULL,
  contractor_id text NOT NULL,
  field_manager_id uuid NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tah_lookup
  ON public.team_assignment_history (interviewer_code, contractor_id, effective_from DESC);

ALTER TABLE public.team_assignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view team_assignment_history"
ON public.team_assignment_history FOR SELECT
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Admins manage team_assignment_history"
ON public.team_assignment_history FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- Backfill from existing approved team_assignments
INSERT INTO public.team_assignment_history
  (interviewer_code, contractor_id, field_manager_id, effective_from, created_by)
SELECT ta.interviewer_code, ta.contractor_id, ta.field_manager_id,
       COALESCE(ta.approved_at, ta.created_at, now()), ta.approved_by
FROM public.team_assignments ta
WHERE ta.status = 'approved'
ON CONFLICT DO NOTHING;

-- Trigger function: maintain history + auto-pin old interviews to previous FM
CREATE OR REPLACE FUNCTION public.handle_team_assignment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_fm uuid;
  cutoff timestamptz := now();
BEGIN
  -- Only act on approved assignments (insert or status change)
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'approved'
         AND (OLD.field_manager_id IS DISTINCT FROM NEW.field_manager_id
              OR OLD.status IS DISTINCT FROM NEW.status)) THEN

    -- Find previous open history row for this (interviewer_code, contractor)
    SELECT field_manager_id INTO prev_fm
    FROM public.team_assignment_history
    WHERE interviewer_code = NEW.interviewer_code
      AND contractor_id = NEW.contractor_id
      AND effective_to IS NULL
    ORDER BY effective_from DESC
    LIMIT 1;

    -- Close prior history row
    IF prev_fm IS NOT NULL AND prev_fm <> NEW.field_manager_id THEN
      UPDATE public.team_assignment_history
      SET effective_to = cutoff
      WHERE interviewer_code = NEW.interviewer_code
        AND contractor_id = NEW.contractor_id
        AND effective_to IS NULL;

      -- Pin all interviews uploaded BEFORE the cutoff to the previous FM
      INSERT INTO public.interview_fm_overrides (audit_id, field_manager_id, assigned_by, notes)
      SELECT a.id, prev_fm, NEW.approved_by,
             'Auto-pinned to previous FM on agent reassignment at ' || cutoff::text
      FROM public.audits a
      INNER JOIN public.interview_metadata im ON im.audit_id = a.id
      WHERE im.interviewer_code = NEW.interviewer_code
        AND im.contractor_id = NEW.contractor_id
        AND a.uploaded_at < cutoff
        AND NOT EXISTS (
          SELECT 1 FROM public.interview_fm_overrides ifo WHERE ifo.audit_id = a.id
        )
      ON CONFLICT (audit_id) DO NOTHING;
    END IF;

    -- Insert new open history row (if FM differs or no prior row)
    IF prev_fm IS NULL OR prev_fm <> NEW.field_manager_id THEN
      INSERT INTO public.team_assignment_history
        (interviewer_code, contractor_id, field_manager_id, effective_from, created_by)
      VALUES (NEW.interviewer_code, NEW.contractor_id, NEW.field_manager_id,
              cutoff, NEW.approved_by);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_assignment_change ON public.team_assignments;
CREATE TRIGGER trg_team_assignment_change
AFTER INSERT OR UPDATE ON public.team_assignments
FOR EACH ROW EXECUTE FUNCTION public.handle_team_assignment_change();

-- Ensure interview_fm_overrides has unique audit_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'interview_fm_overrides_audit_id_key'
  ) THEN
    ALTER TABLE public.interview_fm_overrides
      ADD CONSTRAINT interview_fm_overrides_audit_id_key UNIQUE (audit_id);
  END IF;
END $$;

-- =====================================================
-- 3. CHAT / INBOX TABLES
-- =====================================================

-- Conversations
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct' CHECK (type IN ('direct','group','audit_thread','system')),
  title text,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general','failed_audit','tracking_comment','announcement','push','direct','group')),
  contractor_id text,
  audit_id uuid,
  created_by uuid,
  is_archived boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_audit ON public.chat_conversations (audit_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_contractor ON public.chat_conversations (contractor_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_last_msg ON public.chat_conversations (last_message_at DESC NULLS LAST);

-- Participants
CREATE TABLE IF NOT EXISTS public.chat_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  participant_role text NOT NULL DEFAULT 'member' CHECK (participant_role IN ('owner','member','observer')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  is_muted boolean NOT NULL DEFAULT false,
  removed_at timestamptz,
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_part_user ON public.chat_participants (user_id, removed_at);
CREATE INDEX IF NOT EXISTS idx_chat_part_conv ON public.chat_participants (conversation_id);

-- Messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid,
  body text,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','system','audit_action','attachment')),
  attachments jsonb DEFAULT '[]'::jsonb,
  reply_to_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON public.chat_messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_msg_sender ON public.chat_messages (sender_id);

-- Messaging policies (role × role)
CREATE TABLE IF NOT EXISTS public.chat_messaging_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_role app_role NOT NULL,
  to_role app_role NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_role, to_role)
);

-- Seed: allow all role-to-role pairs (cross-contractor still blocked at function level)
INSERT INTO public.chat_messaging_policies (from_role, to_role, allowed)
SELECT a.role, b.role, true
FROM (SELECT unnest(enum_range(NULL::app_role)) AS role) a,
     (SELECT unnest(enum_range(NULL::app_role)) AS role) b
ON CONFLICT (from_role, to_role) DO NOTHING;

-- Per-user preferences
CREATE TABLE IF NOT EXISTS public.chat_user_preferences (
  user_id uuid PRIMARY KEY,
  categories_enabled jsonb NOT NULL DEFAULT '{"failed_audit":true,"tracking_comment":true,"announcement":true,"push":true,"direct":true,"group":true}'::jsonb,
  email_digest boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Outbox for async events
CREATE TABLE IF NOT EXISTS public.chat_pending_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_pending_unprocessed ON public.chat_pending_events (processed_at) WHERE processed_at IS NULL;

-- =====================================================
-- 4. RLS for chat tables
-- =====================================================

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messaging_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_pending_events ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller a participant of a conversation?
CREATE OR REPLACE FUNCTION public.is_chat_participant(_conv uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE conversation_id = _conv
      AND user_id = _user
      AND removed_at IS NULL
  );
$$;

-- Conversations
CREATE POLICY "Participants or super_admin can view conversations"
ON public.chat_conversations FOR SELECT
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.is_chat_participant(id, auth.uid())
);

CREATE POLICY "Approved users can create conversations"
ON public.chat_conversations FOR INSERT
WITH CHECK (public.is_user_approved(auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Owners and admins update conversations"
ON public.chat_conversations FOR UPDATE
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR public.is_chat_participant(id, auth.uid())
);

CREATE POLICY "Super admins delete conversations"
ON public.chat_conversations FOR DELETE
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Participants
CREATE POLICY "Users see participants of their conversations"
ON public.chat_participants FOR SELECT
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.is_chat_participant(conversation_id, auth.uid())
);

CREATE POLICY "Owners and admins add participants"
ON public.chat_participants FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = conversation_id AND c.created_by = auth.uid()
  )
  OR (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = conversation_id AND c.created_by = auth.uid()
  ))
);

CREATE POLICY "Users update own participant row"
ON public.chat_participants FOR UPDATE
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Owners and admins remove participants"
ON public.chat_participants FOR DELETE
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = conversation_id AND c.created_by = auth.uid()
  )
);

-- Messages
CREATE POLICY "Participants view messages"
ON public.chat_messages FOR SELECT
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.is_chat_participant(conversation_id, auth.uid())
);

CREATE POLICY "Participants send messages"
ON public.chat_messages FOR INSERT
WITH CHECK (
  public.is_user_approved(auth.uid())
  AND (sender_id IS NULL OR sender_id = auth.uid())
  AND public.is_chat_participant(conversation_id, auth.uid())
);

CREATE POLICY "Senders edit own messages"
ON public.chat_messages FOR UPDATE
USING (sender_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Senders or admins delete messages"
ON public.chat_messages FOR DELETE
USING (
  sender_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- Messaging policies (super_admin only)
CREATE POLICY "Anyone approved can read policies"
ON public.chat_messaging_policies FOR SELECT
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Super admins manage policies"
ON public.chat_messaging_policies FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- User preferences (own row only)
CREATE POLICY "Users manage own chat prefs"
ON public.chat_user_preferences FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Pending events (admin only; service-role bypasses RLS)
CREATE POLICY "Admins read pending events"
ON public.chat_pending_events FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- =====================================================
-- 5. RPCs for chat
-- =====================================================

-- Mark a conversation read
CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_participants
  SET unread_count = 0, last_read_at = now()
  WHERE conversation_id = _conversation_id
    AND user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- Get unread counts grouped by category for the current user
CREATE OR REPLACE FUNCTION public.get_chat_unread_summary()
RETURNS TABLE(category text, unread_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.category, COALESCE(SUM(p.unread_count), 0)::bigint
  FROM public.chat_participants p
  INNER JOIN public.chat_conversations c ON c.id = p.conversation_id
  WHERE p.user_id = auth.uid()
    AND p.removed_at IS NULL
    AND p.is_muted = false
  GROUP BY c.category;
$$;
GRANT EXECUTE ON FUNCTION public.get_chat_unread_summary() TO authenticated;

-- Total unread count for the current user
CREATE OR REPLACE FUNCTION public.get_chat_unread_total()
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(p.unread_count), 0)::bigint
  FROM public.chat_participants p
  WHERE p.user_id = auth.uid()
    AND p.removed_at IS NULL
    AND p.is_muted = false;
$$;
GRANT EXECUTE ON FUNCTION public.get_chat_unread_total() TO authenticated;

-- Same-contractor + policy validation
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
BEGIN
  IF caller IS NULL THEN RETURN false; END IF;

  -- Super admin can message anyone
  IF public.has_role(caller, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  SELECT COALESCE(active_contractor_id, contractor_id) INTO caller_contractor
  FROM public.profiles WHERE id = caller;

  -- Determine caller's primary role (first match)
  SELECT role INTO caller_role FROM public.user_roles WHERE user_id = caller LIMIT 1;
  IF caller_role IS NULL THEN RETURN false; END IF;

  FOR rec IN
    SELECT p.id, COALESCE(p.active_contractor_id, p.contractor_id) AS contractor_id,
           (SELECT role FROM public.user_roles WHERE user_id = p.id LIMIT 1) AS role
    FROM public.profiles p
    WHERE p.id = ANY(_recipient_ids)
  LOOP
    -- Same contractor required
    IF rec.contractor_id IS DISTINCT FROM caller_contractor THEN
      RETURN false;
    END IF;
    -- Policy matrix
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
GRANT EXECUTE ON FUNCTION public.can_message_users(uuid[]) TO authenticated;

-- Create a direct/group conversation with policy + contractor check
CREATE OR REPLACE FUNCTION public.create_chat_conversation(
  _participant_ids uuid[],
  _title text DEFAULT NULL,
  _type text DEFAULT 'direct',
  _category text DEFAULT 'direct'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_conv uuid;
  caller uuid := auth.uid();
  caller_contractor text;
  uid uuid;
  existing_conv uuid;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.can_message_users(_participant_ids) THEN
    RAISE EXCEPTION 'messaging policy disallows one or more recipients';
  END IF;

  SELECT COALESCE(active_contractor_id, contractor_id) INTO caller_contractor
  FROM public.profiles WHERE id = caller;

  -- For 1:1 direct chats, return existing conversation if it exists
  IF _type = 'direct' AND array_length(_participant_ids, 1) = 1 THEN
    SELECT c.id INTO existing_conv
    FROM public.chat_conversations c
    WHERE c.type = 'direct'
      AND EXISTS (SELECT 1 FROM public.chat_participants WHERE conversation_id = c.id AND user_id = caller AND removed_at IS NULL)
      AND EXISTS (SELECT 1 FROM public.chat_participants WHERE conversation_id = c.id AND user_id = _participant_ids[1] AND removed_at IS NULL)
      AND (SELECT COUNT(*) FROM public.chat_participants WHERE conversation_id = c.id AND removed_at IS NULL) = 2
    LIMIT 1;
    IF existing_conv IS NOT NULL THEN RETURN existing_conv; END IF;
  END IF;

  INSERT INTO public.chat_conversations (type, title, category, contractor_id, created_by)
  VALUES (_type, _title, _category, caller_contractor, caller)
  RETURNING id INTO new_conv;

  -- Add caller as owner
  INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
  VALUES (new_conv, caller, 'owner');

  -- Add other participants
  FOREACH uid IN ARRAY _participant_ids LOOP
    IF uid <> caller THEN
      INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
      VALUES (new_conv, uid, 'member')
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN new_conv;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_chat_conversation(uuid[], text, text, text) TO authenticated;

-- =====================================================
-- 6. Triggers: maintain unread + last_message
-- =====================================================
CREATE OR REPLACE FUNCTION public.on_chat_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update conversation summary
  UPDATE public.chat_conversations
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(COALESCE(NEW.body, '[attachment]'), 200),
      updated_at = now()
  WHERE id = NEW.conversation_id;

  -- Increment unread for everyone except the sender
  UPDATE public.chat_participants
  SET unread_count = unread_count + 1
  WHERE conversation_id = NEW.conversation_id
    AND removed_at IS NULL
    AND (NEW.sender_id IS NULL OR user_id <> NEW.sender_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_chat_message_insert ON public.chat_messages;
CREATE TRIGGER trg_on_chat_message_insert
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.on_chat_message_insert();

-- =====================================================
-- 7. Audit-failure auto-thread (outbox via trigger)
-- =====================================================
CREATE OR REPLACE FUNCTION public.queue_audit_chat_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'Failed Audit')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'Failed Audit'
         AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.chat_pending_events (event_type, payload)
    VALUES ('audit_failed', jsonb_build_object(
      'audit_id', NEW.id,
      'file_name', NEW.file_name,
      'review_comment', NEW.review_comment,
      'action_plan', NEW.action_plan,
      'reviewed_by', NEW.reviewed_by,
      'artifact_correction', NEW.artifact_correction
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_audit_chat_event ON public.audits;
CREATE TRIGGER trg_queue_audit_chat_event
AFTER INSERT OR UPDATE OF status ON public.audits
FOR EACH ROW EXECUTE FUNCTION public.queue_audit_chat_event();

-- =====================================================
-- 8. Realtime
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
