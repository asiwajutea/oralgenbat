import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AiFeatureSettings {
  id: string;
  pdf_analysis_enabled: boolean;
  audio_summary_enabled: boolean;
  fraud_analysis_enabled: boolean;
  error_suggestion_enabled: boolean;
  invoice_parsing_enabled: boolean;
  updated_at: string;
}

const DEFAULT_SETTINGS: AiFeatureSettings = {
  id: "",
  pdf_analysis_enabled: true,
  audio_summary_enabled: true,
  fraud_analysis_enabled: true,
  error_suggestion_enabled: true,
  invoice_parsing_enabled: true,
  updated_at: new Date().toISOString(),
};

export const useAiSettings = () => {
  return useQuery({
    queryKey: ["ai-feature-settings"],
    queryFn: async (): Promise<AiFeatureSettings> => {
      const { data, error } = await supabase
        .from("ai_feature_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("Failed to load AI settings, defaulting to enabled:", error);
        return DEFAULT_SETTINGS;
      }
      return (data as AiFeatureSettings) ?? DEFAULT_SETTINGS;
    },
    staleTime: 1000 * 60 * 5,
  });
};
