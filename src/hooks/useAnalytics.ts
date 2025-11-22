import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, subMonths, startOfDay, endOfDay, format, startOfWeek, startOfMonth } from "date-fns";

export interface AnalyticsFilters {
  dateRange: {
    start: Date;
    end: Date;
    preset: 'week' | 'month' | '3months' | 'custom';
  };
  contractors: string[];
  statuses: string[];
  interviewers: string[];
}

export interface AgentPerformance {
  interviewer_code: string;
  interviewer_name: string | null;
  contractor_id: string;
  total_interviews: number;
  passed: number;
  failed: number;
  pending: number;
  pass_rate: number;
  avg_names: number;
  avg_duration: number;
  avg_audio_quality: number;
  re_audit_rate: number;
  performance_score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  rank: number;
}

export interface AuditorPerformance {
  auditor_name: string;
  total_reviews: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_review_hours: number;
  reviews_this_week: number;
  reviews_this_month: number;
  efficiency_rating: string;
}

export interface ContractorPerformance {
  contractor_id: string;
  total_interviewers: number;
  total_interviews: number;
  overall_pass_rate: number;
  avg_quality_score: number;
  rank: number;
}

export interface SummaryStats {
  total_audits: number;
  pass_rate: number;
  avg_review_hours: number;
  pending_reviews: number;
  total_interviewers: number;
  re_audit_rate: number;
  trend_audits: number;
  trend_pass_rate: number;
  trend_review_time: number;
  trend_pending: number;
}

export interface TrendData {
  period: string;
  total: number;
  passed: number;
  failed: number;
  pending: number;
  awaiting_review: number;
  pass_rate: number;
}

const calculateGrade = (score: number): 'A' | 'B' | 'C' | 'D' | 'F' => {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
};

const calculatePerformanceScore = (
  passRate: number,
  avgAudioQuality: number,
  avgNames: number,
  reAuditRate: number
): number => {
  const passRateScore = passRate * 0.4;
  const audioScore = avgAudioQuality * 0.2;
  const namesScore = Math.min((avgNames / 200) * 100, 100) * 0.2;
  const completionScore = 100 * 0.1; // Assume 100% completion for now
  const reAuditPenalty = (100 - reAuditRate) * 0.1;
  
  return passRateScore + audioScore + namesScore + completionScore + reAuditPenalty;
};

export const useAnalyticsSummary = (filters: AnalyticsFilters) => {
  return useQuery({
    queryKey: ['analytics-summary', filters],
    queryFn: async (): Promise<SummaryStats> => {
      const { start, end } = filters.dateRange;
      
      let query = supabase
        .from('audits')
        .select('*, interview_metadata(*)', { count: 'exact' })
        .gte('uploaded_at', start.toISOString())
        .lte('uploaded_at', end.toISOString());

      if (filters.statuses.length > 0) {
        query = query.in('status', filters.statuses as any);
      }

      const { data: audits, count } = await query;

      // Calculate previous period for trends
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const prevStart = subDays(start, daysDiff);
      const prevEnd = start;

      const { data: prevAudits } = await supabase
        .from('audits')
        .select('*')
        .gte('uploaded_at', prevStart.toISOString())
        .lt('uploaded_at', prevEnd.toISOString());

      const totalAudits = count || 0;
      const passed = audits?.filter(a => a.status === 'Audit Passed').length || 0;
      const passRate = totalAudits > 0 ? (passed / totalAudits) * 100 : 0;
      const pending = audits?.filter(a => a.status === 'Pending' || a.status === 'Awaiting Review').length || 0;
      
      const reviewedAudits = audits?.filter(a => a.reviewed_at) || [];
      const avgReviewHours = reviewedAudits.length > 0
        ? reviewedAudits.reduce((sum, a) => {
            const hours = (new Date(a.reviewed_at!).getTime() - new Date(a.uploaded_at).getTime()) / (1000 * 60 * 60);
            return sum + hours;
          }, 0) / reviewedAudits.length
        : 0;

      const uniqueInterviewers = new Set(
        audits?.map(a => a.interview_metadata?.[0]?.interviewer_code).filter(Boolean)
      ).size;

      const reAudits = audits?.filter(a => a.is_re_audit).length || 0;
      const reAuditRate = totalAudits > 0 ? (reAudits / totalAudits) * 100 : 0;

      // Calculate trends
      const prevTotal = prevAudits?.length || 0;
      const prevPassed = prevAudits?.filter(a => a.status === 'Audit Passed').length || 0;
      const prevPassRate = prevTotal > 0 ? (prevPassed / prevTotal) * 100 : 0;

      return {
        total_audits: totalAudits,
        pass_rate: passRate,
        avg_review_hours: avgReviewHours,
        pending_reviews: pending,
        total_interviewers: uniqueInterviewers,
        re_audit_rate: reAuditRate,
        trend_audits: prevTotal > 0 ? ((totalAudits - prevTotal) / prevTotal) * 100 : 0,
        trend_pass_rate: prevPassRate > 0 ? passRate - prevPassRate : 0,
        trend_review_time: 0,
        trend_pending: 0,
      };
    },
  });
};

