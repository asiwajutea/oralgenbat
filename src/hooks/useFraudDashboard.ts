import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subWeeks, subDays, parseISO, startOfWeek, format } from "date-fns";
import { useRoleScope, type RoleAnalyticsScope } from "./useRoleAnalytics";
import { buildFraudProfile, transformMetadataToInterviews, type AgentFraudProfile, type InterviewData } from "@/utils/fraudCalculations";
import { fetchAllRows } from "@/utils/paginatedFetch";

export type TimePeriod = '13weeks' | '365days' | 'lifetime';

const getDateCutoff = (period: TimePeriod): string | null => {
  if (period === '13weeks') return subWeeks(new Date(), 13).toISOString().split('T')[0];
  if (period === '365days') return subDays(new Date(), 365).toISOString().split('T')[0];
  return null; // lifetime
};

export const useFraudDashboard = (period: TimePeriod) => {
  const { data: scope, isLoading: scopeLoading } = useRoleScope();

  return useQuery({
    queryKey: ['fraud-dashboard', period, scope],
    queryFn: async (): Promise<AgentFraudProfile[]> => {
      if (!scope) return [];
      
      const dateCutoff = getDateCutoff(period);
      
      const selectStr = 'id, audit_id, interview_date, interview_time, total_names, family_story_duration, pedigree_segment_duration, interviewer_code, interviewer_name, contractor_id, audits!inner(file_name, status, is_re_audit)';
      
      const metadata = await fetchAllRows('interview_metadata', selectStr, (query: any) => {
        if (dateCutoff) {
          query = query.gte('interview_date', dateCutoff);
        }
        
        // Apply scope filtering
        if (!scope.isFullAccess) {
          if (scope.teamCodes.length > 0 && scope.teamCodes.length <= 200) {
            query = query.in('interviewer_code', scope.teamCodes);
          } else if (scope.contractorIds.length > 0) {
            query = query.in('contractor_id', scope.contractorIds);
          }
        }
        
        return query;
      });
      
      if (!metadata || metadata.length === 0) return [];
      
      // Filter by team codes client-side if needed
      let filteredMetadata = metadata;
      if (!scope.isFullAccess && scope.teamCodes.length > 200) {
        const codeSet = new Set(scope.teamCodes);
        filteredMetadata = metadata.filter(m => codeSet.has(m.interviewer_code));
      }
      
      // Group by interviewer_code
      const groups = new Map<string, any[]>();
      for (const m of filteredMetadata) {
        if (!groups.has(m.interviewer_code)) groups.set(m.interviewer_code, []);
        groups.get(m.interviewer_code)!.push(m);
      }
      
      // Build fraud profiles
      const profiles: AgentFraudProfile[] = [];
      for (const [code, items] of groups) {
        const interviews = transformMetadataToInterviews(items);
        if (interviews.length === 0) continue;
        
        const profile = buildFraudProfile(
          code,
          items[0].interviewer_name,
          items[0].contractor_id,
          interviews
        );
        profiles.push(profile);
      }
      
      return profiles.sort((a, b) => b.overallFraudScore - a.overallFraudScore);
    },
    enabled: !!scope && !scopeLoading,
    staleTime: 5 * 60 * 1000,
  });
};

export interface WeeklyAgentTrend {
  week: string;
  weekStart: Date;
  agents: Record<string, { passed: number; failed: number; total: number; passRate: number }>;
  teamPassRate: number;
  teamTotal: number;
  teamReAuditRate: number;
}

export const useFraudDashboardTrends = (
  profiles: AgentFraudProfile[] | undefined,
  periodWeeks: number
) => {
  return useQuery({
    queryKey: ['fraud-dashboard-trends', profiles?.length, periodWeeks],
    queryFn: (): WeeklyAgentTrend[] => {
      if (!profiles || profiles.length === 0) return [];
      
      // Collect all interviews from all profiles
      const allInterviews = profiles.flatMap(p => p.interviews);
      const weeks: WeeklyAgentTrend[] = [];
      const now = new Date();
      
      for (let i = periodWeeks - 1; i >= 0; i--) {
        const weekStart = startOfWeek(subWeeks(now, i));
        const weekEnd = startOfWeek(subWeeks(now, i - 1));
        
        const weekInterviews = allInterviews.filter(
          iv => iv.timestamp >= weekStart && iv.timestamp < weekEnd
        );
        
        const agents: Record<string, { passed: number; failed: number; total: number; passRate: number }> = {};
        
        for (const iv of weekInterviews) {
          if (!agents[iv.interviewer_code]) {
            agents[iv.interviewer_code] = { passed: 0, failed: 0, total: 0, passRate: 0 };
          }
          agents[iv.interviewer_code].total++;
          if (iv.status === 'Audit Passed') agents[iv.interviewer_code].passed++;
          if (iv.status === 'Audit Failed') agents[iv.interviewer_code].failed++;
        }
        
        // Calculate pass rates
        for (const code of Object.keys(agents)) {
          const a = agents[code];
          const reviewed = a.passed + a.failed;
          a.passRate = reviewed > 0 ? (a.passed / reviewed) * 100 : 0;
        }
        
        const teamTotal = weekInterviews.length;
        const teamPassed = weekInterviews.filter(i => i.status === 'Audit Passed').length;
        const teamReviewed = teamPassed + weekInterviews.filter(i => i.status === 'Audit Failed').length;
        const teamReAudits = weekInterviews.filter(i => i.is_re_audit).length;
        
        weeks.push({
          week: format(weekStart, 'MMM d'),
          weekStart,
          agents,
          teamPassRate: teamReviewed > 0 ? (teamPassed / teamReviewed) * 100 : 0,
          teamTotal,
          teamReAuditRate: teamTotal > 0 ? (teamReAudits / teamTotal) * 100 : 0,
        });
      }
      
      return weeks;
    },
    enabled: !!profiles && profiles.length > 0,
    staleTime: Infinity,
  });
};

export { useRoleScope };
