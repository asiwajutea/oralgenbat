import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { subWeeks, subDays } from "date-fns";
import { fetchAllRows } from "@/utils/paginatedFetch";

export type ChecklistPeriod = '1week' | '13weeks' | '1year' | 'lifetime';
export type ChecklistAuditType = 'first' | 'reaudit' | 'all';

export interface ChecklistQuestionStat {
  id: number;
  question: string;
  category: string;
  totalAnswered: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
}

export interface ChecklistAgentRanking {
  interviewer_code: string;
  totalQuestions: number;
  passed: number;
  failed: number;
  passPercentage: number;
}

export interface ChecklistSummary {
  totalQuestions: number;
  totalPassed: number;
  totalFailed: number;
  passPercentage: number;
}

interface ChecklistItem {
  id: number;
  question: string;
  answer: string;
  category: string;
}

function getDateCutoff(period: ChecklistPeriod): string | null {
  const now = new Date();
  switch (period) {
    case '1week': return subWeeks(now, 1).toISOString();
    case '13weeks': return subWeeks(now, 13).toISOString();
    case '1year': return subDays(now, 365).toISOString();
    case 'lifetime': return null;
  }
}

interface ChecklistScope {
  type: 'all' | 'contractor' | 'team_codes';
  contractorId?: string;
  teamCodes?: string[];
}

