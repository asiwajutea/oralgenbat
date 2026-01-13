import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { 
  AlertTriangle, 
  FileText, 
  Upload, 
  Loader2, 
  CheckCircle,
  XCircle,
  ExternalLink
} from "lucide-react";

interface FailedInterviewData {
  id: string;
  file_name: string;
  file_url: string | null;
  review_comment: string | null;
  action_plan: string | null;
  artifact_correction: string[] | null;
  status: string;
}

interface FailedInterviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interview: FailedInterviewData | null;
}

export function FailedInterviewModal({ 
  open, 
  onOpenChange, 
  interview 
}: FailedInterviewModalProps) {
  const { session, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const needsPdf = interview?.artifact_correction?.includes("PDF");
  const needsMetadata = interview?.artifact_correction?.includes("Metadata") || 
                         interview?.artifact_correction?.includes("ZIP") ||
                         interview?.artifact_correction?.includes("Photos");

  const validateFileName = (file: File, expectedName: string, fileType: 'PDF' | 'ZIP'): boolean => {
    const extension = fileType === 'PDF' ? '.pdf' : '.zip';
    const fileNameWithoutExt = file.name.replace(new RegExp(`\\${extension}$`, 'i'), '');
    
    if (fileNameWithoutExt !== expectedName) {
      toast({
        title: "Filename mismatch",
        description: `The ${fileType} file must be named "${expectedName}${extension}" to match the interview ID. Your file is named "${file.name}"`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!interview) throw new Error("No interview selected");
      
      // Validate session and user ID
      const userId = session?.user?.id;
      if (!userId) throw new Error("You must be logged in to submit");
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        throw new Error("Invalid session. Please log out and log back in.");
      }
      
      if (!userRole) throw new Error("User role not found. Please refresh the page.");
      
      setIsUploading(true);
      
      let newPdfUrl: string | null = null;
      let newZipUrl: string | null = null;

      // Upload new PDF if provided
      if (pdfFile) {
        const pdfPath = `audits/${interview.id}/resubmit_${Date.now()}.pdf`;
        const { error: pdfError } = await supabase.storage
          .from("audit-pdfs")
          .upload(pdfPath, pdfFile);
        
        if (pdfError) throw new Error("Failed to upload PDF: " + pdfError.message);
        
        const { data: pdfUrlData } = supabase.storage
          .from("audit-pdfs")
          .getPublicUrl(pdfPath);
        newPdfUrl = pdfUrlData.publicUrl;
      }

      // Upload new ZIP if provided
      if (zipFile) {
        const zipPath = `audits/${interview.id}/resubmit_${Date.now()}.zip`;
        const { error: zipError } = await supabase.storage
          .from("mobile-zips")
          .upload(zipPath, zipFile);
        
        if (zipError) throw new Error("Failed to upload ZIP: " + zipError.message);
        
        const { data: zipUrlData } = supabase.storage
          .from("mobile-zips")
          .getPublicUrl(zipPath);
        newZipUrl = zipUrlData.publicUrl;
      }

      // Create re-audit submission record
      const { error: submissionError } = await supabase
        .from("re_audit_submissions")
        .insert([{
          audit_id: interview.id,
          submitted_by: userId,
          submitted_by_role: userRole as "admin" | "auditor" | "contractor" | "data_entry_clerk" | "field_manager" | "quality_assurance_manager" | "super_admin",
          replaced_pdf: !!pdfFile,
          replaced_zip: !!zipFile,
          submission_comment: comment || null,
          new_pdf_url: newPdfUrl,
          new_zip_url: newZipUrl,
        }]);

      if (submissionError) throw submissionError;

      // Update audit status and file URLs if new files were uploaded
      // CRITICAL: Use "Awaiting Review" status so auditors can see and process re-audits
      const updateData: Record<string, any> = {
        status: "Awaiting Review",
        is_re_audit: true,
      };
      
      if (newPdfUrl) updateData.file_url = newPdfUrl;
      if (newZipUrl) updateData.mobile_zip_url = newZipUrl;

      // First get current re_audit_count, then increment
      const { data: currentAudit } = await supabase
        .from("audits")
        .select("re_audit_count")
        .eq("id", interview.id)
        .single();
      
      updateData.re_audit_count = (currentAudit?.re_audit_count || 0) + 1;

      const { error: auditError } = await supabase
        .from("audits")
        .update(updateData)
        .eq("id", interview.id);

      if (auditError) throw auditError;

      // Delete previous checklist progress so next auditor starts fresh
      await supabase
        .from("audit_checklist_progress")
        .delete()
        .eq("audit_id", interview.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
      toast({
        title: "Submitted for Re-Audit",
        description: "The interview has been submitted for re-review.",
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit for re-audit.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsUploading(false);
    },
  });

  const resetForm = () => {
    setPdfFile(null);
    setZipFile(null);
    setComment("");
  };

  const handleSubmit = () => {
    if (!pdfFile && !zipFile) {
      toast({
        title: "No files selected",
        description: "Please upload at least one corrected file.",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate();
  };

  if (!interview) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Failed Interview Details
          </DialogTitle>
          <DialogDescription>
            Review the failure reason and upload corrected artifacts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Interview Info */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Interview ID</span>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-background px-2 py-1 rounded">
                  {interview.file_name}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => interview.file_url && window.open(interview.file_url, '_blank')}
                  disabled={!interview.file_url}
                  className="gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  View PDF
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge variant="destructive">{interview.status}</Badge>
            </div>
          </div>

          <Separator />

          {/* Failure Reason */}
          <div className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              Reason for Failure
            </h3>
            <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
              <p className="text-sm">
                {interview.review_comment || "No specific reason provided."}
              </p>
            </div>
          </div>

          {/* Action Plan */}
          {interview.action_plan && (
            <div className="space-y-3">
              <h3 className="font-semibold">Action Plan</h3>
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
                <p className="text-sm">{interview.action_plan}</p>
              </div>
            </div>
          )}

          {/* Required Corrections */}
          {interview.artifact_correction && interview.artifact_correction.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold">Artifacts Requiring Correction</h3>
              <div className="flex flex-wrap gap-2">
                {interview.artifact_correction.map((artifact) => (
                  <Badge key={artifact} variant="outline" className="gap-1">
                    <FileText className="h-3 w-3" />
                    {artifact}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Upload Section */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Corrected Files
            </h3>

            {/* PDF Upload */}
            <div className="space-y-2">
              <Label htmlFor="pdf-upload" className="flex items-center gap-2">
                PDF Document
                {needsPdf && <Badge variant="destructive" className="text-xs">Required</Badge>}
              </Label>
              <Input
                id="pdf-upload"
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (file && interview && !validateFileName(file, interview.file_name, 'PDF')) {
                    e.target.value = '';
                    return;
                  }
                  setPdfFile(file);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Expected: <code className="font-mono bg-muted px-1 rounded">{interview.file_name}.pdf</code>
              </p>
              {pdfFile && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-success" />
                  {pdfFile.name}
                </p>
              )}
            </div>

            {/* ZIP Upload */}
            <div className="space-y-2">
              <Label htmlFor="zip-upload" className="flex items-center gap-2">
                Photos/Metadata ZIP
                {needsMetadata && <Badge variant="destructive" className="text-xs">Required</Badge>}
              </Label>
              <Input
                id="zip-upload"
                type="file"
                accept=".zip"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (file && interview && !validateFileName(file, interview.file_name, 'ZIP')) {
                    e.target.value = '';
                    return;
                  }
                  setZipFile(file);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Expected: <code className="font-mono bg-muted px-1 rounded">{interview.file_name}.zip</code>
              </p>
              {zipFile && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-success" />
                  {zipFile.name}
                </p>
              )}
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <Label htmlFor="comment">Submission Comment (Optional)</Label>
              <Textarea
                id="comment"
                placeholder="Describe the corrections made..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={isUploading || submitMutation.isPending}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Submit for Re-Audit"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
