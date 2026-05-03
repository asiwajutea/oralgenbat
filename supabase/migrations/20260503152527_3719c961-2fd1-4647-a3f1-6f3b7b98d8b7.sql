
ALTER TABLE public.chat_participants
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

DROP FUNCTION IF EXISTS public.leave_conversation(uuid);

CREATE OR REPLACE FUNCTION public.leave_conversation(_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  UPDATE public.chat_participants
     SET closed_at = now()
   WHERE conversation_id = _conversation_id
     AND user_id = v_uid
     AND removed_at IS NULL;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_closed_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_participants
     SET closed_at = NULL
   WHERE conversation_id = NEW.conversation_id
     AND closed_at IS NOT NULL
     AND removed_at IS NULL
     AND (NEW.sender_id IS NULL OR user_id <> NEW.sender_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reopen_closed_participants ON public.chat_messages;
CREATE TRIGGER trg_reopen_closed_participants
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.reopen_closed_participants();

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Approved users upload chat files" ON storage.objects;
CREATE POLICY "Approved users upload chat files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND public.is_user_approved(auth.uid())
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Approved users read chat files" ON storage.objects;
CREATE POLICY "Approved users read chat files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND public.is_user_approved(auth.uid())
);

DROP POLICY IF EXISTS "Owners or super admins delete chat files" ON storage.objects;
CREATE POLICY "Owners or super admins delete chat files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE TABLE IF NOT EXISTS public.chat_global_policy (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  all_users_mode text NOT NULL DEFAULT 'anyone',
  allow_same_team boolean NOT NULL DEFAULT false,
  allow_same_role boolean NOT NULL DEFAULT false,
  allow_managers_only boolean NOT NULL DEFAULT false,
  allowed_user_ids uuid[] NOT NULL DEFAULT '{}',
  team_chats_mode text NOT NULL DEFAULT 'anyone',
  team_chats_excepted_user_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.chat_global_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.chat_global_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users read chat global policy" ON public.chat_global_policy;
CREATE POLICY "Approved users read chat global policy"
ON public.chat_global_policy FOR SELECT TO authenticated
USING (public.is_user_approved(auth.uid()));

DROP POLICY IF EXISTS "Super admins manage chat global policy" ON public.chat_global_policy;
CREATE POLICY "Super admins manage chat global policy"
ON public.chat_global_policy FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TABLE IF NOT EXISTS public.chat_user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocked_user_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocked_user_id)
);

ALTER TABLE public.chat_user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users read chat user blocks" ON public.chat_user_blocks;
CREATE POLICY "Approved users read chat user blocks"
ON public.chat_user_blocks FOR SELECT TO authenticated
USING (public.is_user_approved(auth.uid()));

DROP POLICY IF EXISTS "Super admins manage chat user blocks" ON public.chat_user_blocks;
CREATE POLICY "Super admins manage chat user blocks"
ON public.chat_user_blocks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
