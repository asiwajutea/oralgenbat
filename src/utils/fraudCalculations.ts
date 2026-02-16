import { parseISO } from "date-fns";

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
  is_re_audit?: boolean;
}

export interface FraudIndicators {
  closeIntervals: { interview1: string; interview2: string; fileName1: string; fileName2: string; minutesApart: number; date1: Date; date2: Date }[];
  intervalFraudScore: number;
  shortFamilyStories: { interviewId: string; duration: number; date: Date }[];
  shortPedigrees: { interviewId: string; duration: number; date: Date }[];
  audioDurationFraudScore: number;
  namesPattern: number[];
  repeatedNamesCount: number;
  namesPatternFraudScore: number;
  mostCommonCount: number | null;
  mostCommonFrequency: number;
  boundaryHits: number;
  totalInterviews: number;
  expectedBoundaryRate: number;
  actualBoundaryRate: number;
  pageBoundaryFraudScore: number;
  neverHitsBoundaries: boolean;
  alwaysHitsBoundaries: boolean;
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
  indicators: FraudIndicators;
  overallFraudScore: number;
  fraudGrade: 'A' | 'B' | 'C' | 'D';
  classification: 'Safe' | 'Caution' | 'High Risk' | 'Fire Immediately';
  interviews: InterviewData[];
  // Additional stats
  passedCount: number;
  failedCount: number;
  pendingCount: number;
  reAuditCount: number;
  avgNames: number;
  avgFamilyStoryDuration: number;
  avgPedigreeDuration: number;
}

const PAGE_BOUNDARIES = [24, 50, 76, 102, 128, 154, 180, 206, 232, 258, 284, 310];

export const calculateIntervalFraudScore = (interviews: InterviewData[]) => {
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
      });
    }
  }
  
  const totalPairs = sorted.length - 1;
  const score = totalPairs > 0 ? (closeIntervals.length / totalPairs) * 100 : 0;
  return { closeIntervals, score };
};

export const calculateAudioDurationFraudScore = (interviews: InterviewData[]) => {
  const shortFamilyStories: FraudIndicators['shortFamilyStories'] = [];
  const shortPedigrees: FraudIndicators['shortPedigrees'] = [];
  
  interviews.forEach(interview => {
    if (interview.family_story_duration && interview.family_story_duration < 600) {
      shortFamilyStories.push({ interviewId: interview.id, duration: interview.family_story_duration, date: interview.timestamp });
    }
    if (interview.pedigree_segment_duration && interview.pedigree_segment_duration < 900) {
      shortPedigrees.push({ interviewId: interview.id, duration: interview.pedigree_segment_duration, date: interview.timestamp });
    }
  });
  
  const totalFlags = shortFamilyStories.length + shortPedigrees.length;
  const score = interviews.length > 0 ? (totalFlags / interviews.length) * 100 : 0;
  return { shortFamilyStories, shortPedigrees, score };
};

export const calculateNamesPatternFraudScore = (interviews: InterviewData[]) => {
  const namesPattern = interviews.map(i => i.total_names).filter((n): n is number => n !== null);
  
  if (namesPattern.length === 0) {
    return { namesPattern: [], repeatedNamesCount: 0, score: 0, mostCommonCount: null, mostCommonFrequency: 0 };
  }
  
  const frequency = namesPattern.reduce((acc, val) => { acc[val] = (acc[val] || 0) + 1; return acc; }, {} as Record<number, number>);
  
  let mostCommonCount: number | null = null;
  let mostCommonFrequency = 0;
  let repeatedNamesCount = 0;
  
  Object.entries(frequency).forEach(([value, count]) => {
    if (count > 3) repeatedNamesCount++;
    if (count > mostCommonFrequency) { mostCommonFrequency = count; mostCommonCount = Number(value); }
  });
  
  const mean = namesPattern.reduce((sum, n) => sum + n, 0) / namesPattern.length;
  const variance = namesPattern.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / namesPattern.length;
  const stdDev = Math.sqrt(variance);
  
  const uniformityScore = stdDev < 10 ? 50 : stdDev < 20 ? 25 : 0;
  const repetitionScore = (repeatedNamesCount / Object.keys(frequency).length) * 50;
  const score = uniformityScore + repetitionScore;
  
  return { namesPattern, repeatedNamesCount, score, mostCommonCount, mostCommonFrequency };
};

