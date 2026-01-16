import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfWeek, subWeeks, format } from "date-fns";

type AppRole = 'field_manager' | 'auditor' | 'contractor' | 'admin' | 'super_admin' | 'data_entry_clerk' | 'quality_assurance_manager' | 'sub_contractor';

export interface RoleAnalyticsScope {
  contractorIds: string[];
  fieldManagerIds: string[];
  teamCodes: string[];
  isFullAccess: boolean;
  scopeType: 'super_admin' | 'admin' | 'contractor' | 'sub_contractor' | 'field_manager' | 'auditor' | 'qa_manager' | 'data_entry';
}

export interface RoleSummaryStats {
  totalInterviews: number;
  passedCount: number;
  failedCount: number;
  pendingCount: number;
  reAuditCount: number;
  passRate: number;
  reAuditRate: number;
}

export interface WeeklyTrend {
  week: string;
  passed: number;
  failed: number;
  total: number;
  passRate: number;
}

export interface ScopedAgent {
  interviewer_code: string;
  interviewer_name: string | null;
  contractor_id: string;
  totalInterviews: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
  fraudGrade: 'A' | 'B' | 'C' | 'D';
  overallFraudScore: number;
}

// Calculate fraud grade from score
const calculateFraudGrade = (score: number): 'A' | 'B' | 'C' | 'D' => {
  if (score < 25) return 'A';
  if (score < 50) return 'B';
  if (score < 75) return 'C';
  return 'D';
};

// Calculate simplified fraud score based on patterns
const calculateSimpleFraudScore = (
  passRate: number,
  totalInterviews: number,
  reAuditRate: number
): number => {
  let score = 0;
  
  // Low pass rate indicator
  if (passRate < 70) score += 20;
  else if (passRate < 80) score += 10;
  
  // High re-audit rate
  if (reAuditRate > 20) score += 25;
  else if (reAuditRate > 10) score += 15;
  
  // Very few interviews (suspicious if too low)
  if (totalInterviews < 5) score += 10;
  
  return Math.min(score, 100);
};

export const useRoleScope = () => {
  const { user, profile } = useAuth();

  // Fetch user role
  const { data: userRole } = useQuery({
    queryKey: ["user-role-for-analytics", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      return data?.role as AppRole | null;
    },
    enabled: !!user?.id,
    staleTime: Infinity,
  });

  return useQuery({
    queryKey: ["role-scope", user?.id, userRole, profile?.active_contractor_id],
    queryFn: async (): Promise<RoleAnalyticsScope> => {
      if (!user?.id) {
        return {
          contractorIds: [],
          fieldManagerIds: [],
          teamCodes: [],
          isFullAccess: false,
          scopeType: 'data_entry'
        };
      }

      const effectiveContractorId = profile?.active_contractor_id || profile?.contractor_id;

      // Super Admin - full access
      if (userRole === 'super_admin') {
        return {
          contractorIds: [],
          fieldManagerIds: [],
          teamCodes: [],
          isFullAccess: true,
          scopeType: 'super_admin'
        };
      }

      // Admin - assigned FMs via field_manager_admin_assignments
      if (userRole === 'admin') {
        const { data: assignments } = await supabase
          .from("field_manager_admin_assignments")
          .select("field_manager_id")
          .eq("admin_id", user.id)
          .eq("is_active", true);

        const fmIds = assignments?.map(a => a.field_manager_id) || [];
        
        // Get team codes for these FMs
        const { data: teams } = await supabase
          .from("team_assignments")
          .select("interviewer_code")
          .in("field_manager_id", fmIds)
          .eq("status", "approved");

        return {
          contractorIds: effectiveContractorId ? [effectiveContractorId] : [],
          fieldManagerIds: fmIds,
          teamCodes: teams?.map(t => t.interviewer_code) || [],
          isFullAccess: false,
          scopeType: 'admin'
        };
      }

      // Sub-Contractor - assigned FMs via field_manager_subcontractor_assignments
      if (userRole === 'sub_contractor') {
        const { data: assignments } = await supabase
          .from("field_manager_subcontractor_assignments")
          .select("field_manager_id")
          .eq("sub_contractor_id", user.id)
          .eq("is_active", true);

        const fmIds = assignments?.map(a => a.field_manager_id) || [];

        const { data: teams } = await supabase
          .from("team_assignments")
          .select("interviewer_code")
          .in("field_manager_id", fmIds)
          .eq("status", "approved");

        return {
          contractorIds: effectiveContractorId ? [effectiveContractorId] : [],
          fieldManagerIds: fmIds,
          teamCodes: teams?.map(t => t.interviewer_code) || [],
          isFullAccess: false,
          scopeType: 'sub_contractor'
        };
      }

      // Contractor - all for their contractor_id
      if (userRole === 'contractor') {
        const { data: teams } = await supabase
          .from("team_assignments")
          .select("interviewer_code, field_manager_id")
          .eq("contractor_id", effectiveContractorId || '')
          .eq("status", "approved");

        const fmIds = [...new Set(teams?.map(t => t.field_manager_id) || [])];

        return {
          contractorIds: effectiveContractorId ? [effectiveContractorId] : [],
          fieldManagerIds: fmIds,
          teamCodes: teams?.map(t => t.interviewer_code) || [],
          isFullAccess: false,
          scopeType: 'contractor'
        };
      }

      // Field Manager - their team only
      if (userRole === 'field_manager') {
        const { data: teams } = await supabase
          .from("team_assignments")
          .select("interviewer_code")
          .eq("field_manager_id", user.id)
          .eq("status", "approved");

        return {
          contractorIds: effectiveContractorId ? [effectiveContractorId] : [],
          fieldManagerIds: [user.id],
          teamCodes: teams?.map(t => t.interviewer_code) || [],
          isFullAccess: false,
          scopeType: 'field_manager'
        };
      }

      // Auditor - personal stats only
      if (userRole === 'auditor') {
        return {
          contractorIds: effectiveContractorId ? [effectiveContractorId] : [],
          fieldManagerIds: [],
          teamCodes: [],
          isFullAccess: false,
          scopeType: 'auditor'
        };
      }

      // QA Manager
      if (userRole === 'quality_assurance_manager') {
        return {
          contractorIds: effectiveContractorId ? [effectiveContractorId] : [],
          fieldManagerIds: [],
          teamCodes: [],
          isFullAccess: false,
          scopeType: 'qa_manager'
        };
      }

      // Default - data entry or unknown
      return {
        contractorIds: [],
        fieldManagerIds: [],
        teamCodes: [],
        isFullAccess: false,
        scopeType: 'data_entry'
      };
    },
    enabled: !!user?.id && userRole !== undefined,
    staleTime: Infinity,
  });
};

