
-- =========================================================
-- 1. Trigger: announcements -> chat event
-- =========================================================
CREATE OR REPLACE FUNCTION public.queue_announcement_chat_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND COALESCE(NEW.is_active, true)) THEN
    INSERT INTO public.chat_pending_events (event_type, payload)
    VALUES (
      'announcement_published',
      jsonb_build_object(
        'announcement_id', NEW.id,
        'title', NEW.title,
        'content', NEW.content,
        'style', NEW.style,
        'cta_text', NEW.cta_text,
        'cta_url', NEW.cta_url,
        'created_by', NEW.created_by,
        'target_type', NEW.target_type,
        'target_role', NEW.target_role,
        'target_roles', NEW.target_roles,
        'target_contractor_id', NEW.target_contractor_id,
        'target_user_ids', NEW.target_user_ids
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_announcement_chat_event ON public.announcements;
CREATE TRIGGER trg_announcement_chat_event
AFTER INSERT ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.queue_announcement_chat_event();

-- =========================================================
-- 2. Trigger: push notifications -> chat event (per delivery)
-- =========================================================
CREATE OR REPLACE FUNCTION public.queue_push_chat_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_url TEXT;
BEGIN
  -- Pull the parent push notification record (if it exists)
  SELECT pn.title, pn.message, pn.url
  INTO v_title, v_message, v_url
  FROM public.push_notifications pn
  WHERE pn.id = NEW.push_notification_id;

  IF v_title IS NULL THEN
    v_title := 'Notification';
  END IF;

  INSERT INTO public.chat_pending_events (event_type, payload)
  VALUES (
    'push_delivered',
    jsonb_build_object(
      'user_id', NEW.user_id,
      'push_notification_id', NEW.push_notification_id,
      'title', v_title,
      'message', v_message,
      'url', v_url
    )
  );
  RETURN NEW;
END;
$$;

-- Only attach if push_notification_deliveries exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='push_notification_deliveries') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_push_chat_event ON public.push_notification_deliveries';
    EXECUTE 'CREATE TRIGGER trg_push_chat_event AFTER INSERT ON public.push_notification_deliveries FOR EACH ROW EXECUTE FUNCTION public.queue_push_chat_event()';
  END IF;
END$$;

-- =========================================================
-- 3. Trigger: tracking / artifact correction comments -> chat event
-- =========================================================
CREATE OR REPLACE FUNCTION public.queue_tracking_comment_chat_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_file_name TEXT;
  v_contractor TEXT;
BEGIN
  SELECT a.file_name INTO v_file_name FROM public.audits a WHERE a.id = NEW.audit_id;
  SELECT m.contractor_id INTO v_contractor FROM public.interview_metadata m WHERE m.audit_id = NEW.audit_id LIMIT 1;

  INSERT INTO public.chat_pending_events (event_type, payload)
  VALUES (
    'tracking_comment_added',
    jsonb_build_object(
      'audit_id', NEW.audit_id,
      'comment_id', NEW.id,
      'parent_comment_id', NEW.parent_comment_id,
      'user_id', NEW.user_id,
      'comment', NEW.comment,
      'file_name', v_file_name,
      'contractor_id', v_contractor
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tracking_comment_chat_event ON public.artifact_correction_comments;
CREATE TRIGGER trg_tracking_comment_chat_event
AFTER INSERT ON public.artifact_correction_comments
FOR EACH ROW EXECUTE FUNCTION public.queue_tracking_comment_chat_event();

-- =========================================================
-- 4. RPC: rename_conversation
-- =========================================================
CREATE OR REPLACE FUNCTION public.rename_conversation(_conversation_id uuid, _new_title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_can boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(coalesce(_new_title,'')) < 1 THEN RAISE EXCEPTION 'Title required'; END IF;

  SELECT (
    has_role(v_uid, 'super_admin') OR
    has_role(v_uid, 'admin') OR
    EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = _conversation_id AND c.created_by = v_uid) OR
    public.is_chat_participant(_conversation_id, v_uid)
  ) INTO v_can;

  IF NOT v_can THEN RAISE EXCEPTION 'Not allowed'; END IF;

  UPDATE public.chat_conversations
  SET title = _new_title, updated_at = now()
  WHERE id = _conversation_id;
END;
$$;

-- =========================================================
-- 5. RPC: delete_conversation (cascade)
-- =========================================================
CREATE OR REPLACE FUNCTION public.delete_conversation(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_can boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT (
    has_role(v_uid, 'super_admin') OR
    has_role(v_uid, 'admin') OR
    EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = _conversation_id AND c.created_by = v_uid)
  ) INTO v_can;

  IF NOT v_can THEN RAISE EXCEPTION 'Not allowed'; END IF;

  DELETE FROM public.chat_messages WHERE conversation_id = _conversation_id;
  DELETE FROM public.chat_participants WHERE conversation_id = _conversation_id;
  DELETE FROM public.chat_conversations WHERE id = _conversation_id;
END;
$$;

-- =========================================================
-- 6. RPC: leave_conversation (per-user soft remove)
-- =========================================================
CREATE OR REPLACE FUNCTION public.leave_conversation(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.chat_participants
  SET removed_at = now()
  WHERE conversation_id = _conversation_id AND user_id = v_uid;
END;
$$;