export const useAgentPerformance = (filters: AnalyticsFilters) => {
  return useQuery({
    queryKey: ['agent-performance', filters],
    queryFn: async (): Promise<AgentPerformance[]> => {
      const { start, end } = filters.dateRange;

      let query = supabase
        .from('interview_metadata')
        .select('*, audits!inner(*)')
        .gte('audits.uploaded_at', start.toISOString())
        .lte('audits.uploaded_at', end.toISOString());

      if (filters.contractors.length > 0) {
        query = query.in('contractor_id', filters.contractors);
      }

      if (filters.interviewers.length > 0) {
        query = query.in('interviewer_code', filters.interviewers);
      }

      const { data } = await query;

      if (!data) return [];

      // Group by interviewer
      const grouped = data.reduce((acc, item) => {
        const key = item.interviewer_code;
        if (!acc[key]) {
          acc[key] = {
            interviewer_code: item.interviewer_code,
            interviewer_name: item.interviewer_name,
            contractor_id: item.contractor_id,
            audits: [],
            names: [],
            durations: [],
            noise_levels: [],
            silence_levels: [],
          };
        }
        acc[key].audits.push(item.audits);
        if (item.total_names) acc[key].names.push(item.total_names);
        if (item.family_story_duration) acc[key].durations.push(item.family_story_duration);
        if (item.family_story_noise_level) acc[key].noise_levels.push(item.family_story_noise_level);
        if (item.family_story_silence_level) acc[key].silence_levels.push(item.family_story_silence_level);
        return acc;
      }, {} as any);

      const agentStats: AgentPerformance[] = Object.values(grouped).map((agent: any) => {
        const total = agent.audits.length;
        const passed = agent.audits.filter((a: any) => a.status === 'Audit Passed').length;
        const failed = agent.audits.filter((a: any) => a.status === 'Audit Failed').length;
        const pending = agent.audits.filter((a: any) => a.status === 'Pending' || a.status === 'Awaiting Review').length;
        const reAudits = agent.audits.filter((a: any) => a.is_re_audit).length;
        
        const passRate = total > 0 ? (passed / total) * 100 : 0;
        const reAuditRate = total > 0 ? (reAudits / total) * 100 : 0;
        
        const avgNames = agent.names.length > 0
          ? agent.names.reduce((sum: number, n: number) => sum + n, 0) / agent.names.length
          : 0;
        
        const avgDuration = agent.durations.length > 0
          ? agent.durations.reduce((sum: number, d: number) => sum + d, 0) / agent.durations.length
          : 0;
        
        const avgNoise = agent.noise_levels.length > 0
          ? agent.noise_levels.reduce((sum: number, n: number) => sum + n, 0) / agent.noise_levels.length
          : 0;
        
        const avgSilence = agent.silence_levels.length > 0
          ? agent.silence_levels.reduce((sum: number, s: number) => sum + s, 0) / agent.silence_levels.length
          : 0;
        
        const avgAudioQuality = 100 - ((avgNoise + avgSilence) / 2);
        
        const performanceScore = calculatePerformanceScore(
          passRate,
          avgAudioQuality,
          avgNames,
          reAuditRate
        );
        
        return {
          interviewer_code: agent.interviewer_code,
          interviewer_name: agent.interviewer_name,
          contractor_id: agent.contractor_id,
          total_interviews: total,
          passed,
          failed,
          pending,
          pass_rate: passRate,
          avg_names: avgNames,
          avg_duration: avgDuration / 60, // Convert to minutes
          avg_audio_quality: avgAudioQuality,
          re_audit_rate: reAuditRate,
          performance_score: performanceScore,
          grade: calculateGrade(performanceScore),
          rank: 0, // Will be assigned after sorting
        };
      });

      // Sort by performance score and assign ranks
      agentStats.sort((a, b) => b.performance_score - a.performance_score);
      agentStats.forEach((agent, index) => {
        agent.rank = index + 1;
      });

      return agentStats;
    },
  });
};