export const useRoleSummaryStats = (scope: RoleAnalyticsScope | undefined) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["role-summary-stats", scope, user?.id],
    queryFn: async (): Promise<RoleSummaryStats> => {
      if (!scope) {
        return { totalInterviews: 0, passedCount: 0, failedCount: 0, pendingCount: 0, reAuditCount: 0, passRate: 0, reAuditRate: 0 };
      }

      // Special handling for data_entry scope - query interview_assignments
      if (scope.scopeType === 'data_entry' && user?.id) {
        // Get all assignments completed by this user
        const { data: completedAssignments } = await supabase
          .from("interview_assignments")
          .select("id, audit_id, entry_status, entry_completed_at")
          .eq("entry_completed_by", user.id);

        // Get in-progress assignments (any that aren't completed)
        const { data: inProgressAssignments } = await supabase
          .from("interview_assignments")
          .select("id")
          .neq("entry_status", "data_entry_complete")
          .limit(100);

        const completedCount = completedAssignments?.filter(a => a.entry_status === "data_entry_complete").length || 0;
        const totalProcessed = completedAssignments?.length || 0;
        const pendingCount = inProgressAssignments?.length || 0;
        const completionRate = totalProcessed > 0 ? (completedCount / totalProcessed) * 100 : 0;

        return {
          totalInterviews: totalProcessed,
          passedCount: completedCount,
          failedCount: 0,
          pendingCount: pendingCount,
          reAuditCount: 0,
          passRate: completionRate,
          reAuditRate: 0
        };
      }

      // For sub_contractor scope, fetch ALL audits and filter by contractor from file_name
      // This ensures we include interviews without metadata
      if (scope.scopeType === 'sub_contractor' && scope.contractorIds.length > 0) {
        const { data: allAudits } = await supabase
          .from("audits")
          .select("id, status, is_re_audit, reviewed_by, file_name");

        const contractorId = scope.contractorIds[0];
        const filteredAudits = (allAudits || []).filter(a => {
          // Extract contractor_id from file_name (format: NG71_711_20251208_0937)
          const fileNameParts = a.file_name?.split('_') || [];
          return fileNameParts[0] === contractorId;
        });

        const totalInterviews = filteredAudits.length;
        const passedCount = filteredAudits.filter(a => a.status === 'Audit Passed').length;
        const failedCount = filteredAudits.filter(a => a.status === 'Audit Failed').length;
        const pendingCount = filteredAudits.filter(a => a.status === 'Pending' || a.status === 'Awaiting Review').length;
        const reAuditCount = filteredAudits.filter(a => a.is_re_audit).length;
        const reviewedCount = passedCount + failedCount;
        const passRate = reviewedCount > 0 ? (passedCount / reviewedCount) * 100 : 0;
        const reAuditRate = totalInterviews > 0 ? (reAuditCount / totalInterviews) * 100 : 0;

        return { totalInterviews, passedCount, failedCount, pendingCount, reAuditCount, passRate, reAuditRate };
      }

      let query = supabase
        .from("audits")
        .select("id, status, is_re_audit, reviewed_by");

      // For auditors, filter by their reviews
      if (scope.scopeType === 'auditor' && user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();

        if (profile?.full_name) {
          query = query.eq("reviewed_by", profile.full_name);
        }
      } else if (!scope.isFullAccess && scope.teamCodes.length > 0) {
        // Get audit IDs for team codes
        const { data: metadata } = await supabase
          .from("interview_metadata")
          .select("audit_id")
          .in("interviewer_code", scope.teamCodes);

        const auditIds = metadata?.map(m => m.audit_id).filter(Boolean) || [];
        
        if (auditIds.length === 0) {
          return { totalInterviews: 0, passedCount: 0, failedCount: 0, pendingCount: 0, reAuditCount: 0, passRate: 0, reAuditRate: 0 };
        }

        query = query.in("id", auditIds as string[]);
      } else if (!scope.isFullAccess && scope.contractorIds.length > 0) {
        const { data: metadata } = await supabase
          .from("interview_metadata")
          .select("audit_id")
          .in("contractor_id", scope.contractorIds);

        const auditIds = metadata?.map(m => m.audit_id).filter(Boolean) || [];
        
        if (auditIds.length === 0) {
          return { totalInterviews: 0, passedCount: 0, failedCount: 0, pendingCount: 0, reAuditCount: 0, passRate: 0, reAuditRate: 0 };
        }

        query = query.in("id", auditIds as string[]);
      }

      const { data: audits } = await query;

      if (!audits) {
        return { totalInterviews: 0, passedCount: 0, failedCount: 0, pendingCount: 0, reAuditCount: 0, passRate: 0, reAuditRate: 0 };
      }

      const totalInterviews = audits.length;
      const passedCount = audits.filter(a => a.status === 'Audit Passed').length;
      const failedCount = audits.filter(a => a.status === 'Audit Failed').length;
      const pendingCount = audits.filter(a => a.status === 'Pending' || a.status === 'Awaiting Review').length;
      const reAuditCount = audits.filter(a => a.is_re_audit).length;
      const reviewedCount = passedCount + failedCount;
      const passRate = reviewedCount > 0 ? (passedCount / reviewedCount) * 100 : 0;
      const reAuditRate = totalInterviews > 0 ? (reAuditCount / totalInterviews) * 100 : 0;

      return { totalInterviews, passedCount, failedCount, pendingCount, reAuditCount, passRate, reAuditRate };
    },
    enabled: !!scope,
    staleTime: Infinity,
  });
};

