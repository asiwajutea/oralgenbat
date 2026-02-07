-- Create table for artifact correction resolution comments and replies
CREATE TABLE public.artifact_correction_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  parent_comment_id UUID REFERENCES public.artifact_correction_comments(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fk_parent_comment CHECK (parent_comment_id IS NULL OR parent_comment_id != id)
);

-- Create index for faster queries
CREATE INDEX idx_artifact_correction_comments_audit_id ON public.artifact_correction_comments(audit_id);
CREATE INDEX idx_artifact_correction_comments_parent_id ON public.artifact_correction_comments(parent_comment_id);
CREATE INDEX idx_artifact_correction_comments_user_id ON public.artifact_correction_comments(user_id);

-- Enable Row Level Security
ALTER TABLE public.artifact_correction_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Approved users can view comments" 
ON public.artifact_correction_comments 
FOR SELECT 
USING (is_user_approved(auth.uid()));

CREATE POLICY "Approved users can insert comments" 
ON public.artifact_correction_comments 
FOR INSERT 
WITH CHECK (is_user_approved(auth.uid()) AND auth.uid() = user_id);

CREATE POLICY "Users can update their own comments" 
ON public.artifact_correction_comments 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments" 
ON public.artifact_correction_comments 
FOR DELETE 
USING (auth.uid() = user_id);

-- Function to notify parent comment author when a reply is added
CREATE OR REPLACE FUNCTION public.notify_comment_reply()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_user_id UUID;
  v_file_name TEXT;
  v_replier_name TEXT;
BEGIN
  -- Only trigger for replies (when parent_comment_id is set)
  IF NEW.parent_comment_id IS NOT NULL THEN
    -- Get the parent comment author
    SELECT user_id INTO v_parent_user_id
    FROM public.artifact_correction_comments
    WHERE id = NEW.parent_comment_id;
    
    -- Don't notify if replying to own comment
    IF v_parent_user_id = NEW.user_id THEN
      RETURN NEW;
    END IF;
    
    -- Get the file name from the audit
    SELECT file_name INTO v_file_name
    FROM public.audits
    WHERE id = NEW.audit_id;
    
    -- Get the replier's name
    SELECT full_name INTO v_replier_name
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    -- Insert notification for the parent comment author
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for comment replies
CREATE TRIGGER trigger_notify_comment_reply
AFTER INSERT ON public.artifact_correction_comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_comment_reply();