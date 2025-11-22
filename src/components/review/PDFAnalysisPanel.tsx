import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FileCheck, PenTool } from "lucide-react";
import { format } from "date-fns";

interface PDFAnalysisPanelProps {
  metadata: {
    pdf_clarity_score?: number | null;
    pdf_handwriting_legibility?: number | null;
    pdf_quality_feedback?: string | null;
    pdf_analyzed_at?: string | null;
  };
}

export const PDFAnalysisPanel = ({ metadata }: PDFAnalysisPanelProps) => {
  const clarityScore = metadata.pdf_clarity_score ?? 0;
  const legibilityScore = metadata.pdf_handwriting_legibility ?? 0;
  const feedback = metadata.pdf_quality_feedback;
  const analyzedAt = metadata.pdf_analyzed_at;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    if (score >= 40) return "bg-orange-500";
    return "bg-red-500";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Poor";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileCheck className="h-5 w-5" />
          PDF Quality Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Clarity Score */}
        <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/5">
          <div className="flex items-center gap-3">
            <FileCheck className="h-5 w-5 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium">Clarity & Neatness</h4>
              <p className="text-sm text-muted-foreground">
                Overall document quality
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-xl font-bold">{clarityScore}%</span>
              <p className="text-xs text-muted-foreground">
                {getScoreLabel(clarityScore)}
              </p>
            </div>
          </div>
          <Progress 
            value={clarityScore} 
            className="h-2"
          />
        </div>

        {/* Handwriting Legibility */}
        <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/5">
          <div className="flex items-center gap-3">
            <PenTool className="h-5 w-5 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium">Handwriting Legibility</h4>
              <p className="text-sm text-muted-foreground">
                Readability of handwritten text
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-xl font-bold">{legibilityScore}%</span>
              <p className="text-xs text-muted-foreground">
                {getScoreLabel(legibilityScore)}
              </p>
            </div>
          </div>
          <Progress 
            value={legibilityScore} 
            className="h-2"
          />
        </div>

        {/* AI Feedback */}
        {feedback && (
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <h4 className="font-medium mb-2 text-sm">AI Quality Assessment</h4>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {feedback}
            </p>
          </div>
        )}

        {/* Analyzed timestamp */}
        {analyzedAt && (
          <p className="text-xs text-muted-foreground text-center">
            Analyzed: {format(new Date(analyzedAt), 'PPp')}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