export const useRoleWeeklyTrends = (scope: RoleAnalyticsScope | undefined) => {
  return useQuery({
    queryKey: ["role-weekly-trends", scope],
    queryFn: async (): Promise<WeeklyTrend[]> => {
      if (!scope) return [];

      const weeks: WeeklyTrend[] = [];
      const now = new Date();

      // For sub_contractor, use file_name based filtering
      if (scope.scopeType === 'sub_contractor' && scope.contractorIds.length > 0) {
        const contractorId = scope.contractorIds[0];
        
        for (let i = 7; i >= 0; i--) {
          const weekStart = startOfWeek(subWeeks(now, i));
          const weekEnd = startOfWeek(subWeeks(now, i - 1));

          const { data: allAudits } = await supabase
            .from("audits")
            .select("id, status, reviewed_at, file_name")
            .gte("reviewed_at", weekStart.toISOString())
            .lt("reviewed_at", weekEnd.toISOString())
            .in("status", ['Audit Passed', 'Audit Failed']);

          const filteredAudits = (allAudits || []).filter(a => {
            const fileNameParts = a.file_name?.split('_') || [];
            return fileNameParts[0] === contractorId;
          });

          const passed = filteredAudits.filter(a => a.status === 'Audit Passed').length;
          const failed = filteredAudits.filter(a => a.status === 'Audit Failed').length;
          const total = passed + failed;

          weeks.push({
            week: format(weekStart, 'MMM d'),
            passed,
            failed,
            total,
            passRate: total > 0 ? (passed / total) * 100 : 0
          });
        }
        return weeks;
      }

      for (let i = 7; i >= 0; i--) {
        const weekStart = startOfWeek(subWeeks(now, i));
        const weekEnd = startOfWeek(subWeeks(now, i - 1));

        let query = supabase
          .from("audits")
          .select("id, status, reviewed_at")
          .gte("reviewed_at", weekStart.toISOString())
          .lt("reviewed_at", weekEnd.toISOString())
          .in("status", ['Audit Passed', 'Audit Failed']);

        if (!scope.isFullAccess && scope.teamCodes.length > 0) {
          const { data: metadata } = await supabase
            .from("interview_metadata")
            .select("audit_id")
            .in("interviewer_code", scope.teamCodes);

          const auditIds = metadata?.map(m => m.audit_id).filter(Boolean) || [];
          if (auditIds.length > 0) {
            query = query.in("id", auditIds as string[]);
          }
        } else if (!scope.isFullAccess && scope.contractorIds.length > 0) {
          const { data: metadata } = await supabase
            .from("interview_metadata")
            .select("audit_id")
            .in("contractor_id", scope.contractorIds);

          const auditIds = metadata?.map(m => m.audit_id).filter(Boolean) || [];
          if (auditIds.length > 0) {
            query = query.in("id", auditIds as string[]);
          }
        }

        const { data: audits } = await query;

        const passed = audits?.filter(a => a.status === 'Audit Passed').length || 0;
        const failed = audits?.filter(a => a.status === 'Audit Failed').length || 0;
        const total = passed + failed;

        weeks.push({
          week: format(weekStart, 'MMM d'),
          passed,
          failed,
          total,
          passRate: total > 0 ? (passed / total) * 100 : 0
        });
      }

      return weeks;
    },
    enabled: !!scope,
    staleTime: Infinity,
  });
};

