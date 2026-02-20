import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subWeeks, subDays, parseISO } from "date-fns";

export type TimePeriod = '13weeks' | '365days' | 'lifetime';

export interface InterviewData {
  id: string;
  audit_id: string;
  file_name: string;
  interview_date: string;
  interview_time: string;
  total_names: number | null;
  family_story_duration: number | null;
  pedigree_segment_duration: number | null;
  interviewer_code: string;
  status: string;
  timestamp: Date;
}

export interface FraudIndicators {
  // Interview Interval Analysis
  closeIntervals: { interview1: string; interview2: string; fileName1: string; fileName2: string; minutesApart: number; date1: Date; date2: Date; totalNames1?: number | null; totalNames2?: number | null }[];
  intervalFraudScore: number;
  
  // Audio Duration Analysis
  shortFamilyStories: { interviewId: string; duration: number; date: Date }[];
  shortPedigrees: { interviewId: string; duration: number; date: Date }[];
  audioDurationFraudScore: number;
  
  // Total Names Pattern Analysis
  namesPattern: number[];
  repeatedNamesCount: number;
  namesPatternFraudScore: number;
  mostCommonCount: number | null;
  mostCommonFrequency: number;
  
  // Page Boundary Analysis
  boundaryHits: number;
  totalInterviews: number;
  expectedBoundaryRate: number;
  actualBoundaryRate: number;
  pageBoundaryFraudScore: number;
  neverHitsBoundaries: boolean;
  alwaysHitsBoundaries: boolean;
  
  // Overall Statistics Anomalies
  passRate: number;
  avgAudioQuality: number;
  reAuditRate: number;
  anomalyScore: number;
}

export interface AgentFraudProfile {
  interviewer_code: string;
  interviewer_name: string | null;
  contractor_id: string;
  total_interviews: number;
  
  // Fraud Analysis
  indicators: FraudIndicators;
  overallFraudScore: number;
  fraudGrade: 'A' | 'B' | 'C' | 'D';
  classification: 'Safe' | 'Caution' | 'High Risk' | 'Fire Immediately';
  
  // Raw data for charts
  interviews: InterviewData[];
}

const PAGE_BOUNDARIES = [24, 50, 76, 102, 128, 154, 180, 206, 232, 258, 284, 310];

const calculateIntervalFraudScore = (interviews: InterviewData[]): {
  closeIntervals: FraudIndicators['closeIntervals'];
  score: number;
} => {
  const sorted = [...interviews].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const closeIntervals: FraudIndicators['closeIntervals'] = [];
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = (sorted[i + 1].timestamp.getTime() - sorted[i].timestamp.getTime()) / (1000 * 60);
    if (diff < 45) {
      closeIntervals.push({
        interview1: sorted[i].id,
        interview2: sorted[i + 1].id,
        fileName1: sorted[i].file_name,
        fileName2: sorted[i + 1].file_name,
        minutesApart: diff,
        date1: sorted[i].timestamp,
        date2: sorted[i + 1].timestamp,
        totalNames1: sorted[i].total_names,
        totalNames2: sorted[i + 1].total_names,
      });
    }
  }
  
  const totalPairs = sorted.length - 1;
  const score = totalPairs > 0 ? (closeIntervals.length / totalPairs) * 100 : 0;
  
  return { closeIntervals, score };
};

const calculateAudioDurationFraudScore = (interviews: InterviewData[]): {
  shortFamilyStories: FraudIndicators['shortFamilyStories'];
  shortPedigrees: FraudIndicators['shortPedigrees'];
  score: number;
} => {
  const shortFamilyStories: FraudIndicators['shortFamilyStories'] = [];
  const shortPedigrees: FraudIndicators['shortPedigrees'] = [];
  
  interviews.forEach(interview => {
    if (interview.family_story_duration && interview.family_story_duration < 600) {
      shortFamilyStories.push({
        interviewId: interview.id,
        duration: interview.family_story_duration,
        date: interview.timestamp,
      });
    }
    if (interview.pedigree_segment_duration && interview.pedigree_segment_duration < 900) {
      shortPedigrees.push({
        interviewId: interview.id,
        duration: interview.pedigree_segment_duration,
        date: interview.timestamp,
      });
    }
  });
  
  const totalFlags = shortFamilyStories.length + shortPedigrees.length;
  const score = interviews.length > 0 ? (totalFlags / interviews.length) * 100 : 0;
  
  return { shortFamilyStories, shortPedigrees, score };
};

const calculateNamesPatternFraudScore = (interviews: InterviewData[]): {
  namesPattern: number[];
  repeatedNamesCount: number;
  score: number;
  mostCommonCount: number | null;
  mostCommonFrequency: number;
} => {
  const namesPattern = interviews
    .map(i => i.total_names)
    .filter((n): n is number => n !== null);
  
  if (namesPattern.length === 0) {
    return { namesPattern: [], repeatedNamesCount: 0, score: 0, mostCommonCount: null, mostCommonFrequency: 0 };
  }
  
  const frequency = namesPattern.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  
  let mostCommonCount: number | null = null;
  let mostCommonFrequency = 0;
  let repeatedNamesCount = 0;
  
  Object.entries(frequency).forEach(([value, count]) => {
    if (count > 3) {
      repeatedNamesCount++;
    }
    if (count > mostCommonFrequency) {
      mostCommonFrequency = count;
      mostCommonCount = Number(value);
    }
  });
  
  const mean = namesPattern.reduce((sum, n) => sum + n, 0) / namesPattern.length;
  const variance = namesPattern.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / namesPattern.length;
  const stdDev = Math.sqrt(variance);
  
  const uniformityScore = stdDev < 10 ? 50 : stdDev < 20 ? 25 : 0;
  const repetitionScore = (repeatedNamesCount / Object.keys(frequency).length) * 50;
  const score = uniformityScore + repetitionScore;
  
  return { namesPattern, repeatedNamesCount, score, mostCommonCount, mostCommonFrequency };
};

const calculatePageBoundaryFraudScore = (interviews: InterviewData[]): {
  boundaryHits: number;
  totalInterviews: number;
  expectedBoundaryRate: number;
  actualBoundaryRate: number;
  score: number;
  neverHitsBoundaries: boolean;
  alwaysHitsBoundaries: boolean;
} => {
  const namesWithData = interviews.filter(i => i.total_names !== null);
  const totalInterviews = namesWithData.length;
  
  if (totalInterviews === 0) {
    return {
      boundaryHits: 0, totalInterviews: 0, expectedBoundaryRate: 0,
      actualBoundaryRate: 0, score: 0, neverHitsBoundaries: false, alwaysHitsBoundaries: false,
    };
  }
  
  const boundaryHits = namesWithData.filter(i => PAGE_BOUNDARIES.includes(i.total_names!)).length;
  const expectedBoundaryRate = 3.8;
  const actualBoundaryRate = (boundaryHits / totalInterviews) * 100;
  const neverHitsBoundaries = boundaryHits === 0 && totalInterviews >= 10;
  const alwaysHitsBoundaries = actualBoundaryRate > 50;
  
  const deviation = Math.abs(actualBoundaryRate - expectedBoundaryRate);
  let score = 0;
  if (alwaysHitsBoundaries) score = 100;
  else if (neverHitsBoundaries) score = 60;
  else if (deviation > 20) score = 50;
  else if (deviation > 10) score = 25;
  
  return { boundaryHits, totalInterviews, expectedBoundaryRate, actualBoundaryRate, score, neverHitsBoundaries, alwaysHitsBoundaries };
};

const calculateAnomalyScore = (
  interviews: InterviewData[],
  populationAvg: { passRate: number; avgAudioQuality: number; reAuditRate: number }
): {
  passRate: number;
  avgAudioQuality: number;
  reAuditRate: number;
  score: number;
} => {
  const passed = interviews.filter(i => i.status === 'Audit Passed').length;
  const passRate = interviews.length > 0 ? (passed / interviews.length) * 100 : 0;
  const avgAudioQuality = 85;
  const reAuditRate = 0;
  
  const passRateDeviation = Math.abs(passRate - populationAvg.passRate);
  const audioDeviation = Math.abs(avgAudioQuality - populationAvg.avgAudioQuality);
  
  let score = 0;
  if (passRateDeviation > 20) score += 30;
  if (audioDeviation > 15) score += 20;
  if (reAuditRate > 30) score += 50;
  
  return { passRate, avgAudioQuality, reAuditRate, score };
};

const deduplicateInterviews = (interviews: InterviewData[]): InterviewData[] => {
  const seen = new Map<string, InterviewData>();
  for (const interview of interviews) {
    const existing = seen.get(interview.file_name);
    if (!existing || interview.timestamp < existing.timestamp) {
      seen.set(interview.file_name, interview);
    }
  }
  return Array.from(seen.values());
};

const getDateCutoff = (period: TimePeriod): Date | null => {
  switch (period) {
    case '13weeks': return subWeeks(new Date(), 13);
    case '365days': return subDays(new Date(), 365);
    case 'lifetime': return null;
  }
};

export const getPeriodLabel = (period: TimePeriod): string => {
  switch (period) {
    case '13weeks': return '13 weeks';
    case '365days': return '365 days';
    case 'lifetime': return 'lifetime';
  }
};

