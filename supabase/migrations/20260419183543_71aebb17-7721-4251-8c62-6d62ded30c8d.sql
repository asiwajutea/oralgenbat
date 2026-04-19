-- Create AI feature settings table (single-row config)
CREATE TABLE public.ai_feature_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_analysis_enabled boolean NOT NULL DEFAULT true,
  audio_summary_enabled boolean NOT NULL DEFAULT true,
  fraud_analysis_enabled boolean NOT NULL DEFAULT true,
  error_suggestion_enabled boolean NOT NULL DEFAULT true,
  invoice_parsing_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.ai_feature_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read
CREATE POLICY "Authenticated users can view AI settings"
ON public.ai_feature_settings
FOR SELECT
TO authenticated
USING (true);

-- Only super_admin can update
CREATE POLICY "Super admins can update AI settings"
ON public.ai_feature_settings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Only super_admin can insert (in case of reseed)
CREATE POLICY "Super admins can insert AI settings"
ON public.ai_feature_settings
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_ai_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_feature_settings_updated_at
BEFORE UPDATE ON public.ai_feature_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_ai_settings_updated_at();

-- Seed default row (all enabled)
INSERT INTO public.ai_feature_settings (
  pdf_analysis_enabled,
  audio_summary_enabled,
  fraud_analysis_enabled,
  error_suggestion_enabled,
  invoice_parsing_enabled
) VALUES (true, true, true, true, true);