export const useAuditorPerformance = (filters: AnalyticsFilters) => {
  return useQuery({
    queryKey: ['auditor-performance', filters],
    queryFn: async (): Promise<AuditorPerformance[]> => {
      const { start, end } = filters.dateRange;

      const { data: audits } = await supabase
        .from('audits')
        .select('*')
        .not('reviewed_by', 'is', null)
        .gte('reviewed_at', start.toISOString())
        .lte('reviewed_at', end.toISOString());

      if (!audits || audits.length === 0) return [];

      // Group by auditor
      const grouped = audits.reduce((acc, audit) => {
        const key = audit.reviewed_by!;
        if (!acc[key]) {
          acc[key] = {
            auditor_name: key,
            audits: [],
            this_week: 0,
            this_month: 0,
          };
        }
        acc[key].audits.push(audit);
        
        const reviewDate = new Date(audit.reviewed_at!);
        const now = new Date();
        if (reviewDate >= startOfWeek(now)) acc[key].this_week++;
        if (reviewDate >= startOfMonth(now)) acc[key].this_month++;
        
        return acc;
      }, {} as any);

      const auditorStats: AuditorPerformance[] = Object.values(grouped).map((auditor: any) => {
        const total = auditor.audits.length;
        const passed = auditor.audits.filter((a: any) => a.status === 'Audit Passed').length;
        const failed = auditor.audits.filter((a: any) => a.status === 'Audit Failed').length;
        const passRate = total > 0 ? (passed / total) * 100 : 0;
        
        const avgReviewHours = auditor.audits.reduce((sum: number, a: any) => {
          const hours = (new Date(a.reviewed_at).getTime() - new Date(a.uploaded_at).getTime()) / (1000 * 60 * 60);
          return sum + hours;
        }, 0) / total;

        const efficiencyRating = avgReviewHours < 6 ? 'Excellent' : avgReviewHours < 12 ? 'Good' : avgReviewHours < 24 ? 'Fair' : 'Slow';

        return {
          auditor_name: auditor.auditor_name,
          total_reviews: total,
          passed,
          failed,
          pass_rate: passRate,
          avg_review_hours: avgReviewHours,
          reviews_this_week: auditor.this_week,
          reviews_this_month: auditor.this_month,
          efficiency_rating: efficiencyRating,
        };
      });

      return auditorStats.sort((a, b) => b.total_reviews - a.total_reviews);
    },
  });
};