export const calculatePageBoundaryFraudScore = (interviews: InterviewData[]) => {
  const namesWithData = interviews.filter(i => i.total_names !== null);
  const totalInterviews = namesWithData.length;
  
  if (totalInterviews === 0) {
    return { boundaryHits: 0, totalInterviews: 0, expectedBoundaryRate: 0, actualBoundaryRate: 0, score: 0, neverHitsBoundaries: false, alwaysHitsBoundaries: false };
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

export const calculateAnomalyScore = (interviews: InterviewData[]) => {
  const passed = interviews.filter(i => i.status === 'Audit Passed').length;
  const passRate = interviews.length > 0 ? (passed / interviews.length) * 100 : 0;
  const avgAudioQuality = 85;
  const reAudits = interviews.filter(i => i.is_re_audit).length;
  const reAuditRate = interviews.length > 0 ? (reAudits / interviews.length) * 100 : 0;
  
  let score = 0;
  if (passRate < 50) score += 30;
  else if (passRate < 70) score += 15;
  if (reAuditRate > 20) score += 25;
  else if (reAuditRate > 10) score += 15;
  
  return { passRate, avgAudioQuality, reAuditRate, score };
};

export const buildFraudProfile = (
  interviewerCode: string,
  interviewerName: string | null,
  contractorId: string,
  interviews: InterviewData[]
): AgentFraudProfile => {
  const intervalAnalysis = calculateIntervalFraudScore(interviews);
  const audioAnalysis = calculateAudioDurationFraudScore(interviews);
  const namesAnalysis = calculateNamesPatternFraudScore(interviews);
  const boundaryAnalysis = calculatePageBoundaryFraudScore(interviews);
  const anomalyAnalysis = calculateAnomalyScore(interviews);
  
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
  
  const passed = interviews.filter(i => i.status === 'Audit Passed').length;
  const failed = interviews.filter(i => i.status === 'Audit Failed').length;
  const pending = interviews.filter(i => i.status === 'Pending' || i.status === 'Awaiting Review').length;
  const reAudits = interviews.filter(i => i.is_re_audit).length;
  
  const namesValues = interviews.map(i => i.total_names).filter((n): n is number => n !== null);
  const avgNames = namesValues.length > 0 ? namesValues.reduce((s, n) => s + n, 0) / namesValues.length : 0;
  
  const fsDurations = interviews.map(i => i.family_story_duration).filter((n): n is number => n !== null);
  const avgFS = fsDurations.length > 0 ? fsDurations.reduce((s, n) => s + n, 0) / fsDurations.length : 0;
  
  const pedDurations = interviews.map(i => i.pedigree_segment_duration).filter((n): n is number => n !== null);
  const avgPed = pedDurations.length > 0 ? pedDurations.reduce((s, n) => s + n, 0) / pedDurations.length : 0;
  
  return {
    interviewer_code: interviewerCode,
    interviewer_name: interviewerName,
    contractor_id: contractorId,
    total_interviews: interviews.length,
    indicators,
    overallFraudScore,
    fraudGrade,
    classification,
    interviews,
    passedCount: passed,
    failedCount: failed,
    pendingCount: pending,
    reAuditCount: reAudits,
    avgNames,
    avgFamilyStoryDuration: avgFS,
    avgPedigreeDuration: avgPed,
  };
};

export const transformMetadataToInterviews = (
  metadata: any[]
): InterviewData[] => {
  return metadata
    .filter(m => m.total_names !== null || m.family_story_duration !== null || m.pedigree_segment_duration !== null)
    .map(m => ({
      id: m.id,
      audit_id: m.audit_id,
      file_name: m.audits?.file_name || m.file_name || '',
      interview_date: m.interview_date,
      interview_time: m.interview_time,
      total_names: m.total_names,
      family_story_duration: m.family_story_duration,
      pedigree_segment_duration: m.pedigree_segment_duration,
      interviewer_code: m.interviewer_code,
      status: m.audits?.status || 'Pending',
      is_re_audit: m.audits?.is_re_audit || false,
      timestamp: parseISO(`${m.interview_date}T${m.interview_time}`),
    }));
};
