import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ReAuditNoteBannerProps {
  auditId: string;
}

export const ReAuditNoteBanner = ({ auditId }: ReAuditNoteBannerProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["reaudit-note", auditId],
    queryFn: async () => {
      const { data: submission, error } = await supabase
        .from("re_audit_submissions")
        .select("id, re_audit_note, submitted_by, submitted_at")
        .eq("audit_id", auditId)
        .not("re_audit_note", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!submission) return null;

      let submitterName = "team member";
      if (submission.submitted_by) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", submission.submitted_by)
          .maybeSingle();
        if (profile?.full_name) submitterName = profile.full_name;
      }
      return { ...submission, submitterName };
    },
    enabled: !!auditId,
    staleTime: 60_000,
  });

  const dismissKey = data ? `reaudit-note-dismissed:${data.id}` : null;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!dismissKey) return;
    setDismissed(sessionStorage.getItem(dismissKey) === "1");
  }, [dismissKey]);

  if (isLoading || !data || dismissed || !data.re_audit_note) return null;

  const handleDismiss = () => {
    if (dismissKey) sessionStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  const sentAgo = data.submitted_at
    ? formatDistanceToNow(new Date(data.submitted_at), { addSuffix: true })
    : null;

  return (
    <Alert className="relative border-amber-500/40 bg-amber-500/10 text-foreground">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDismiss}
        className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss note"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
      <AlertTitle className="text-amber-900 dark:text-amber-200 pr-8">
        Special note from {data.submitterName}
      </AlertTitle>
      <AlertDescription className="space-y-1">
        <p className="text-sm whitespace-pre-wrap">{data.re_audit_note}</p>
        {sentAgo && (
          <p className="text-xs text-muted-foreground">Sent {sentAgo}</p>
        )}
      </AlertDescription>
    </Alert>
  );
};

export default ReAuditNoteBanner;