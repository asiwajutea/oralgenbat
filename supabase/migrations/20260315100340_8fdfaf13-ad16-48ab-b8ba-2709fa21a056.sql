
-- Create burn_queue table
CREATE TABLE public.burn_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL,
  file_name text NOT NULL,
  sent_by uuid NOT NULL,
  reason text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  restored_by uuid
);

-- Enable RLS
ALTER TABLE public.burn_queue ENABLE ROW LEVEL SECURITY;

-- Approved users can view burn_queue
CREATE POLICY "Approved users can view burn queue"
ON public.burn_queue FOR SELECT
TO authenticated
USING (is_user_approved(auth.uid()));

-- FM, contractor, sub_contractor, admin, super_admin can insert
CREATE POLICY "Authorized users can insert burn queue"
ON public.burn_queue FOR INSERT
TO authenticated
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'super_admin') OR
    has_role(auth.uid(), 'contractor') OR
    has_role(auth.uid(), 'sub_contractor') OR
    has_role(auth.uid(), 'field_manager')
  )
);

-- Admin/super_admin can update (for restore)
CREATE POLICY "Admins can update burn queue"
ON public.burn_queue FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'));

-- Admin/super_admin can delete
CREATE POLICY "Admins can delete burn queue"
ON public.burn_queue FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'));