export const useContractorPerformance = (filters: AnalyticsFilters) => {
  return useQuery({
    queryKey: ['contractor-performance', filters],
    queryFn: async (): Promise<ContractorPerformance[]> => {
      const { start, end } = filters.dateRange;

      const { data } = await supabase
        .from('interview_metadata')
        .select('*, audits!inner(*)')
        .gte('audits.uploaded_at', start.toISOString())
        .lte('audits.uploaded_at', end.toISOString());

      if (!data) return [];

      // Group by contractor
      const grouped = data.reduce((acc, item) => {
        const key = item.contractor_id;
        if (!acc[key]) {
          acc[key] = {
            contractor_id: key,
            interviewers: new Set(),
            audits: [],
            quality_scores: [],
          };
        }
        acc[key].interviewers.add(item.interviewer_code);
        acc[key].audits.push(item.audits);
        
        if (item.family_story_noise_level && item.family_story_silence_level) {
          const quality = 100 - ((item.family_story_noise_level + item.family_story_silence_level) / 2);
          acc[key].quality_scores.push(quality);
        }
        
        return acc;
      }, {} as any);

      const contractorStats: ContractorPerformance[] = Object.values(grouped).map((contractor: any) => {
        const total = contractor.audits.length;
        const passed = contractor.audits.filter((a: any) => a.status === 'Audit Passed').length;
        const passRate = total > 0 ? (passed / total) * 100 : 0;
        
        const avgQuality = contractor.quality_scores.length > 0
          ? contractor.quality_scores.reduce((sum: number, q: number) => sum + q, 0) / contractor.quality_scores.length
          : 0;

        return {
          contractor_id: contractor.contractor_id,
          total_interviewers: contractor.interviewers.size,
          total_interviews: total,
          overall_pass_rate: passRate,
          avg_quality_score: avgQuality,
          rank: 0,
        };
      });

      contractorStats.sort((a, b) => b.overall_pass_rate - a.overall_pass_rate);
      contractorStats.forEach((contractor, index) => {
        contractor.rank = index + 1;
      });

      return contractorStats;
    },
  });
};

export const useTrendData = (filters: AnalyticsFilters, period: 'week' | 'month') => {
  return useQuery({
    queryKey: ['trend-data', filters, period],
    queryFn: async (): Promise<TrendData[]> => {
      const { start, end } = filters.dateRange;

      const { data: audits } = await supabase
        .from('audits')
        .select('*')
        .gte('uploaded_at', start.toISOString())
        .lte('uploaded_at', end.toISOString())
        .order('uploaded_at', { ascending: true });

      if (!audits) return [];

      // Group by period
      const grouped = audits.reduce((acc, audit) => {
        const date = new Date(audit.uploaded_at);
        const key = period === 'week'
          ? format(startOfWeek(date), 'MMM dd, yyyy')
          : format(startOfMonth(date), 'MMM yyyy');

        if (!acc[key]) {
          acc[key] = {
            period: key,
            total: 0,
            passed: 0,
            failed: 0,
            pending: 0,
            awaiting_review: 0,
            pass_rate: 0,
          };
        }

        acc[key].total++;
        if (audit.status === 'Audit Passed') acc[key].passed++;
        if (audit.status === 'Audit Failed') acc[key].failed++;
        if (audit.status === 'Pending') acc[key].pending++;
        if (audit.status === 'Awaiting Review') acc[key].awaiting_review++;

        return acc;
      }, {} as any);

      const trendData: TrendData[] = Object.values(grouped).map((trend: any) => ({
        ...trend,
        pass_rate: trend.total > 0 ? (trend.passed / trend.total) * 100 : 0,
      }));

      return trendData;
    },
  });
};

export const getDefaultFilters = (): AnalyticsFilters => ({
  dateRange: {
    start: startOfDay(subMonths(new Date(), 1)),
    end: endOfDay(new Date()),
    preset: 'month',
  },
  contractors: [],
  statuses: [],
  interviewers: [],
});
