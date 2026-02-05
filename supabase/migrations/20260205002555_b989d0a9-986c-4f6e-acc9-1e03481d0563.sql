-- Create trigger function for announcement notifications
CREATE OR REPLACE FUNCTION public.notify_new_announcement()
RETURNS TRIGGER AS $$
BEGIN
  -- Only notify if announcement is active and scheduled time is now or in the past
  IF NEW.is_active = true AND (NEW.scheduled_at IS NULL OR NEW.scheduled_at <= now()) THEN
    -- Insert notification for all targeted users
    INSERT INTO public.user_notifications (user_id, type, title, message, metadata)
    SELECT 
      p.id,
      'announcement',
      'New Announcement: ' || NEW.title,
      LEFT(NEW.content, 100) || CASE WHEN LENGTH(NEW.content) > 100 THEN '...' ELSE '' END,
      jsonb_build_object('announcement_id', NEW.id)
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.is_approved = true
    AND (
      NEW.target_type = 'all' OR
      (NEW.target_type = 'contractor' AND (p.contractor_id = NEW.target_contractor_id OR p.active_contractor_id = NEW.target_contractor_id)) OR
      (NEW.target_type = 'role' AND ur.role = NEW.target_role) OR
      (NEW.target_type = 'user' AND p.id = ANY(NEW.target_user_ids))
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new announcements
DROP TRIGGER IF EXISTS on_announcement_created ON public.announcements;
CREATE TRIGGER on_announcement_created
  AFTER INSERT ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_announcement();

-- Add delete policy for creators
DROP POLICY IF EXISTS "Creators can delete own announcements" ON public.announcements;
CREATE POLICY "Creators can delete own announcements"
  ON public.announcements
  FOR DELETE
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'super_admin'));