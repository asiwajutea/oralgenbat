import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LockStatus {
  locked: boolean;
  reason: string | null;
  scope: string | null;
}

export interface LockScope {
  contractorId?: string | null;
  fieldManagerId?: string | null;
  interviewerCode?: string | null;
}

export function useUploadLockStatus(scope: LockScope = {}): LockStatus {
  const [status, setStatus] = useState<LockStatus>({ locked: false, reason: null, scope: null });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [{ data }, userResp] = await Promise.all([
        supabase.from("upload_lock_settings").select("scope_type, scope_id, locked, reason"),
        supabase.auth.getUser(),
      ]);
      if (cancelled) return;
      const rows = data || [];
      const userId = userResp.data.user?.id || null;

      // Check global lock first, taking exemptions into account
      const globalHit = rows.find((r: any) => r.scope_type === "global" && r.locked);
      if (globalHit && userId) {
        const { data: allowed } = await supabase.rpc("is_upload_allowed", { _user_id: userId });
        const row = Array.isArray(allowed) ? allowed[0] : allowed;
        if (row && row.allowed === false) {
          setStatus({ locked: true, reason: row.reason || globalHit.reason || "Uploads are globally locked.", scope: "global" });
          return;
        }
        // exempt from global — fall through to scoped checks
      } else if (globalHit) {
        setStatus({ locked: true, reason: globalHit.reason || "Uploads are globally locked.", scope: "global" });
        return;
      }

      const matches = (r: any) => {
        if (!r.locked) return false;
        if (r.scope_type === "contractor" && scope.contractorId && r.scope_id === scope.contractorId) return true;
        if (r.scope_type === "field_manager" && scope.fieldManagerId && r.scope_id === scope.fieldManagerId) return true;
        if (r.scope_type === "interviewer" && scope.interviewerCode && r.scope_id === scope.interviewerCode) return true;
        return false;
      };
      const hit = rows.find(matches);
      setStatus(hit
        ? { locked: true, reason: hit.reason || "Uploads are temporarily locked.", scope: hit.scope_type }
        : { locked: false, reason: null, scope: null });
    };
    load();
    const ch = supabase
      .channel("upload-lock-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "upload_lock_settings" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "upload_lock_exemptions" }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.contractorId, scope.fieldManagerId, scope.interviewerCode]);

  return status;
}