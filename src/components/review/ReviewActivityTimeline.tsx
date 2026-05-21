import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Activity,
  ChevronDown,
  FilePlus,
  FileArchive,
  RefreshCcw,
  User,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Flame,
  ShieldCheck,
  AlertCircle,
  Upload,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface Props {
  auditId: string;
  defaultOpen?: boolean;
}

type TimelineEvent = {
  id: string;
  at: string;
  icon: any;
  label: string;
  detail?: string;
  actorId?: string | null;
  actorRole?: string | null;
};

const HUMAN_LABELS: Record<string, { label: string; icon: any }> = {
  pdf_uploaded: { label: "PDF uploaded", icon: Upload },
  pdf_replaced: { label: "PDF replaced", icon: FilePlus },
  metadata_uploaded: { label: "Metadata uploaded", icon: Upload },
  metadata_replaced: { label: "Metadata ZIP replaced", icon: FileArchive },
  audit_passed: { label: "Marked as Passed", icon: CheckCircle2 },
  audit_failed: { label: "Marked as Failed", icon: XCircle },
  audit_quick_passed: { label: "Quick-passed re-audit", icon: CheckCircle2 },
  audit_quick_failed: { label: "Quick-failed re-audit", icon: XCircle },
  passed_with_override: { label: "Passed with Override", icon: ShieldCheck },
  interview_locked: { label: "Interview locked", icon: Lock },
  interview_unlocked: { label: "Interview unlocked", icon: Unlock },
  artifact_resolved: { label: "Artifact correction resolved", icon: CheckCircle2 },
  fm_reassigned: { label: "Field Manager reassigned", icon: User },
  sent_to_burn: { label: "Sent to Burn queue", icon: Flame },
  field_audit_synced: { label: "Field audit synced", icon: ShieldCheck },
  re_audit_submitted: { label: "Sent back for re-audit", icon: RefreshCcw },
};

const humanizeAction = (action: string) => {
  if (HUMAN_LABELS[action]) return HUMAN_LABELS[action];
  return { label: action.replace(/_/g, " "), icon: Activity };
};

export const ReviewActivityTimeline = ({ auditId, defaultOpen = false }: Props) => {
  const [open, setOpen] = useState(defaultOpen);

  const { data: submissions = [] } = useQuery({
    queryKey: ["review-activity-submissions", auditId],
    queryFn: async () => {
      const { data } = await supabase
        .from("re_audit_submissions")
        .select("id, submitted_at, submitted_by, submitted_by_role, replaced_pdf, replaced_zip, submission_comment, re_audit_note")
        .eq("audit_id", auditId)
        .order("submitted_at", { ascending: false });
      return data || [];
    },
    enabled: !!auditId,
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["review-activity-log", auditId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_activity_log")
        .select("id, action_type, description, created_at, user_id, user_role, metadata")
        .eq("entity_type", "audit")
        .eq("entity_id", auditId)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!auditId,
  });

  // Collect all user IDs and resolve names in one batch
  const userIds = Array.from(
    new Set(
      [
        ...submissions.map((s: any) => s.submitted_by),
        ...activity.map((a: any) => a.user_id),
      ].filter(Boolean),
    ),
  );

  const { data: profilesMap = new Map<string, string>() } = useQuery({
    queryKey: ["review-activity-profiles", auditId, userIds.sort().join(",")],
    queryFn: async () => {
      const map = new Map<string, string>();
      if (userIds.length === 0) return map;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      (data || []).forEach((p: any) =>
        map.set(p.id, p.full_name || p.email || p.id.slice(0, 8)),
      );
      return map;
    },
    enabled: userIds.length > 0,
  });

  // Build events
  const events: TimelineEvent[] = [];

  for (const s of submissions as any[]) {
    const base = {
      at: s.submitted_at,
      actorId: s.submitted_by,
      actorRole: s.submitted_by_role,
      detail: s.submission_comment || s.re_audit_note || undefined,
    };
    if (s.replaced_pdf)
      events.push({ id: `${s.id}-pdf`, icon: FilePlus, label: "PDF replaced (re-audit)", ...base });
    if (s.replaced_zip)
      events.push({ id: `${s.id}-zip`, icon: FileArchive, label: "Metadata ZIP replaced (re-audit)", ...base });
    if (!s.replaced_pdf && !s.replaced_zip)
      events.push({
        id: `${s.id}-nc`,
        icon: RefreshCcw,
        label: "Sent back for re-audit without changes",
        ...base,
      });
  }

  for (const a of activity as any[]) {
    const { label, icon } = humanizeAction(a.action_type);
    events.push({
      id: `act-${a.id}`,
      at: a.created_at,
      icon,
      label,
      detail: a.description || undefined,
      actorId: a.user_id,
      actorRole: a.user_role,
    });
  }

  // De-dup: skip activity rows that mirror a re_audit_submission within 5s of the same actor
  const seen = new Set<string>();
  const deduped = events.filter((e) => {
    const key = `${e.actorId || ""}|${e.label}|${Math.floor(new Date(e.at).getTime() / 5000)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Activity history
                {deduped.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {deduped.length}
                  </Badge>
                )}
              </CardTitle>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {deduped.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No activity recorded yet for this interview.
              </p>
            ) : (
              <div className="max-h-[340px] overflow-y-auto space-y-3">
                {deduped.map((e) => {
                  const Icon = e.icon;
                  const actorName = e.actorId
                    ? (profilesMap as Map<string, string>).get(e.actorId) || "User"
                    : null;
                  return (
                    <div key={e.id} className="flex gap-3 text-sm">
                      <div className="mt-0.5">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{e.label}</span>
                          {actorName && (
                            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {actorName}
                              {e.actorRole && (
                                <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                                  {String(e.actorRole).replace(/_/g, " ")}
                                </Badge>
                              )}
                            </span>
                          )}
                          <span
                            className="text-xs text-muted-foreground"
                            title={format(new Date(e.at), "PPP p")}
                          >
                            {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                          </span>
                        </div>
                        {e.detail && (
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">
                            {e.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};