export const useRoleScopedAgents = (scope: RoleAnalyticsScope | undefined) => {
  return useQuery({
    queryKey: ["role-scoped-agents", scope],
    queryFn: async (): Promise<ScopedAgent[]> => {
      if (!scope || scope.scopeType === 'auditor' || scope.scopeType === 'qa_manager' || scope.scopeType === 'data_entry') {
        return [];
      }

      let metadataQuery = supabase
        .from("interview_metadata")
        .select("interviewer_code, interviewer_name, contractor_id, audit_id");

      if (!scope.isFullAccess && scope.teamCodes.length > 0) {
        metadataQuery = metadataQuery.in("interviewer_code", scope.teamCodes);
      } else if (!scope.isFullAccess && scope.contractorIds.length > 0) {
        metadataQuery = metadataQuery.in("contractor_id", scope.contractorIds);
      }

      const { data: metadata } = await metadataQuery;
      if (!metadata || metadata.length === 0) return [];

      const auditIds = metadata.map(m => m.audit_id).filter(Boolean);
      
      const { data: audits } = await supabase
        .from("audits")
        .select("id, status, is_re_audit")
        .in("id", auditIds as string[]);

      const auditMap = new Map(audits?.map(a => [a.id, a]) || []);

      // Group by interviewer_code
      const agentMap = new Map<string, {
        interviewer_name: string | null;
        contractor_id: string;
        interviews: { status: string; is_re_audit: boolean }[];
      }>();

      for (const m of metadata) {
        const audit = auditMap.get(m.audit_id);
        if (!audit) continue;

        if (!agentMap.has(m.interviewer_code)) {
          agentMap.set(m.interviewer_code, {
            interviewer_name: m.interviewer_name,
            contractor_id: m.contractor_id,
            interviews: []
          });
        }

        agentMap.get(m.interviewer_code)!.interviews.push({
          status: audit.status,
          is_re_audit: audit.is_re_audit || false
        });
      }

      const agents: ScopedAgent[] = [];

      for (const [code, data] of agentMap) {
        const totalInterviews = data.interviews.length;
        const passedCount = data.interviews.filter(i => i.status === 'Audit Passed').length;
        const failedCount = data.interviews.filter(i => i.status === 'Audit Failed').length;
        const reAuditCount = data.interviews.filter(i => i.is_re_audit).length;
        const reviewedCount = passedCount + failedCount;
        const passRate = reviewedCount > 0 ? (passedCount / reviewedCount) * 100 : 0;
        const reAuditRate = totalInterviews > 0 ? (reAuditCount / totalInterviews) * 100 : 0;

        const fraudScore = calculateSimpleFraudScore(passRate, totalInterviews, reAuditRate);

        agents.push({
          interviewer_code: code,
          interviewer_name: data.interviewer_name,
          contractor_id: data.contractor_id,
          totalInterviews,
          passedCount,
          failedCount,
          passRate,
          fraudGrade: calculateFraudGrade(fraudScore),
          overallFraudScore: fraudScore
        });
      }

      // Sort by fraud score descending
      return agents.sort((a, b) => b.overallFraudScore - a.overallFraudScore);
    },
    enabled: !!scope && scope.scopeType !== 'auditor' && scope.scopeType !== 'qa_manager' && scope.scopeType !== 'data_entry',
    staleTime: Infinity,
  });
};

export const useRoleCriticalAgents = (scope: RoleAnalyticsScope | undefined) => {
  const { data: allAgents = [] } = useRoleScopedAgents(scope);

  return allAgents.filter(agent => agent.fraudGrade === 'C' || agent.fraudGrade === 'D');
};
