import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ActivityFilters, type ActivityFilterState } from "@/components/activity/ActivityFilters";
import { ActivityTimeline, type ActivityRow } from "@/components/activity/ActivityTimeline";
import { Activity, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfDay } from "date-fns";
import { toast } from "sonner";

const PAGE_SIZE = 50;

// Action catalogues per role (admins see everything)
const ACTION_CATALOG: Record<string, { value: string; label: string }[]> = {
  common: [
    { value: "login", label: "Login" },
    { value: "logout", label: "Logout" },
  ],
  auditor: [
    { value: "audit_passed", label: "Audit Passed" },
    { value: "audit_failed", label: "Audit Failed" },
    { value: "audit_pass_with_override", label: "Pass w/ Override" },
    { value: "audit_sent_to_burn", label: "Sent to Burn" },
    { value: "audit_restored_from_burn", label: "Restored from Burn" },
    { value: "comment_added", label: "Comment Added" },
  ],
  field_manager: [
    { value: "fm_reassigned", label: "FM Reassigned" },
    { value: "team_request_created", label: "Team Request" },
    { value: "team_request_approved", label: "Team Approved" },
    { value: "team_request_rejected", label: "Team Rejected" },
    { value: "re_audit_requested", label: "Re-audit Requested" },
    { value: "re_audit_submitted", label: "Re-audit Submitted" },
    { value: "audit_sent_to_burn", label: "Sent to Burn" },
    { value: "audit_restored_from_burn", label: "Restored from Burn" },
    { value: "issue_flagged", label: "Issue Flagged" },
    { value: "issue_resolved", label: "Issue Resolved" },
    { value: "pdf_uploaded", label: "Uploaded PDF" },
    { value: "metadata_uploaded", label: "Uploaded Metadata" },
    { value: "zip_uploaded", label: "Uploaded ZIP" },
  ],
  sub_contractor: [
    { value: "team_request_approved", label: "Team Approved" },
    { value: "team_request_rejected", label: "Team Rejected" },
    { value: "fm_reassigned", label: "FM Reassigned" },
    { value: "re_audit_requested", label: "Re-audit Requested" },
  ],
  contractor: [
    { value: "pdf_uploaded", label: "Uploaded PDF" },
    { value: "bulk_upload", label: "Bulk Upload" },
    { value: "payment_created", label: "Payment Created" },
    { value: "invoice_uploaded", label: "Invoice Uploaded" },
    { value: "budget_target_set", label: "Budget Target" },
    { value: "team_request_approved", label: "Team Approved" },
    { value: "team_request_rejected", label: "Team Rejected" },
    { value: "announcement_created", label: "Announcement" },
    { value: "fm_reassigned", label: "FM Reassigned" },
  ],
  data_entry_clerk: [
    { value: "issue_flagged", label: "Issue Flagged" },
    { value: "issue_resolved", label: "Issue Resolved" },
  ],
  quality_assurance_manager: [
    { value: "issue_flagged", label: "Issue Flagged" },
    { value: "issue_resolved", label: "Issue Resolved" },
    { value: "announcement_created", label: "Announcement" },
  ],
  admin: [
    { value: "user_approved", label: "User Approved" },
    { value: "user_suspended", label: "User Suspended" },
    { value: "user_role_changed", label: "Role Changed" },
    { value: "interview_deleted", label: "Interview Deleted" },
    { value: "push_sent", label: "Push Sent" },
    { value: "ai_settings_updated", label: "AI Settings" },
  ],
};

const buildActionsForRole = (role: string | null): { value: string; label: string }[] => {
  const set = new Map<string, { value: string; label: string }>();
  const add = (arr: { value: string; label: string }[]) =>
    arr.forEach(a => { if (!set.has(a.value)) set.set(a.value, a); });
  add(ACTION_CATALOG.common);
  if (!role) return Array.from(set.values());
  if (role === "admin" || role === "super_admin") {
    Object.values(ACTION_CATALOG).forEach(add);
  } else if (ACTION_CATALOG[role]) {
    add(ACTION_CATALOG[role]);
  } else {
    Object.values(ACTION_CATALOG).forEach(add);
  }
  return Array.from(set.values());
};

