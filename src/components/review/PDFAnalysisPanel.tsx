import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { FileCheck, PenTool, RefreshCw, Loader2, Edit2, Save, X } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PDFAnalysisPanelProps {
  metadata: {
    pdf_clarity_score?: number | null;
    pdf_handwriting_legibility?: number | null;
    pdf_quality_feedback?: string | null;
    pdf_analyzed_at?: string | null;
    pdf_scores_manually_adjusted?: boolean | null;
  };
  auditId: string;
  onRefresh: () => void;
}

export const PDFAnalysisPanel = ({ metadata, auditId, onRefresh }: PDFAnalysisPanelProps) => {
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editClarityScore, setEditClarityScore] = useState(metadata.pdf_clarity_score ?? 0);
  const [editLegibilityScore, setEditLegibilityScore] = useState(metadata.pdf_handwriting_legibility ?? 0);

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

  const handleReanalyze = async () => {
    setIsReanalyzing(true);
    try {
      const { error } = await supabase.functions.invoke('analyze-pdf', {
        body: { auditId }
      });
      if (error) throw error;
      
      // Reset manually adjusted flag since AI has re-analyzed
      await supabase
        .from('interview_metadata')
        .update({ pdf_scores_manually_adjusted: false })
        .eq('audit_id', auditId);
      
      toast.success('PDF re-analyzed successfully');
      onRefresh();
    } catch (error) {
      console.error('PDF re-analysis error:', error);
      toast.error('Failed to re-analyze PDF. Please try again.');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleEditMode = () => {
    setEditClarityScore(clarityScore);
    setEditLegibilityScore(legibilityScore);
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditClarityScore(clarityScore);
    setEditLegibilityScore(legibilityScore);
  };

  const handleSaveScores = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('interview_metadata')
        .update({
          pdf_clarity_score: editClarityScore,
          pdf_handwriting_legibility: editLegibilityScore,
          pdf_scores_manually_adjusted: true,
        })
        .eq('audit_id', auditId);

      if (error) throw error;
      toast.success('Scores updated successfully');
      setIsEditMode(false);
      onRefresh();
    } catch (error) {
      console.error('Error saving scores:', error);
      toast.error('Failed to save scores. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const isManuallyAdjusted = metadata.pdf_scores_manually_adjusted;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              PDF Quality Analysis
            </CardTitle>
            {isManuallyAdjusted && (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                <Edit2 className="h-3 w-3 mr-1" />
                Manually Adjusted
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isEditMode ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditMode}
                  className="gap-1.5 h-8"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Edit Scores
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReanalyze}
                  disabled={isReanalyzing}
                  className="gap-1.5 h-8"
                >
                  {isReanalyzing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Re-analyze
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEdit}
                  className="gap-1.5 h-8"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveScores}
                  disabled={isSaving}
                  className="gap-1.5 h-8"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
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
              <span className="text-xl font-bold">
                {isEditMode ? editClarityScore : clarityScore}%
              </span>
              <p className="text-xs text-muted-foreground">
                {getScoreLabel(isEditMode ? editClarityScore : clarityScore)}
              </p>
            </div>
          </div>
          {isEditMode ? (
            <Slider
              value={[editClarityScore]}
              onValueChange={([value]) => setEditClarityScore(value)}
              max={100}
              step={1}
              className="mt-2"
            />
          ) : (
            <Progress 
              value={clarityScore} 
              className="h-2"
            />
          )}
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
              <span className="text-xl font-bold">
                {isEditMode ? editLegibilityScore : legibilityScore}%
              </span>
              <p className="text-xs text-muted-foreground">
                {getScoreLabel(isEditMode ? editLegibilityScore : legibilityScore)}
              </p>
            </div>
          </div>
          {isEditMode ? (
            <Slider
              value={[editLegibilityScore]}
              onValueChange={([value]) => setEditLegibilityScore(value)}
              max={100}
              step={1}
              className="mt-2"
            />
          ) : (
            <Progress 
              value={legibilityScore} 
              className="h-2"
            />
          )}
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
