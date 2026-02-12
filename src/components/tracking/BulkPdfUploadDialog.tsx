import { useState } from "react";
import { Upload, FileText, Check, X, AlertCircle, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface BulkPdfUploadDialogProps {
  onUploadComplete: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface PdfFile {
  file: File;
  fileName: string;
  matchedAuditId: string | null;
  matchedAuditName: string | null;
  auditStatus: string | null;
  hasExistingPdf: boolean;
  isReAudit: boolean;
  isReplacement: boolean;
  status: "pending" | "uploading" | "success" | "error" | "skipped";
  progress: number;
  errorMessage?: string;
}

export const BulkPdfUploadDialog = ({
  onUploadComplete,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: BulkPdfUploadDialogProps) => {
  const { user, userRole } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = controlledOnOpenChange || setInternalOpen;
  const MAX_VISIBLE_DEFAULT = 5;
  const CONCURRENT_UPLOADS = 5;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfOnly = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));

    if (pdfOnly.length !== files.length) {
      toast.error("Only PDF files are allowed");
    }
    if (pdfOnly.length === 0) return;

    const fileNames = pdfOnly.map((f) => f.name.replace(/\.pdf$/i, ""));

    const { data: matchingAudits, error } = await supabase
      .from("audits")
      .select("id, file_name, file_url, status")
      .in("file_name", fileNames);

    if (error) {
      toast.error("Failed to check existing audits");
      return;
    }

    const auditMap = new Map(
      matchingAudits?.map((a) => [
        a.file_name,
        { id: a.id, file_name: a.file_name, hasExistingPdf: !!a.file_url, status: a.status },
      ]) || []
    );

    const processed: PdfFile[] = pdfOnly.map((file) => {
      const fileName = file.name.replace(/\.pdf$/i, "");
      const matched = auditMap.get(fileName);

      let status: PdfFile["status"] = "pending";
      let errorMessage: string | undefined;
      let isReAudit = false;
      let isReplacement = false;

      if (!matched) {
        status = "skipped";
        errorMessage = "No matching interview found";
      } else if (matched.status === "Audit Failed") {
        isReAudit = true;
        isReplacement = matched.hasExistingPdf;
      } else if (matched.hasExistingPdf) {
        isReplacement = true;
      }

      return {
        file,
        fileName,
        matchedAuditId: matched?.id || null,
        matchedAuditName: matched?.file_name || null,
        auditStatus: matched?.status || null,
        hasExistingPdf: matched?.hasExistingPdf || false,
        isReAudit,
        isReplacement,
        status,
        progress: 0,
        errorMessage,
      };
    });

    setPdfFiles(processed);
    setVisibleCount(Math.min(MAX_VISIBLE_DEFAULT, processed.length));
    setCompletedCount(0);
  };

  const processPdfFile = async (pdfFile: PdfFile): Promise<boolean> => {
    if (!pdfFile.matchedAuditId) return false;

    try {
      setPdfFiles((prev) =>
        prev.map((f) => (f.fileName === pdfFile.fileName ? { ...f, status: "uploading" as const, progress: 30 } : f))
      );

      const timestamp = Date.now();
      const storagePath = `${pdfFile.fileName}_${timestamp}.pdf`;

      // Upload with signed URL for progress tracking
      const { data: uploadData, error: urlError } = await supabase.storage
        .from("audit-pdfs")
        .createSignedUploadUrl(storagePath);

      if (urlError) throw urlError;

      // Upload via XHR for progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 80); // 0-80% for upload
            setPdfFiles((prev) =>
              prev.map((f) => (f.fileName === pdfFile.fileName ? { ...f, progress: pct } : f))
            );
          }
        });
        xhr.addEventListener("load", () => (xhr.status === 200 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`))));
        xhr.addEventListener("error", () => reject(new Error("Upload failed")));
        xhr.open("PUT", uploadData.signedUrl);
        xhr.setRequestHeader("Content-Type", "application/pdf");
        xhr.send(pdfFile.file);
      });

      const {
        data: { publicUrl },
      } = supabase.storage.from("audit-pdfs").getPublicUrl(storagePath);

      setPdfFiles((prev) =>
        prev.map((f) => (f.fileName === pdfFile.fileName ? { ...f, progress: 90 } : f))
      );

      // Handle re-audit for failed interviews
      if (pdfFile.isReAudit && user?.id) {
        const { error: reAuditError } = await supabase.rpc("mark_audit_for_reaudit", {
          _audit_id: pdfFile.matchedAuditId,
          _submitted_by: user.id,
          _submitted_by_role: userRole as any,
          _comment: "New PDF uploaded via bulk upload",
          _new_pdf_url: publicUrl,
        });

        if (reAuditError) {
          console.error("Re-audit error:", reAuditError);
          await supabase
            .from("audits")
            .update({ file_url: publicUrl, status: "Awaiting Review", is_re_audit: true })
            .eq("id", pdfFile.matchedAuditId);
        }
      } else {
        await supabase.from("audits").update({ file_url: publicUrl }).eq("id", pdfFile.matchedAuditId);
      }

      setPdfFiles((prev) =>
        prev.map((f) => (f.fileName === pdfFile.fileName ? { ...f, status: "success" as const, progress: 100 } : f))
      );
      setCompletedCount((c) => c + 1);
      return true;
    } catch (error) {
      console.error(`Error uploading ${pdfFile.fileName}:`, error);
      setPdfFiles((prev) =>
        prev.map((f) =>
          f.fileName === pdfFile.fileName
            ? { ...f, status: "error" as const, errorMessage: error instanceof Error ? error.message : "Upload failed" }
            : f
        )
      );
      setCompletedCount((c) => c + 1);
      return false;
    }
  };

  const handleUploadClick = () => {
    const filesToUpload = pdfFiles.filter((f) => f.status === "pending");
    if (filesToUpload.length === 0) {
      toast.error("No matching files to upload");
      return;
    }
    if (reAuditCount > 0) {
      setShowConfirmDialog(true);
    } else {
      handleUpload();
    }
  };

  const handleUpload = async () => {
    setShowConfirmDialog(false);
    const filesToUpload = pdfFiles.filter((f) => f.status === "pending");
    if (filesToUpload.length === 0) return;

    setIsUploading(true);
    setCompletedCount(0);
    setStartTime(Date.now());

    let successCount = 0;
    let errorCount = 0;
    let reAuditProcessedCount = 0;

    for (let i = 0; i < filesToUpload.length; i += CONCURRENT_UPLOADS) {
      const batch = filesToUpload.slice(i, i + CONCURRENT_UPLOADS);
      const results = await Promise.allSettled(batch.map((f) => processPdfFile(f)));
      results.forEach((result, idx) => {
        if (result.status === "fulfilled" && result.value) {
          successCount++;
          if (batch[idx].isReAudit) reAuditProcessedCount++;
        } else {
          errorCount++;
        }
      });
    }

    setIsUploading(false);
    setStartTime(null);

    if (successCount > 0) {
      let msg = `Successfully uploaded ${successCount} PDF(s)`;
      if (reAuditProcessedCount > 0) msg += ` (${reAuditProcessedCount} sent for re-audit)`;
      toast.success(msg);
    }
    if (errorCount > 0) toast.error(`Failed to upload ${errorCount} file(s)`);
    if (successCount > 0) onUploadComplete();
  };

  const matchedCount = pdfFiles.filter((f) => f.matchedAuditId && f.status === "pending").length;
  const unmatchedCount = pdfFiles.filter((f) => !f.matchedAuditId).length;
  const reAuditCount = pdfFiles.filter((f) => f.isReAudit && f.status === "pending").length;
  const replacementCount = pdfFiles.filter((f) => f.isReplacement && !f.isReAudit && f.status === "pending").length;
  const newUploadCount = matchedCount - reAuditCount - replacementCount;
  const reAuditFiles = pdfFiles.filter((f) => f.isReAudit && f.status === "pending");
  const totalToUpload = pdfFiles.filter((f) => f.matchedAuditId).length;
  const overallProgress = totalToUpload > 0 ? Math.round((completedCount / totalToUpload) * 100) : 0;
  const visibleFiles = pdfFiles.slice(0, visibleCount);
  const hiddenCount = pdfFiles.length - visibleCount;

  const getStatusIcon = (f: PdfFile) => {
    if (f.status === "success") return <Check className="h-4 w-4 text-green-600" />;
    if (f.status === "error") return <X className="h-4 w-4 text-red-600" />;
    if (f.status === "skipped") return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    if (f.isReAudit) return <RefreshCw className="h-4 w-4 text-blue-600" />;
    return null;
  };

  const getStatusBadge = (f: PdfFile) => {
    switch (f.status) {
      case "pending":
        if (f.isReAudit) return <Badge className="bg-blue-100 text-blue-700">Re-Audit</Badge>;
        if (f.isReplacement) return <Badge className="bg-orange-100 text-orange-700">Replace</Badge>;
        return <Badge variant="secondary">New</Badge>;
      case "uploading":
        return <Badge className="bg-blue-100 text-blue-700">Uploading</Badge>;
      case "success":
        return <Badge className="bg-green-100 text-green-700">Complete</Badge>;
      case "error":
        return <Badge variant="destructive">{f.errorMessage || "Error"}</Badge>;
      case "skipped":
        return <Badge variant="outline" className="text-yellow-700">{f.errorMessage || "Skipped"}</Badge>;
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && isUploading) return;
    if (!open) {
      setPdfFiles([]);
      setVisibleCount(MAX_VISIBLE_DEFAULT);
      setShowConfirmDialog(false);
      setCompletedCount(0);
      setStartTime(null);
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Upload PDFs</DialogTitle>
          <DialogDescription>
            Upload PDF files to add or replace interview PDFs. Failed interviews will be sent for re-audit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="bulk-pdf-upload"
              disabled={isUploading}
            />
            <label htmlFor="bulk-pdf-upload" className="cursor-pointer flex flex-col items-center gap-2">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Click to select PDF files</span>
            </label>
          </div>

          {pdfFiles.length > 0 && (
            <div className="space-y-3">
              {/* Overall progress */}
              {isUploading && (
                <div className="space-y-1 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>Processing {completedCount} of {totalToUpload} files...</span>
                    <span>{overallProgress}%</span>
                  </div>
                  <Progress value={overallProgress} className="h-2" />
                  {startTime && (
                    <p className="text-xs text-muted-foreground">
                      Elapsed: {Math.round((Date.now() - startTime) / 1000)}s
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-sm">
                {newUploadCount > 0 && <Badge variant="secondary">{newUploadCount} new</Badge>}
                {replacementCount > 0 && <Badge className="bg-orange-100 text-orange-700">{replacementCount} replace</Badge>}
                {reAuditCount > 0 && <Badge className="bg-blue-100 text-blue-700">{reAuditCount} re-audit</Badge>}
                {unmatchedCount > 0 && <Badge variant="outline" className="text-yellow-700">{unmatchedCount} unmatched</Badge>}
              </div>

              {pdfFiles.length > MAX_VISIBLE_DEFAULT && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <Label>Showing {visibleCount} of {pdfFiles.length} files</Label>
                  </div>
                  <Slider
                    value={[visibleCount]}
                    onValueChange={(v) => setVisibleCount(v[0])}
                    min={1}
                    max={pdfFiles.length}
                    step={1}
                    className="py-2"
                  />
                </div>
              )}

              <ScrollArea className="h-[250px]">
                <ul className="space-y-2 pr-4">
                  {visibleFiles.map((pdfFile, index) => (
                    <li key={index} className="space-y-1 p-2 rounded-lg bg-muted/20">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {getStatusIcon(pdfFile)}
                          <span className="text-sm truncate">{pdfFile.file.name}</span>
                        </div>
                        {getStatusBadge(pdfFile)}
                      </div>
                      {pdfFile.auditStatus && pdfFile.status === "pending" && (
                        <div className="text-xs text-muted-foreground pl-6">Current status: {pdfFile.auditStatus}</div>
                      )}
                      {pdfFile.status === "uploading" && <Progress value={pdfFile.progress} className="h-1.5" />}
                    </li>
                  ))}
                </ul>
              </ScrollArea>

              {hiddenCount > 0 && (
                <p className="text-sm text-muted-foreground text-center">+{hiddenCount} more file(s) not shown</p>
              )}
            </div>
          )}

          <Button onClick={handleUploadClick} disabled={isUploading || matchedCount === 0} className="w-full">
            {isUploading ? `Uploading ${completedCount}/${totalToUpload}...` : `Upload ${matchedCount} PDF(s)`}
          </Button>
        </div>

        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Bulk PDF Upload</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>You are about to upload {matchedCount} PDF file(s). This action will:</p>
                  <ul className="space-y-2 text-sm">
                    {newUploadCount > 0 && (
                      <li className="flex items-center gap-2">
                        <Badge variant="secondary" className="shrink-0">{newUploadCount}</Badge>
                        <span>Add new PDFs to interviews</span>
                      </li>
                    )}
                    {replacementCount > 0 && (
                      <li className="flex items-center gap-2">
                        <Badge className="bg-orange-100 text-orange-700 shrink-0">{replacementCount}</Badge>
                        <span>Replace existing PDFs</span>
                      </li>
                    )}
                    {reAuditCount > 0 && (
                      <li className="flex items-center gap-2">
                        <Badge className="bg-blue-100 text-blue-700 shrink-0">{reAuditCount}</Badge>
                        <span className="font-medium">Send failed interviews for re-audit</span>
                      </li>
                    )}
                  </ul>
                  {reAuditCount > 0 && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                        Re-audit interviews ({reAuditCount}):
                      </p>
                      <ScrollArea className="max-h-[120px]">
                        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                          {reAuditFiles.map((file, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                              <RefreshCw className="h-3 w-3 shrink-0" />
                              <span className="truncate">{file.fileName}</span>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleUpload}>Confirm Upload</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};
