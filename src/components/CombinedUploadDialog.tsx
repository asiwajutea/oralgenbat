import { useState } from "react";
import { Upload, FileText, FileArchive, Check, X, AlertCircle, Link2 } from "lucide-react";
import { compressPdf, shouldCompressPdf, formatFileSize } from "@/utils/compressPdf";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { isValidInterviewName } from "@/lib/utils";

interface CombinedUploadDialogProps {
  onUploadComplete: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onUploadProgress?: (progress: import("@/components/FloatingUploadProgress").UploadProgressData | null) => void;
}

interface FilePair {
  pdfFile: File | null;
  zipFile: File | null;
  fileName: string;
  status: "pending" | "uploading-pdf" | "uploading-zip" | "processing" | "success" | "error";
  progress: number;
  errorMessage?: string;
}

export const CombinedUploadDialog = ({ 
  onUploadComplete, 
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onUploadProgress,
}: CombinedUploadDialogProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [zipFiles, setZipFiles] = useState<File[]>([]);
  const [filePairs, setFilePairs] = useState<FilePair[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = controlledOnOpenChange || setInternalOpen;

  const MAX_VISIBLE_DEFAULT = 5;

  const updateFilePairs = (pdfs: File[], zips: File[]) => {
    const pdfMap = new Map<string, File>();
    const zipMap = new Map<string, File>();

    pdfs.forEach(f => {
      const name = f.name.replace(/\.pdf$/i, '');
      pdfMap.set(name, f);
    });

    zips.forEach(f => {
      const name = f.name.replace(/\.zip$/i, '');
      zipMap.set(name, f);
    });

    // Get all unique file names
    const allNames = new Set([...pdfMap.keys(), ...zipMap.keys()]);
    
    const pairs: FilePair[] = Array.from(allNames).map(name => ({
      pdfFile: pdfMap.get(name) || null,
      zipFile: zipMap.get(name) || null,
      fileName: name,
      status: "pending",
      progress: 0,
    }));

    // Sort: paired files first, then PDF only, then ZIP only
    pairs.sort((a, b) => {
      const aScore = (a.pdfFile ? 2 : 0) + (a.zipFile ? 1 : 0);
      const bScore = (b.pdfFile ? 2 : 0) + (b.zipFile ? 1 : 0);
      return bScore - aScore;
    });

    setFilePairs(pairs);
    setVisibleCount(Math.min(MAX_VISIBLE_DEFAULT, pairs.length));
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfFilesOnly = files.filter((file) => file.type === "application/pdf");
    
    if (pdfFilesOnly.length !== files.length) {
      toast.error("Only PDF files are allowed in this section");
    }

    // Validate interview naming format
    const invalidFiles = pdfFilesOnly.filter(f => !isValidInterviewName(f.name.replace(/\.pdf$/i, "")));
    if (invalidFiles.length > 0) {
      toast.error(`Invalid filename(s): ${invalidFiles.map(f => f.name).slice(0, 3).join(", ")}${invalidFiles.length > 3 ? ` and ${invalidFiles.length - 3} more` : ""}. Expected format: NGXX_XXX_XXXXXXXX_XXXX (e.g. NG71_650_20250702_1233)`);
    }
    const validPdfs = pdfFilesOnly.filter(f => isValidInterviewName(f.name.replace(/\.pdf$/i, "")));

    setPdfFiles(validPdfs);
    updateFilePairs(validPdfs, zipFiles);
  };

  const handleZipSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const zipFilesOnly = files.filter((file) => 
      file.name.toLowerCase().endsWith('.zip')
    );
    
    if (zipFilesOnly.length !== files.length) {
      toast.error("Only ZIP files are allowed in this section");
    }

    // Validate interview naming format
    const invalidFiles = zipFilesOnly.filter(f => !isValidInterviewName(f.name.replace(/\.zip$/i, "")));
    if (invalidFiles.length > 0) {
      toast.error(`Invalid filename(s): ${invalidFiles.map(f => f.name).slice(0, 3).join(", ")}${invalidFiles.length > 3 ? ` and ${invalidFiles.length - 3} more` : ""}. Expected format: NGXX_XXX_XXXXXXXX_XXXX (e.g. NG71_650_20250702_1233)`);
    }
    const validZips = zipFilesOnly.filter(f => isValidInterviewName(f.name.replace(/\.zip$/i, "")));

    setZipFiles(validZips);
    updateFilePairs(pdfFiles, validZips);
  };

  const checkForDuplicates = async (fileNames: string[]) => {
    const { data: existingAudits, error } = await supabase
      .from("audits")
      .select("file_name")
      .in("file_name", fileNames);

    if (error) throw error;
    return new Set(existingAudits?.map(a => a.file_name) || []);
  };

  const CONCURRENT_UPLOADS = 5;

  const processFilePair = async (pair: FilePair, existingNames: Set<string>): Promise<{ success: boolean; skipped: boolean }> => {
    if (existingNames.has(pair.fileName)) {
      setFilePairs(prev => prev.map(p => 
        p.fileName === pair.fileName 
          ? { ...p, status: "error" as const, errorMessage: "Interview already exists" }
          : p
      ));
      return { success: false, skipped: true };
    }

    if (!pair.pdfFile) return { success: false, skipped: false };

    try {
      let pdfFileToUpload: File = pair.pdfFile;

      // Compress large PDFs before upload
      if (shouldCompressPdf(pair.pdfFile)) {
        const originalSize = formatFileSize(pair.pdfFile.size);
        setFilePairs(prev => prev.map(p => 
          p.fileName === pair.fileName 
            ? { ...p, status: "uploading-pdf" as const, progress: 5 }
            : p
        ));
        try {
          pdfFileToUpload = await compressPdf(pair.pdfFile);
          const compressedSize = formatFileSize(pdfFileToUpload.size);
          toast.info(`${pair.fileName}: ${originalSize} → ${compressedSize}`);
        } catch (err) {
          console.error("Compression failed, uploading original:", err);
          toast.error(`Compression failed for ${pair.fileName}, uploading original`);
        }
      }

      // Upload PDF
      setFilePairs(prev => prev.map(p => 
        p.fileName === pair.fileName 
          ? { ...p, status: "uploading-pdf" as const, progress: 10 }
          : p
      ));

      const timestamp = Date.now();
      const pdfStoragePath = `${pair.fileName}_${timestamp}.pdf`;

      const { error: pdfUploadError } = await supabase.storage
        .from("audit-pdfs")
        .upload(pdfStoragePath, pdfFileToUpload);

      if (pdfUploadError) throw pdfUploadError;

      const { data: { publicUrl: pdfPublicUrl } } = supabase.storage
        .from("audit-pdfs")
        .getPublicUrl(pdfStoragePath);

      setFilePairs(prev => prev.map(p => 
        p.fileName === pair.fileName 
          ? { ...p, progress: 30 }
          : p
      ));

      // Create audit record
      const { data: auditRecord, error: dbError } = await supabase
        .from("audits")
        .insert({
          file_name: pair.fileName,
          file_url: pdfPublicUrl,
          status: "Pending",
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // If ZIP exists, upload and process it
      if (pair.zipFile) {
        setFilePairs(prev => prev.map(p => 
          p.fileName === pair.fileName 
            ? { ...p, status: "uploading-zip" as const, progress: 50 }
            : p
        ));

        const zipFilePath = `${auditRecord.id}/${pair.zipFile.name}`;

        const { error: zipUploadError } = await supabase.storage
          .from("mobile-zips")
          .upload(zipFilePath, pair.zipFile, {
            cacheControl: '3600',
            upsert: true,
            contentType: 'application/zip',
          });

        if (zipUploadError) throw zipUploadError;

        const { data: { publicUrl: zipPublicUrl } } = supabase.storage
          .from("mobile-zips")
          .getPublicUrl(zipFilePath);

        // Update audit with ZIP URL
        await supabase
          .from('audits')
          .update({
            mobile_zip_url: zipPublicUrl,
            mobile_zip_uploaded_at: new Date().toISOString(),
          })
          .eq('id', auditRecord.id);

        setFilePairs(prev => prev.map(p => 
          p.fileName === pair.fileName 
            ? { ...p, status: "processing" as const, progress: 70 }
            : p
        ));

        // Process the ZIP (no artificial delay)
        const { error: processError } = await supabase.functions.invoke('process-mobile-zip', {
          body: { auditId: auditRecord.id, mobileZipUrl: zipPublicUrl }
        });

        if (processError) {
          console.error(`Error processing ZIP for ${pair.fileName}:`, processError);
          toast.error(`ZIP processing failed for "${pair.fileName}.zip". PDF was uploaded successfully.`);
        }
      }

      setFilePairs(prev => prev.map(p => 
        p.fileName === pair.fileName 
          ? { ...p, status: "success" as const, progress: 100 }
          : p
      ));
      return { success: true, skipped: false };

    } catch (error) {
      console.error(`Error uploading ${pair.fileName}:`, error);
      setFilePairs(prev => prev.map(p => 
        p.fileName === pair.fileName 
          ? { 
              ...p, 
              status: "error" as const, 
              errorMessage: error instanceof Error ? error.message : "Upload failed"
            }
          : p
      ));
      return { success: false, skipped: false };
    }
  };

  const handleUpload = async () => {
    const pairsToUpload = filePairs.filter(p => p.pdfFile);
    
    if (pairsToUpload.length === 0) {
      toast.error("Please select at least one PDF file");
      return;
    }

    setIsUploading(true);
    const totalSize = pairsToUpload.reduce((s, p) => s + (p.pdfFile?.size || 0) + (p.zipFile?.size || 0), 0);

    try {
      const fileNames = pairsToUpload.map(p => p.fileName);
      const existingNames = await checkForDuplicates(fileNames);

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < pairsToUpload.length; i += CONCURRENT_UPLOADS) {
        const batch = pairsToUpload.slice(i, i + CONCURRENT_UPLOADS);
        
        const results = await Promise.allSettled(
          batch.map(pair => processFilePair(pair, existingNames))
        );

        results.forEach(result => {
          if (result.status === "fulfilled") {
            if (result.value.success) successCount++;
            else if (result.value.skipped) skippedCount++;
            else errorCount++;
          } else {
            errorCount++;
          }
        });

        const done = Math.min(i + batch.length, pairsToUpload.length);
        const pct = Math.round((done / pairsToUpload.length) * 100);
        onUploadProgress?.({
          fileName: `${done}/${pairsToUpload.length} pairs`,
          interviewName: "Combined Upload",
          fileSize: totalSize,
          progress: pct,
          status: pct >= 100 ? "success" : "uploading",
        });
      }

      if (successCount > 0) toast.success(`Successfully uploaded ${successCount} interview(s)`);
      if (skippedCount > 0) toast.warning(`Skipped ${skippedCount} existing interview(s)`);
      if (errorCount > 0) toast.error(`Failed to upload ${errorCount} interview(s)`);

      if (successCount > 0) {
        onUploadProgress?.({
          fileName: `${successCount} interviews`,
          interviewName: "Combined Upload",
          fileSize: totalSize,
          progress: 100,
          status: "success",
        });
        onUploadComplete();
      } else if (errorCount > 0) {
        onUploadProgress?.({
          fileName: `${errorCount} failed`,
          interviewName: "Combined Upload",
          fileSize: totalSize,
          progress: 0,
          status: "error",
          errorMessage: `${errorCount} interview(s) failed`,
        });
      }

    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload files");
      onUploadProgress?.({
        fileName: "Upload failed",
        interviewName: "Combined Upload",
        fileSize: totalSize,
        progress: 0,
        status: "error",
        errorMessage: "Failed to upload files",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setPdfFiles([]);
      setZipFiles([]);
      setFilePairs([]);
      setVisibleCount(MAX_VISIBLE_DEFAULT);
      setIsOpen(false);
    }
  };

  const getStatusIcon = (pair: FilePair) => {
    switch (pair.status) {
      case "success":
        return <Check className="h-4 w-4 text-green-600" />;
      case "error":
        return <X className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (pair: FilePair) => {
    switch (pair.status) {
      case "pending":
        return <Badge variant="secondary">Ready</Badge>;
      case "uploading-pdf":
        return <Badge className="bg-blue-100 text-blue-700">Uploading PDF</Badge>;
      case "uploading-zip":
        return <Badge className="bg-blue-100 text-blue-700">Uploading ZIP</Badge>;
      case "processing":
        return <Badge className="bg-purple-100 text-purple-700">Processing</Badge>;
      case "success":
        return <Badge className="bg-green-100 text-green-700">Complete</Badge>;
      case "error":
        return <Badge variant="destructive">{pair.errorMessage || "Error"}</Badge>;
    }
  };

  const getPairIndicator = (pair: FilePair) => {
    if (pair.pdfFile && pair.zipFile) {
      return (
        <div className="flex items-center gap-1 text-green-600">
          <Link2 className="h-3 w-3" />
          <span className="text-xs">Paired</span>
        </div>
      );
    } else if (pair.pdfFile && !pair.zipFile) {
      return (
        <div className="flex items-center gap-1 text-yellow-600">
          <FileText className="h-3 w-3" />
          <span className="text-xs">PDF only</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center gap-1 text-red-600">
          <AlertCircle className="h-3 w-3" />
          <span className="text-xs">ZIP only (skipped)</span>
        </div>
      );
    }
  };

  const pairedCount = filePairs.filter(p => p.pdfFile && p.zipFile).length;
  const pdfOnlyCount = filePairs.filter(p => p.pdfFile && !p.zipFile).length;
  const zipOnlyCount = filePairs.filter(p => !p.pdfFile && p.zipFile).length;
  const uploadableCount = filePairs.filter(p => p.pdfFile).length;
  const visiblePairs = filePairs.slice(0, visibleCount);
  const hiddenCount = filePairs.length - visibleCount;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload PDFs + Metadata</DialogTitle>
          <DialogDescription>
            Upload PDF files and their corresponding ZIP metadata files together
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* PDF Selection */}
          <div className="border-2 border-dashed rounded-lg p-4 text-center">
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={handlePdfSelect}
              className="hidden"
              id="combined-pdf-upload"
              disabled={isUploading}
            />
            <label
              htmlFor="combined-pdf-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <FileText className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {pdfFiles.length > 0 
                  ? `${pdfFiles.length} PDF(s) selected` 
                  : "Click to select PDF files"}
              </span>
            </label>
          </div>

          {/* ZIP Selection */}
          <div className="border-2 border-dashed rounded-lg p-4 text-center">
            <input
              type="file"
              accept=".zip"
              multiple
              onChange={handleZipSelect}
              className="hidden"
              id="combined-zip-upload"
              disabled={isUploading}
            />
            <label
              htmlFor="combined-zip-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <FileArchive className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {zipFiles.length > 0 
                  ? `${zipFiles.length} ZIP(s) selected` 
                  : "Click to select ZIP files (optional)"}
              </span>
            </label>
          </div>

          {filePairs.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                {pairedCount > 0 && (
                  <Badge className="bg-green-100 text-green-700">{pairedCount} paired</Badge>
                )}
                {pdfOnlyCount > 0 && (
                  <Badge className="bg-yellow-100 text-yellow-700">{pdfOnlyCount} PDF only</Badge>
                )}
                {zipOnlyCount > 0 && (
                  <Badge variant="outline" className="text-red-600">{zipOnlyCount} ZIP only (skipped)</Badge>
                )}
              </div>

              {filePairs.length > MAX_VISIBLE_DEFAULT && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <Label>Showing {visibleCount} of {filePairs.length} files</Label>
                  </div>
                  <Slider
                    value={[visibleCount]}
                    onValueChange={(v) => setVisibleCount(v[0])}
                    min={1}
                    max={filePairs.length}
                    step={1}
                    className="py-2"
                  />
                </div>
              )}

              <ScrollArea className="h-[200px]">
                <ul className="space-y-2 pr-4">
                  {visiblePairs.map((pair, index) => (
                    <li key={index} className="space-y-1 p-2 rounded-lg bg-muted/20">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {getStatusIcon(pair)}
                          <span className="text-sm truncate font-mono">{pair.fileName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {pair.status === "pending" ? getPairIndicator(pair) : getStatusBadge(pair)}
                          {!isUploading && pair.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => {
                                setFilePairs(prev => prev.filter(p => p.fileName !== pair.fileName));
                                setPdfFiles(prev => prev.filter(f => f.name.replace(/\.pdf$/i, '') !== pair.fileName));
                                setZipFiles(prev => prev.filter(f => f.name.replace(/\.zip$/i, '') !== pair.fileName));
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {(pair.status === "uploading-pdf" || pair.status === "uploading-zip" || pair.status === "processing") && (
                        <Progress value={pair.progress} className="h-1.5" />
                      )}
                    </li>
                  ))}
                </ul>
              </ScrollArea>

              {hiddenCount > 0 && (
                <p className="text-sm text-muted-foreground text-center">
                  +{hiddenCount} more file(s) not shown
                </p>
              )}
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={isUploading || uploadableCount === 0}
            className="w-full"
          >
            {isUploading ? "Uploading..." : `Upload ${uploadableCount} Interview(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