export const useCriticalAgentsFraud = () => {
  return useQuery({
    queryKey: ['critical-agents-fraud'],
    queryFn: async () => {
      const thirteenWeeksAgo = subWeeks(new Date(), 13);
      
      const { data: allInterviewers, error } = await supabase
        .from('interview_metadata')
        .select('interviewer_code, interviewer_name, contractor_id')
        .gte('interview_date', thirteenWeeksAgo.toISOString().split('T')[0]);
      
      if (error) throw error;
      if (!allInterviewers) return [];
      
      const uniqueInterviewers = Array.from(
        new Map(allInterviewers.map(i => [i.interviewer_code, i])).values()
      );
      
      const criticalAgents: Array<AgentFraudProfile> = [];
      
      for (const interviewer of uniqueInterviewers) {
        try {
          const { data: metadata } = await supabase
            .from('interview_metadata')
            .select('*, audits!inner(*)')
            .eq('interviewer_code', interviewer.interviewer_code)
            .gte('interview_date', thirteenWeeksAgo.toISOString().split('T')[0]);
          
          if (!metadata || metadata.length === 0) continue;
          
          const validMetadata = metadata.filter(m => 
            m.total_names !== null || m.family_story_duration !== null || m.pedigree_segment_duration !== null
          );
          
          if (validMetadata.length === 0) continue;
          
          let interviews: InterviewData[] = validMetadata.map(m => ({
            id: m.id,
            audit_id: m.audit_id!,
            file_name: (m.audits as any).file_name,
            interview_date: m.interview_date,
            interview_time: m.interview_time,
            total_names: m.total_names,
            family_story_duration: m.family_story_duration,
            pedigree_segment_duration: m.pedigree_segment_duration,
            interviewer_code: m.interviewer_code,
            status: (m.audits as any).status,
            timestamp: parseISO(`${m.interview_date}T${m.interview_time}`),
          }));
          
          interviews = deduplicateInterviews(interviews);
          
          const intervalAnalysis = calculateIntervalFraudScore(interviews);
          const audioAnalysis = calculateAudioDurationFraudScore(interviews);
          const namesAnalysis = calculateNamesPatternFraudScore(interviews);
          const boundaryAnalysis = calculatePageBoundaryFraudScore(interviews);
          const anomalyAnalysis = calculateAnomalyScore(interviews, { passRate: 75, avgAudioQuality: 85, reAuditRate: 15 });
          
          const indicators: FraudIndicators = {
            closeIntervals: intervalAnalysis.closeIntervals,
            intervalFraudScore: intervalAnalysis.score,
            shortFamilyStories: audioAnalysis.shortFamilyStories,
            shortPedigrees: audioAnalysis.shortPedigrees,
            audioDurationFraudScore: audioAnalysis.score,
            namesPattern: namesAnalysis.namesPattern,
            repeatedNamesCount: namesAnalysis.repeatedNamesCount,
            namesPatternFraudScore: namesAnalysis.score,
            mostCommonCount: namesAnalysis.mostCommonCount,
            mostCommonFrequency: namesAnalysis.mostCommonFrequency,
            boundaryHits: boundaryAnalysis.boundaryHits,
            totalInterviews: boundaryAnalysis.totalInterviews,
            expectedBoundaryRate: boundaryAnalysis.expectedBoundaryRate,
            actualBoundaryRate: boundaryAnalysis.actualBoundaryRate,
            pageBoundaryFraudScore: boundaryAnalysis.score,
            neverHitsBoundaries: boundaryAnalysis.neverHitsBoundaries,
            alwaysHitsBoundaries: boundaryAnalysis.alwaysHitsBoundaries,
            passRate: anomalyAnalysis.passRate,
            avgAudioQuality: anomalyAnalysis.avgAudioQuality,
            reAuditRate: anomalyAnalysis.reAuditRate,
            anomalyScore: anomalyAnalysis.score,
          };
          
          const overallFraudScore = 
            (indicators.intervalFraudScore * 0.25) +
            (indicators.audioDurationFraudScore * 0.20) +
            (indicators.namesPatternFraudScore * 0.20) +
            (indicators.pageBoundaryFraudScore * 0.20) +
            (indicators.anomalyScore * 0.15);
          
          let fraudGrade: 'A' | 'B' | 'C' | 'D';
          let classification: 'Safe' | 'Caution' | 'High Risk' | 'Fire Immediately';
          
          if (overallFraudScore < 20) { fraudGrade = 'A'; classification = 'Safe'; }
          else if (overallFraudScore < 40) { fraudGrade = 'B'; classification = 'Caution'; }
          else if (overallFraudScore < 70) { fraudGrade = 'C'; classification = 'High Risk'; }
          else { fraudGrade = 'D'; classification = 'Fire Immediately'; }
          
          if (fraudGrade === 'C' || fraudGrade === 'D') {
            criticalAgents.push({
              interviewer_code: interviewer.interviewer_code,
              interviewer_name: metadata[0].interviewer_name,
              contractor_id: metadata[0].contractor_id,
              total_interviews: interviews.length,
              indicators, overallFraudScore, fraudGrade, classification, interviews,
            });
          }
        } catch (err) {
          console.error(`Error calculating fraud for ${interviewer.interviewer_code}:`, err);
        }
      }
      
      return criticalAgents.sort((a, b) => b.overallFraudScore - a.overallFraudScore);
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useFraudAnalytics = (interviewerCode: string, period: TimePeriod = '13weeks') => {
  return useQuery({
    queryKey: ['fraud-analytics', interviewerCode, period],
    queryFn: async (): Promise<AgentFraudProfile> => {
      const dateCutoff = getDateCutoff(period);
      
      let query = supabase
        .from('interview_metadata')
        .select('*, audits!inner(*)')
        .eq('interviewer_code', interviewerCode);
      
      if (dateCutoff) {
        query = query.gte('interview_date', dateCutoff.toISOString().split('T')[0]);
      }
      
      const { data: metadata, error } = await query;
      
      if (error) throw error;
      if (!metadata || metadata.length === 0) {
        throw new Error('No data found for this agent');
      }
      
      const validMetadata = metadata.filter(m => 
        m.total_names !== null || m.family_story_duration !== null || m.pedigree_segment_duration !== null
      );
      
      if (validMetadata.length === 0) {
        throw new Error('No interviews with parsed metadata found for this agent');
      }
      
      let interviews: InterviewData[] = validMetadata.map(m => ({
        id: m.id,
        audit_id: m.audit_id!,
        file_name: (m.audits as any).file_name,
        interview_date: m.interview_date,
        interview_time: m.interview_time,
        total_names: m.total_names,
        family_story_duration: m.family_story_duration,
        pedigree_segment_duration: m.pedigree_segment_duration,
        interviewer_code: m.interviewer_code,
        status: (m.audits as any).status,
        timestamp: parseISO(`${m.interview_date}T${m.interview_time}`),
      }));
      
      // Deduplicate by file_name
      interviews = deduplicateInterviews(interviews);
      
      const intervalAnalysis = calculateIntervalFraudScore(interviews);
      const audioAnalysis = calculateAudioDurationFraudScore(interviews);
      const namesAnalysis = calculateNamesPatternFraudScore(interviews);
      const boundaryAnalysis = calculatePageBoundaryFraudScore(interviews);
      const anomalyAnalysis = calculateAnomalyScore(interviews, { passRate: 75, avgAudioQuality: 85, reAuditRate: 15 });
      
      const indicators: FraudIndicators = {
        closeIntervals: intervalAnalysis.closeIntervals,
        intervalFraudScore: intervalAnalysis.score,
        shortFamilyStories: audioAnalysis.shortFamilyStories,
        shortPedigrees: audioAnalysis.shortPedigrees,
        audioDurationFraudScore: audioAnalysis.score,
        namesPattern: namesAnalysis.namesPattern,
        repeatedNamesCount: namesAnalysis.repeatedNamesCount,
        namesPatternFraudScore: namesAnalysis.score,
        mostCommonCount: namesAnalysis.mostCommonCount,
        mostCommonFrequency: namesAnalysis.mostCommonFrequency,
        boundaryHits: boundaryAnalysis.boundaryHits,
        totalInterviews: boundaryAnalysis.totalInterviews,
        expectedBoundaryRate: boundaryAnalysis.expectedBoundaryRate,
        actualBoundaryRate: boundaryAnalysis.actualBoundaryRate,
        pageBoundaryFraudScore: boundaryAnalysis.score,
        neverHitsBoundaries: boundaryAnalysis.neverHitsBoundaries,
        alwaysHitsBoundaries: boundaryAnalysis.alwaysHitsBoundaries,
        passRate: anomalyAnalysis.passRate,
        avgAudioQuality: anomalyAnalysis.avgAudioQuality,
        reAuditRate: anomalyAnalysis.reAuditRate,
        anomalyScore: anomalyAnalysis.score,
      };
      
      const overallFraudScore = 
        (indicators.intervalFraudScore * 0.25) +
        (indicators.audioDurationFraudScore * 0.20) +
        (indicators.namesPatternFraudScore * 0.20) +
        (indicators.pageBoundaryFraudScore * 0.20) +
        (indicators.anomalyScore * 0.15);
      
      let fraudGrade: 'A' | 'B' | 'C' | 'D';
      let classification: 'Safe' | 'Caution' | 'High Risk' | 'Fire Immediately';
      
      if (overallFraudScore < 20) { fraudGrade = 'A'; classification = 'Safe'; }
      else if (overallFraudScore < 40) { fraudGrade = 'B'; classification = 'Caution'; }
      else if (overallFraudScore < 70) { fraudGrade = 'C'; classification = 'High Risk'; }
      else { fraudGrade = 'D'; classification = 'Fire Immediately'; }
      
      return {
        interviewer_code: interviewerCode,
        interviewer_name: metadata[0].interviewer_name,
        contractor_id: metadata[0].contractor_id,
        total_interviews: interviews.length,
        indicators, overallFraudScore, fraudGrade, classification, interviews,
      };
    },
  });
};