const UserActivity = () => {
  const { user, userRole, profile } = useAuth();
  const navigate = useNavigate();
  const { userId: routeUserId } = useParams<{ userId?: string }>();

  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const targetUserId = isAdmin && routeUserId ? routeUserId : user?.id;

  // Admins can pick any user
  const { data: usersList = [] } = useQuery({
    queryKey: ["activity-user-picker"],
    queryFn: async () => {
      if (!isAdmin) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      return data || [];
    },
    enabled: isAdmin,
  });

  // Resolve target profile + role for filter palette
  const { data: targetProfile } = useQuery({
    queryKey: ["activity-target-profile", targetUserId],
    queryFn: async () => {
      if (!targetUserId) return null;
      if (targetUserId === user?.id) {
        return { id: user.id, full_name: profile?.full_name ?? user.email ?? "You", email: profile?.email ?? user.email ?? "", role: userRole };
      }
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").eq("id", targetUserId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", targetUserId).maybeSingle(),
      ]);
      return p ? { ...p, role: r?.role ?? null } : null;
    },
    enabled: !!targetUserId,
  });

  const availableActions = useMemo(
    () => buildActionsForRole((targetProfile?.role as any) ?? userRole),
    [targetProfile?.role, userRole]
  );

  const [filters, setFilters] = useState<ActivityFilterState>({
    startDate: "",
    endDate: "",
    search: "",
    actionTypes: [],
  });
  const [page, setPage] = useState(0);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [filters, targetUserId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["user-activity", targetUserId, filters, page],
    enabled: !!targetUserId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_user_activity", {
        _user_id: targetUserId!,
        _start_date: filters.startDate ? new Date(filters.startDate).toISOString() : null,
        _end_date: filters.endDate ? new Date(new Date(filters.endDate).getTime() + 86400000).toISOString() : null,
        _action_types: filters.actionTypes.length > 0 ? filters.actionTypes : null,
        _entity_types: null,
        _search: filters.search || null,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      const rows = (data || []) as any[];
      const total = rows[0]?.total_count ?? 0;
      return { rows: rows as ActivityRow[], total: Number(total) };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Summary stats
  const { data: summary } = useQuery({
    queryKey: ["user-activity-summary", targetUserId],
    enabled: !!targetUserId,
    queryFn: async () => {
      const today = startOfDay(new Date()).toISOString();
      const [{ count: totalCount }, { count: todayCount }, { data: lastLogin }] = await Promise.all([
        supabase.from("user_activity_log").select("id", { count: "exact", head: true }).eq("user_id", targetUserId!),
        supabase.from("user_activity_log").select("id", { count: "exact", head: true }).eq("user_id", targetUserId!).gte("created_at", today),
        supabase.from("user_activity_log").select("created_at").eq("user_id", targetUserId!).eq("action_type", "login").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return {
        total: totalCount ?? 0,
        today: todayCount ?? 0,
        lastLogin: lastLogin?.created_at ?? null,
      };
    },
  });

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error("No rows to export");
      return;
    }
    const headers = ["When", "Action", "Entity", "Description", "Metadata"];
    const csvRows = rows.map(r => [
      format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
      r.action_type,
      r.entity_label ?? r.entity_type ?? "",
      (r.description ?? "").replace(/"/g, '""'),
      JSON.stringify(r.metadata ?? {}).replace(/"/g, '""'),
    ]);
    const csv = [headers, ...csvRows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity_${targetProfile?.full_name || "user"}_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Activity History
          </h1>
          <p className="text-sm text-muted-foreground">
            {targetProfile ? targetProfile.full_name : "Loading…"}
            {targetProfile?.role && (
              <span className="ml-2 text-xs uppercase">({targetProfile.role.replace(/_/g, " ")})</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Select
              value={targetUserId ?? ""}
              onValueChange={v => navigate(v === user?.id ? "/activity" : `/activity/${v}`)}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Select user…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={user?.id ?? "self"}>(My activity)</SelectItem>
                {usersList.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name} — {u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total Actions</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary?.total ?? "–"}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Today</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary?.today ?? "–"}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Last Login</CardTitle></CardHeader><CardContent className="text-sm font-medium">{summary?.lastLogin ? format(new Date(summary.lastLogin), "MMM d, yyyy HH:mm") : "—"}</CardContent></Card>
      </div>

      <ActivityFilters value={filters} onChange={setFilters} availableActions={availableActions} />

      <ActivityTimeline rows={rows} isLoading={isLoading} />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} • {total} total
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserActivity;