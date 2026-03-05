import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatFileSize } from "@/utils/compressPdf";
import type { UploadProgressData } from "@/components/FloatingUploadProgress";
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
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
  onUploadProgress?: (progress: UploadProgressData | null) => void;
}

export function FailedInterviewModal({ 
  open, 
  onOpenChange, 
  interview,
  onUploadProgress,
}: FailedInterviewModalProps) {
  const { session, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ label: string; progress: number } | null>(null);

  const needsPdf = interview?.artifact_correction?.includes("scanned_pdf") || interview?.artifact_correction?.includes("PDF");
  const needsMetadata = interview?.artifact_correction?.includes("mobile_metadata") || 
                         interview?.artifact_correction?.includes("Metadata") || 
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

  const uploadWithXHR = (file: File, signedUrl: string, onProgress: (pct: number) => void): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed with status ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.open("PUT", signedUrl);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.send(file);
    });
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!interview) throw new Error("No interview selected");
      
      const userId = session?.user?.id;
      if (!userId) throw new Error("You must be logged in to submit");
      
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        throw new Error("Invalid session. Please log out and log back in.");
      }
      
      if (!userRole) throw new Error("User role not found. Please refresh the page.");
      
      setIsUploading(true);
      
      const totalFiles = (pdfFile ? 1 : 0) + (zipFile ? 1 : 0);
      const totalSize = (pdfFile?.size || 0) + (zipFile?.size || 0);
      let currentFileNum = 0;
      
      const updateFloating = (label: string, progress: number, status: UploadProgressData["status"] = "uploading") => {
        setUploadStatus({ label, progress });
        onUploadProgress?.({
          fileName: pdfFile?.name || zipFile?.name || "files",
          interviewName: interview.file_name,
          fileSize: totalSize,
          progress,
          status,
        });
      };

      let newPdfUrl: string | null = null;
      let newZipUrl: string | null = null;

      // Upload new PDF if provided
      if (pdfFile) {
        currentFileNum++;
        const pdfPath = `audits/${interview.id}/resubmit_${Date.now()}.pdf`;
        updateFloating(`Uploading PDF (${currentFileNum}/${totalFiles})...`, 0);

        const { data: signedData, error: signError } = await supabase.storage
          .from("audit-pdfs")
          .createSignedUploadUrl(pdfPath);
        if (signError || !signedData) throw signError || new Error("Failed to create upload URL");

        await uploadWithXHR(pdfFile, signedData.signedUrl, (pct) => {
          const overallPct = Math.round((pct / totalFiles) * (currentFileNum === 1 ? 1 : 0.5));
          updateFloating(`Uploading PDF (${currentFileNum}/${totalFiles})...`, Math.min(overallPct, 70));
        });
        
        const { data: pdfUrlData } = supabase.storage
          .from("audit-pdfs")
          .getPublicUrl(pdfPath);
        newPdfUrl = pdfUrlData.publicUrl;
      }

      // Upload new ZIP if provided
      if (zipFile) {
        currentFileNum++;
        const zipPath = `audits/${interview.id}/resubmit_${Date.now()}.zip`;
        const baseProgress = pdfFile ? 50 : 0;
        updateFloating(`Uploading ZIP (${currentFileNum}/${totalFiles})...`, baseProgress);

        const { data: signedData, error: signError } = await supabase.storage
          .from("mobile-zips")
          .createSignedUploadUrl(zipPath);
        if (signError || !signedData) throw signError || new Error("Failed to create upload URL");

        await uploadWithXHR(zipFile, signedData.signedUrl, (pct) => {
          const overallPct = baseProgress + Math.round((pct / totalFiles) * 50);
          updateFloating(`Uploading ZIP (${currentFileNum}/${totalFiles})...`, Math.min(overallPct, 80));
        });
        
        const { data: zipUrlData } = supabase.storage
          .from("mobile-zips")
          .getPublicUrl(zipPath);
        newZipUrl = zipUrlData.publicUrl;
        
        // Trigger metadata re-parsing
        updateFloating("Processing metadata...", 85, "processing");
        const { error: processError } = await supabase.functions.invoke('process-mobile-zip', {
          body: { auditId: interview.id, mobileZipUrl: newZipUrl }
        });
        
        if (processError) {
          console.error("ZIP processing error:", processError);
        }
      }

      // Create re-audit submission record
      updateFloating("Saving submission...", 90, "processing");
      
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

      const updateData: Record<string, any> = {
        status: "Awaiting Review",
        is_re_audit: true,
      };
      
      if (newPdfUrl) updateData.file_url = newPdfUrl;
      if (newZipUrl) updateData.mobile_zip_url = newZipUrl;

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

      await supabase
        .from("audit_checklist_progress")
        .delete()
        .eq("audit_id", interview.id);

      updateFloating("Complete!", 100, "success");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["interview-metadata"] });
      toast({
        title: "Submitted for Re-Audit",
        description: "The interview has been submitted for re-review.",
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      onUploadProgress?.({
        fileName: pdfFile?.name || zipFile?.name || "files",
        interviewName: interview?.file_name || "",
        fileSize: (pdfFile?.size || 0) + (zipFile?.size || 0),
        progress: 0,
        status: "error",
        errorMessage: error.message || "Upload failed",
      });
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit for re-audit.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsUploading(false);
      setUploadStatus(null);
    },
  });

  const resetForm = () => {
    setPdfFile(null);
    setZipFile(null);
    setComment("");
    setUploadStatus(null);
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
      <DialogContent className="max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto mx-2 sm:mx-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Failed Interview Details
          </DialogTitle>
          <DialogDescription>
            Review the failure reason and upload corrected artifacts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6">
          {/* Interview Info */}
          <div className="p-3 sm:p-4 bg-muted/50 rounded-lg space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-sm font-medium">Interview ID</span>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <code className="text-sm bg-background px-2 py-1 rounded break-all">
                  {interview.file_name}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => interview.file_url && window.open(interview.file_url, '_blank')}
                  disabled={!interview.file_url}
                  className="gap-1 w-full sm:w-auto"
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
              <p className="text-sm whitespace-pre-wrap">
                {interview.review_comment || "No specific reason provided."}
              </p>
            </div>
          </div>

          {/* Action Plan */}
          {interview.action_plan && (
            <div className="space-y-3">
              <h3 className="font-semibold">Action Plan</h3>
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
                <p className="text-sm whitespace-pre-wrap">{interview.action_plan}</p>
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
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  {pdfFile.name} — {formatFileSize(pdfFile.size)}
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
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  {zipFile.name} — {formatFileSize(zipFile.size)}
                </p>
              )}
            </div>

            {/* Upload Progress inside modal */}
            {uploadStatus && (
              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{uploadStatus.label}</span>
                  <span>{uploadStatus.progress}%</span>
                </div>
                <Progress value={uploadStatus.progress} className="h-2" />
              </div>
            )}

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
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (!interview || !session?.user?.id || !userRole) return;
                    setIsUploading(true);
                    try {
                      const submissionComment = comment
                        ? `Manual re-audit request: no correction needed. ${comment}`
                        : "Manual re-audit request: no correction needed";
                      const { error } = await supabase.rpc("mark_audit_for_reaudit", {
                        _audit_id: interview.id,
                        _submitted_by: session.user.id,
                        _submitted_by_role: userRole as any,
                        _comment: submissionComment,
                      });
                      if (error) throw error;
                      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
                      toast({
                        title: "Re-Audit Requested",
                        description: "The interview has been resubmitted without corrections.",
                      });
                      onOpenChange(false);
                      resetForm();
                    } catch (err: any) {
                      toast({
                        title: "Request Failed",
                        description: err.message || "Failed to request re-audit.",
                        variant: "destructive",
                      });
                    } finally {
                      setIsUploading(false);
                    }
                  }}
                  disabled={isUploading || submitMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  Request Re-Audit (No Correction)
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Use this when an interview was failed erroneously and no correction is needed. The interview will be resubmitted for review without any file changes.
              </TooltipContent>
            </Tooltip>
            <Button 
              onClick={handleSubmit} 
              disabled={isUploading || submitMutation.isPending}
              className="w-full sm:w-auto"
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
