import jsPDF from 'jspdf';
import { AgentFraudProfile } from '@/hooks/useFraudAnalytics';
import { format } from 'date-fns';

interface AIAnalysis {
  summary: string;
  concerningPatterns: string[];
  actionPlan: {
    immediate: string[];
    shortTerm: string[];
    escalation: string | null;
  };
  riskAssessment: string;
}

export const generateFraudReportPdf = (
  fraudProfile: AgentFraudProfile,
  aiAnalysis: AIAnalysis | undefined
) => {
  const doc = new jsPDF();
  let yPosition = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - 2 * margin;

  // Helper function to add text with auto page break
  const addText = (text: string, fontSize: number = 11, isBold: boolean = false) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    
    const lines = doc.splitTextToSize(text, maxWidth);
    
    lines.forEach((line: string) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
      doc.text(line, margin, yPosition);
      yPosition += fontSize * 0.5;
    });
    
    yPosition += 5;
  };

  const addSection = (title: string) => {
    yPosition += 5;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition - 5, maxWidth, 8, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin + 2, yPosition);
    yPosition += 10;
  };

  // Header
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('FRAUD ANALYSIS REPORT', margin, yPosition);
  yPosition += 15;

  // Agent Info
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Agent: ${fraudProfile.interviewer_code}${fraudProfile.interviewer_name ? ` (${fraudProfile.interviewer_name})` : ''}`, margin, yPosition);
  yPosition += 7;
  doc.text(`Contractor: ${fraudProfile.contractor_id}`, margin, yPosition);
  yPosition += 7;
  doc.text(`Report Date: ${format(new Date(), 'MMMM d, yyyy')}`, margin, yPosition);
  yPosition += 7;
  doc.text(`Analysis Period: Last 13 Weeks (${fraudProfile.total_interviews} interviews)`, margin, yPosition);
  yPosition += 15;

  // Fraud Grade
  addSection('FRAUD GRADE');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  
  // Color based on grade
  const gradeColors: Record<string, [number, number, number]> = {
    'A': [34, 197, 94],   // green
    'B': [59, 130, 246],  // blue
    'C': [249, 115, 22],  // orange
    'D': [239, 68, 68],   // red
  };
  const color = gradeColors[fraudProfile.fraudGrade] || [0, 0, 0];
  doc.setTextColor(color[0], color[1], color[2]);
  doc.text(`Grade ${fraudProfile.fraudGrade}: ${fraudProfile.classification}`, margin, yPosition);
  yPosition += 8;
  doc.text(`Overall Score: ${fraudProfile.overallFraudScore.toFixed(1)}/100`, margin, yPosition);
  doc.setTextColor(0, 0, 0);
  yPosition += 15;

  // AI Analysis Summary
  if (aiAnalysis?.summary) {
    addSection('ANALYSIS SUMMARY');
    addText(aiAnalysis.summary, 11, false);
  }

  // Concerning Patterns
  if (aiAnalysis?.concerningPatterns && aiAnalysis.concerningPatterns.length > 0) {
    addSection('CONCERNING PATTERNS');
    aiAnalysis.concerningPatterns.forEach((pattern, idx) => {
      addText(`${idx + 1}. ${pattern}`, 11, false);
    });
  }

  // Action Plan
  if (aiAnalysis?.actionPlan) {
    addSection('RECOMMENDED ACTIONS');
    
    if (aiAnalysis.actionPlan.immediate.length > 0) {
      addText('Immediate Actions:', 11, true);
      aiAnalysis.actionPlan.immediate.forEach((action, idx) => {
        addText(`${idx + 1}. ${action}`, 11, false);
      });
      yPosition += 3;
    }
    
    if (aiAnalysis.actionPlan.shortTerm.length > 0) {
      addText('Short-term Actions:', 11, true);
      aiAnalysis.actionPlan.shortTerm.forEach((action, idx) => {
        addText(`${idx + 1}. ${action}`, 11, false);
      });
      yPosition += 3;
    }
    
    if (aiAnalysis.actionPlan.escalation) {
      addText('Escalation Note:', 11, true);
      addText(aiAnalysis.actionPlan.escalation, 11, false);
    }
  }

  // Fraud Indicator Scores
  addSection('FRAUD INDICATOR SCORES');
  
  const indicators = [
    { name: 'Interview Intervals', score: fraudProfile.indicators.intervalFraudScore },
    { name: 'Audio Duration', score: fraudProfile.indicators.audioDurationFraudScore },
    { name: 'Names Pattern', score: fraudProfile.indicators.namesPatternFraudScore },
    { name: 'Page Boundaries', score: fraudProfile.indicators.pageBoundaryFraudScore },
    { name: 'Statistical Anomalies', score: fraudProfile.indicators.anomalyScore },
  ];

  indicators.forEach((indicator) => {
    doc.setFont('helvetica', 'normal');
    doc.text(`${indicator.name}:`, margin, yPosition);
    doc.setFont('helvetica', 'bold');
    doc.text(`${indicator.score.toFixed(1)}/100`, margin + 80, yPosition);
    yPosition += 7;
  });
  yPosition += 10;

  // Interview Statistics
  addSection('INTERVIEW STATISTICS');
  addText(`Total Interviews: ${fraudProfile.total_interviews}`, 11, false);
  addText(`Pass Rate: ${fraudProfile.indicators.passRate.toFixed(1)}%`, 11, false);
  addText(`Re-audit Rate: ${fraudProfile.indicators.reAuditRate.toFixed(1)}%`, 11, false);
  addText(`Close Intervals Flagged: ${fraudProfile.indicators.closeIntervals.length}`, 11, false);
  addText(`Short Family Stories: ${fraudProfile.indicators.shortFamilyStories.length}`, 11, false);
  addText(`Short Pedigrees: ${fraudProfile.indicators.shortPedigrees.length}`, 11, false);

  // Save the PDF
  doc.save(`fraud-report-${fraudProfile.interviewer_code}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};