function useChecklistRawData(period: ChecklistPeriod, scope: ChecklistScope, auditType: ChecklistAuditType = 'all') {
  return useQuery({
    queryKey: ["checklist-raw-data", period, scope, auditType],
    queryFn: async () => {
      const dateCutoff = getDateCutoff(period);

      // Fetch all completed checklists
      const checklists = await fetchAllRows(
        "audit_checklist_progress",
        "audit_id, items, created_at",
        (q: any) => {
          let query = q.eq("is_completed", true);
          if (dateCutoff) {
            query = query.gte("created_at", dateCutoff);
          }
          return query;
        }
      );

      if (!checklists || checklists.length === 0) return [];

      // If we need auditType filtering or scope filtering, we need audit metadata
      const needsAuditData = auditType !== 'all' || scope.type !== 'all';

      if (!needsAuditData) return checklists;

      const auditIds = checklists.map((c: any) => c.audit_id);

      // Fetch audits for is_re_audit status
      const audits = await fetchAllRows(
        "audits",
        "id, is_re_audit",
      );
      const auditMap = new Map(audits.map((a: any) => [a.id, a]));

      // Filter by auditType
      let filtered = checklists;
      if (auditType !== 'all') {
        filtered = filtered.filter((c: any) => {
          const audit = auditMap.get(c.audit_id);
          if (!audit) return false;
          if (auditType === 'first') return !audit.is_re_audit;
          if (auditType === 'reaudit') return !!audit.is_re_audit;
          return true;
        });
      }

      // If scope is 'all', return filtered results
      if (scope.type === 'all') return filtered;

      // Fetch metadata for scoping
      const metadata = await fetchAllRows(
        "interview_metadata",
        "audit_id, interviewer_code, contractor_id",
      );

      const metaMap = new Map(metadata.map((m: any) => [m.audit_id, m]));

      // Filter by scope
      return filtered.filter((c: any) => {
        const meta = metaMap.get(c.audit_id);
        if (!meta) return false;

        if (scope.type === 'contractor') {
          return meta.contractor_id === scope.contractorId;
        }
        if (scope.type === 'team_codes' && scope.teamCodes) {
          return scope.teamCodes.includes(meta.interviewer_code);
        }
        return false;
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useChecklistSummary(period: ChecklistPeriod, scope: ChecklistScope, auditType: ChecklistAuditType = 'all') {
  const { data: rawData, isLoading } = useChecklistRawData(period, scope, auditType);

  const summary: ChecklistSummary = (() => {
    if (!rawData || rawData.length === 0) {
      return { totalQuestions: 0, totalPassed: 0, totalFailed: 0, passPercentage: 0 };
    }

    let totalPassed = 0;
    let totalFailed = 0;

    rawData.forEach((checklist: any) => {
      const items = checklist.items as ChecklistItem[];
      if (!Array.isArray(items)) return;
      items.forEach((item) => {
        if (item.answer === 'yes') totalPassed++;
        else if (item.answer === 'no') totalFailed++;
      });
    });

    const totalQuestions = totalPassed + totalFailed;
    const passPercentage = totalQuestions > 0 ? Math.round((totalPassed / totalQuestions) * 100) : 0;

    return { totalQuestions, totalPassed, totalFailed, passPercentage };
  })();

  return { data: summary, isLoading };
}

export function useChecklistQuestionStats(period: ChecklistPeriod, scope: ChecklistScope, auditType: ChecklistAuditType = 'all') {
  const { data: rawData, isLoading } = useChecklistRawData(period, scope, auditType);

  const stats: ChecklistQuestionStat[] = (() => {
    if (!rawData || rawData.length === 0) return [];

    const questionMap = new Map<number, ChecklistQuestionStat>();

    rawData.forEach((checklist: any) => {
      const items = checklist.items as ChecklistItem[];
      if (!Array.isArray(items)) return;
      items.forEach((item) => {
        if (!questionMap.has(item.id)) {
          questionMap.set(item.id, {
            id: item.id,
            question: item.question,
            category: item.category,
            totalAnswered: 0,
            passedCount: 0,
            failedCount: 0,
            passRate: 0,
          });
        }
        const stat = questionMap.get(item.id)!;
        stat.totalAnswered++;
        if (item.answer === 'yes') stat.passedCount++;
        else if (item.answer === 'no') stat.failedCount++;
      });
    });

    const result = Array.from(questionMap.values());
    result.forEach(s => {
      s.passRate = s.totalAnswered > 0 ? Math.round((s.passedCount / s.totalAnswered) * 100) : 0;
    });

    // Sort by failure rate (highest failures first)
    return result.sort((a, b) => b.failedCount - a.failedCount);
  })();

  return { data: stats, isLoading };
}

export function useChecklistAgentRanking(period: ChecklistPeriod, scope: ChecklistScope, auditType: ChecklistAuditType = 'all') {
  const { data: rawData, isLoading } = useChecklistRawData(period, scope, auditType);

  // Use a dedicated query that includes metadata joining
  const { data: agentRanking = [], isLoading: isRankingLoading } = useQuery({
    queryKey: ["checklist-agent-ranking", period, scope, auditType],
    queryFn: async () => {
      const dateCutoff = getDateCutoff(period);

      const checklists = await fetchAllRows(
        "audit_checklist_progress",
        "audit_id, items, created_at",
        (q: any) => {
          let query = q.eq("is_completed", true);
          if (dateCutoff) query = query.gte("created_at", dateCutoff);
          return query;
        }
      );

      if (!checklists || checklists.length === 0) return [];

      // Fetch audits for is_re_audit filtering
      const audits = await fetchAllRows("audits", "id, is_re_audit");
      const auditMap = new Map(audits.map((a: any) => [a.id, a]));

      const metadata = await fetchAllRows(
        "interview_metadata",
        "audit_id, interviewer_code, contractor_id"
      );

      const metaMap = new Map(metadata.map((m: any) => [m.audit_id, m]));

      const agentMap = new Map<string, { passed: number; failed: number }>();

      checklists.forEach((c: any) => {
        // Filter by auditType
        if (auditType !== 'all') {
          const audit = auditMap.get(c.audit_id);
          if (!audit) return;
          if (auditType === 'first' && audit.is_re_audit) return;
          if (auditType === 'reaudit' && !audit.is_re_audit) return;
        }

        const meta = metaMap.get(c.audit_id);
        if (!meta) return;

        // Apply scope filter
        if (scope.type === 'contractor' && meta.contractor_id !== scope.contractorId) return;
        if (scope.type === 'team_codes' && scope.teamCodes && !scope.teamCodes.includes(meta.interviewer_code)) return;

        const code = meta.interviewer_code;
        if (!agentMap.has(code)) {
          agentMap.set(code, { passed: 0, failed: 0 });
        }
        const agent = agentMap.get(code)!;
        const items = c.items as ChecklistItem[];
        if (!Array.isArray(items)) return;
        items.forEach((item) => {
          if (item.answer === 'yes') agent.passed++;
          else if (item.answer === 'no') agent.failed++;
        });
      });

      const result: ChecklistAgentRanking[] = Array.from(agentMap.entries()).map(([code, stats]) => ({
        interviewer_code: code,
        totalQuestions: stats.passed + stats.failed,
        passed: stats.passed,
        failed: stats.failed,
        passPercentage: (stats.passed + stats.failed) > 0 ? Math.round((stats.passed / (stats.passed + stats.failed)) * 100) : 0,
      }));

      return result.sort((a, b) => a.passPercentage - b.passPercentage);
    },
    staleTime: 5 * 60 * 1000,
  });

  return { data: agentRanking, isLoading: isLoading || isRankingLoading };
}

// Helper hook that determines scope based on current user role
export function useChecklistScope(): ChecklistScope {
  const { userRole, profile, user } = useAuth();

  const { data: scopeData } = useQuery({
    queryKey: ["checklist-scope", user?.id, userRole, profile?.active_contractor_id],
    queryFn: async (): Promise<ChecklistScope> => {
      if (!user?.id) return { type: 'all' };

      const effectiveContractorId = profile?.active_contractor_id || profile?.contractor_id;

      if (userRole === 'super_admin') return { type: 'all' };

      if (userRole === 'admin') {
        const { data: assignments } = await supabase
          .from("field_manager_admin_assignments")
          .select("field_manager_id")
          .eq("admin_id", user.id)
          .eq("is_active", true);

        const fmIds = assignments?.map(a => a.field_manager_id) || [];
        if (fmIds.length === 0) return { type: 'contractor', contractorId: effectiveContractorId || '' };

        const { data: teams } = await supabase
          .from("team_assignments")
          .select("interviewer_code")
          .in("field_manager_id", fmIds)
          .eq("status", "approved");

        return { type: 'team_codes', teamCodes: teams?.map(t => t.interviewer_code) || [] };
      }

      if (userRole === 'contractor') {
        return { type: 'contractor', contractorId: effectiveContractorId || '' };
      }

      if (userRole === 'sub_contractor') {
        const { data: assignments } = await supabase
          .from("field_manager_subcontractor_assignments")
          .select("field_manager_id")
          .eq("sub_contractor_id", user.id)
          .eq("is_active", true);

        const fmIds = assignments?.map(a => a.field_manager_id) || [];
        if (fmIds.length === 0) return { type: 'contractor', contractorId: effectiveContractorId || '' };

        const { data: teams } = await supabase
          .from("team_assignments")
          .select("interviewer_code")
          .in("field_manager_id", fmIds)
          .eq("status", "approved");

        return { type: 'team_codes', teamCodes: teams?.map(t => t.interviewer_code) || [] };
      }

      if (userRole === 'field_manager') {
        const { data: teams } = await supabase
          .from("team_assignments")
          .select("interviewer_code")
          .eq("field_manager_id", user.id)
          .eq("status", "approved");

        return { type: 'team_codes', teamCodes: teams?.map(t => t.interviewer_code) || [] };
      }

      return { type: 'all' };
    },
    enabled: !!user?.id,
    staleTime: Infinity,
  });

  return scopeData || { type: 'all' };
}
