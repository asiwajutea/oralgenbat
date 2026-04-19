import { Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAiSettings, AiFeatureSettings } from "@/hooks/useAiSettings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, FileCheck, Volume2, ShieldAlert, Bug, Receipt, Save } from "lucide-react";
import { toast } from "sonner";

type FeatureKey =
  | "pdf_analysis_enabled"
  | "audio_summary_enabled"
  | "fraud_analysis_enabled"
  | "error_suggestion_enabled"
  | "invoice_parsing_enabled";

const FEATURES: Array<{
  key: FeatureKey;
  title: string;
  icon: typeof Sparkles;
  description: string;
  fallback: string;
}> = [
  {
    key: "pdf_analysis_enabled",
    title: "PDF Quality Analysis",
    icon: FileCheck,
    description: "Auto-scores clarity & handwriting legibility on the Review page.",
    fallback: "Auditors enter clarity & legibility scores manually using sliders.",
  },
  {
    key: "audio_summary_enabled",
    title: "Audio Quality Summary",
    icon: Volume2,
    description: "Generates an AI summary of audio quality after duration confirmation.",
    fallback: "Auditors type a manual quality note; durations and noise levels still save.",
  },
  {
    key: "fraud_analysis_enabled",
    title: "Fraud AI Narrative",
    icon: ShieldAlert,
    description: "Generates the AI summary, concerning patterns and action plan on the Agent Fraud Analysis page.",
    fallback: "All fraud indicators, charts and metrics still render — only the AI narrative is hidden.",
  },
  {
    key: "error_suggestion_enabled",
    title: "Error Fix Suggestions",
    icon: Bug,
    description: "AI-suggested fixes for items in the Error Console.",
    fallback: "Admins continue to use the manual notes field on each error log.",
  },
  {
    key: "invoice_parsing_enabled",
    title: "Invoice PDF Parsing",
    icon: Receipt,
    description: "Auto-extracts payment records from uploaded SBI invoice PDFs.",
    fallback: "Only the Manual Invoice Entry dialog is shown for adding payments.",
  },
];

const AISettings = () => {
  const { user, userRole, loading } = useAuth();
  const { data: settings, isLoading } = useAiSettings();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AiFeatureSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || userRole !== "super_admin") {
    return <Navigate to="/" replace />;
  }

  const dirty = draft && settings && FEATURES.some(f => draft[f.key] !== settings[f.key]);

  const toggle = (key: FeatureKey) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: !draft[key] });
  };

  const handleSave = async () => {
    if (!draft || !settings) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ai_feature_settings")
        .update({
          pdf_analysis_enabled: draft.pdf_analysis_enabled,
          audio_summary_enabled: draft.audio_summary_enabled,
          fraud_analysis_enabled: draft.fraud_analysis_enabled,
          error_suggestion_enabled: draft.error_suggestion_enabled,
          invoice_parsing_enabled: draft.invoice_parsing_enabled,
          updated_by: user.id,
        })
        .eq("id", settings.id);

      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["ai-feature-settings"] });
      toast.success("AI settings updated");
    } catch (err) {
      console.error("Save AI settings error:", err);
      toast.error("Failed to save AI settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container py-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Feature Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Toggle AI-powered sections on or off globally. When a section is OFF, its AI buttons
            are hidden and only the manual entry path remains available.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      {isLoading || !draft ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            const enabled = draft[f.key];
            return (
              <Card key={f.key}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-md ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{f.title}</CardTitle>
                        <CardDescription className="mt-1">{f.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Label htmlFor={f.key} className="text-sm text-muted-foreground">
                        {enabled ? "On" : "Off"}
                      </Label>
                      <Switch
                        id={f.key}
                        checked={enabled}
                        onCheckedChange={() => toggle(f.key)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className={`text-xs rounded-md p-3 border ${enabled ? "bg-muted/30 text-muted-foreground border-border" : "bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800"}`}>
                    <span className="font-medium">When OFF:</span> {f.fallback}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AISettings;
