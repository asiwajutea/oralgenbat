
CREATE TABLE public.budget_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id text NOT NULL,
  target_names integer NOT NULL,
  label text,
  set_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(contractor_id)
);

ALTER TABLE public.budget_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view budget targets"
  ON public.budget_targets FOR SELECT
  USING (is_user_approved(auth.uid()));

CREATE POLICY "Admins and contractors can insert budget targets"
  ON public.budget_targets FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'contractor'::app_role)
  );

CREATE POLICY "Admins and contractors can update budget targets"
  ON public.budget_targets FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'contractor'::app_role)
  );

CREATE POLICY "Admins can delete budget targets"
  ON public.budget_targets FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );
