-- Add is_read column to track unread comments
ALTER TABLE public.artifact_correction_comments
ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;

-- Update the notify_comment_reply function to also notify the user who marked as resolved
CREATE OR REPLACE FUNCTION public.notify_comment_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_user_id UUID;
  v_resolver_user_id UUID;
  v_file_name TEXT;
  v_replier_name TEXT;
BEGIN
  -- Get the file name and resolver from the audit
  SELECT file_name, artifact_correction_resolved_by INTO v_file_name, v_resolver_user_id
  FROM public.audits
  WHERE id = NEW.audit_id;
  
  -- Get the replier's name
  SELECT full_name INTO v_replier_name
  FROM public.profiles
  WHERE id = NEW.user_id;
  
  -- If this is a reply to another comment, notify the parent comment author
  IF NEW.parent_comment_id IS NOT NULL THEN
    -- Get the parent comment author
    SELECT user_id INTO v_parent_user_id
    FROM public.artifact_correction_comments
    WHERE id = NEW.parent_comment_id;
    
    -- Don't notify if replying to own comment
    IF v_parent_user_id IS NOT NULL AND v_parent_user_id != NEW.user_id THEN
      INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
      VALUES (
        v_parent_user_id,
        'comment_reply',
        'New Reply to Your Comment',
        v_replier_name || ' replied to your comment on interview ' || v_file_name,
        jsonb_build_object(
          'audit_id', NEW.audit_id,
          'file_name', v_file_name,
          'comment_id', NEW.id,
          'parent_comment_id', NEW.parent_comment_id,
          'replier_id', NEW.user_id,
          'replier_name', v_replier_name
        )
      );
    END IF;
  END IF;
  
  -- Also notify the user who marked as resolved (if different from replier and parent author)
  IF v_resolver_user_id IS NOT NULL 
     AND v_resolver_user_id != NEW.user_id 
     AND (v_parent_user_id IS NULL OR v_resolver_user_id != v_parent_user_id) THEN
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    VALUES (
      v_resolver_user_id,
      'resolution_comment',
      'New Comment on Resolved Interview',
      v_replier_name || ' commented on resolved interview ' || v_file_name,
      jsonb_build_object(
        'audit_id', NEW.audit_id,
        'file_name', v_file_name,
        'comment_id', NEW.id,
        'commenter_id', NEW.user_id,
        'commenter_name', v_replier_name
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Ensure trigger exists (drop and recreate to apply changes)
DROP TRIGGER IF EXISTS trigger_notify_comment_reply ON public.artifact_correction_comments;

CREATE TRIGGER trigger_notify_comment_reply
AFTER INSERT ON public.artifact_correction_comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_comment_reply();