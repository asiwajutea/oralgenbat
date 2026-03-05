import { useState } from "react";
import { Upload, FileArchive, Check, X, AlertCircle } from "lucide-react";
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

interface BulkZipUploadDialogProps {
  onUploadComplete: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface ZipFile {
  file: File;
  fileName: string;
  matchedAuditId: string | null;
  matchedAuditName: string | null;
  status: "pending" | "uploading" | "processing" | "success" | "error" | "skipped";
  progress: number;
  errorMessage?: string;
}

export const BulkZipUploadDialog = ({ 
  onUploadComplete, 
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange
}: BulkZipUploadDialogProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [zipFiles, setZipFiles] = useState<ZipFile[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = controlledOnOpenChange || setInternalOpen;

  const MAX_VISIBLE_DEFAULT = 5;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const zipFilesOnly = files.filter((file) => 
      file.name.toLowerCase().endsWith('.zip')
    );
    
    if (zipFilesOnly.length !== files.length) {
      toast.error("Only ZIP files are allowed");
    }

    // Validate interview naming format
    const invalidFiles = zipFilesOnly.filter(f => !isValidInterviewName(f.name.replace(/\.zip$/i, "")));
    if (invalidFiles.length > 0) {
      toast.error(`Invalid filename(s): ${invalidFiles.map(f => f.name).slice(0, 3).join(", ")}${invalidFiles.length > 3 ? ` and ${invalidFiles.length - 3} more` : ""}. Expected format: NGXX_XXX_XXXXXXXX_XXXX (e.g. NG71_650_20250702_1233)`);
    }
    const validZips = zipFilesOnly.filter(f => isValidInterviewName(f.name.replace(/\.zip$/i, "")));

    if (validZips.length === 0) return;

    // Extract file names and match with existing audits
    const fileNames = validZips.map(f => f.name.replace(/\.zip$/i, ''));
    
    // Fetch matching audits from database
    const { data: matchingAudits, error } = await supabase
      .from("audits")
      .select("id, file_name, mobile_zip_url")
      .in("file_name", fileNames);

    if (error) {
      toast.error("Failed to check existing audits");
      return;
    }

    const auditMap = new Map(matchingAudits?.map(a => [a.file_name, { 
      id: a.id, 
      file_name: a.file_name, 
      hasMetadata: !!a.mobile_zip_url 
    }]) || []);

    const processedFiles: ZipFile[] = validZips.map(file => {
      const fileName = file.name.replace(/\.zip$/i, '');
      const matchedAudit = auditMap.get(fileName);
      
      // Determine status: skip if no match or if metadata already exists
      let status: ZipFile["status"] = "pending";
      let errorMessage: string | undefined;
      
      if (!matchedAudit) {
        status = "skipped";
        errorMessage = "No matching PDF found";
      } else if (matchedAudit.hasMetadata) {
        status = "skipped";
        errorMessage = "Metadata already uploaded";
      }
      
      return {
        file,
        fileName,
        matchedAuditId: matchedAudit?.id || null,
        matchedAuditName: matchedAudit?.file_name || null,
        status,
        progress: 0,
        errorMessage,
      };
    });

    setZipFiles(processedFiles);
    setVisibleCount(Math.min(MAX_VISIBLE_DEFAULT, processedFiles.length));
  };

  const CONCURRENT_UPLOADS = 5;

  const processZipFile = async (zipFile: ZipFile): Promise<boolean> => {
    if (!zipFile.matchedAuditId) return false;

    try {
      // Update status to uploading
      setZipFiles(prev => prev.map(f => 
        f.fileName === zipFile.fileName 
          ? { ...f, status: "uploading" as const }
          : f
      ));

      const filePath = `${zipFile.matchedAuditId}/${zipFile.file.name}`;

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from("mobile-zips")
        .upload(filePath, zipFile.file, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'application/zip',
        });

      if (uploadError) throw uploadError;

      // Update progress
      setZipFiles(prev => prev.map(f => 
        f.fileName === zipFile.fileName 
          ? { ...f, progress: 50 }
          : f
      ));

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("mobile-zips")
        .getPublicUrl(filePath);

      // Update audit record
      await supabase
        .from('audits')
        .update({
          mobile_zip_url: publicUrl,
          mobile_zip_uploaded_at: new Date().toISOString(),
        })
        .eq('id', zipFile.matchedAuditId);

      // Update status to processing
      setZipFiles(prev => prev.map(f => 
        f.fileName === zipFile.fileName 
          ? { ...f, status: "processing" as const, progress: 75 }
          : f
      ));

      // Process the ZIP (no artificial delay)
      const { error: processError } = await supabase.functions.invoke('process-mobile-zip', {
        body: { auditId: zipFile.matchedAuditId, mobileZipUrl: publicUrl }
      });

      if (processError) {
        throw new Error(`Processing failed for "${zipFile.fileName}.zip"`);
      }

      // Success
      setZipFiles(prev => prev.map(f => 
        f.fileName === zipFile.fileName 
          ? { ...f, status: "success" as const, progress: 100 }
          : f
      ));
      return true;

    } catch (error) {
      console.error(`Error uploading ${zipFile.fileName}:`, error);
      setZipFiles(prev => prev.map(f => 
        f.fileName === zipFile.fileName 
          ? { 
              ...f, 
              status: "error" as const, 
              errorMessage: error instanceof Error ? error.message : "Upload failed"
            }
          : f
      ));
      return false;
    }
  };

  const handleUpload = async () => {
    const filesToUpload = zipFiles.filter(f => f.status === "pending");
    
    if (filesToUpload.length === 0) {
      toast.error("No matching files to upload");
      return;
    }

    setIsUploading(true);

    let successCount = 0;
    let errorCount = 0;

    // Process in batches of CONCURRENT_UPLOADS
    for (let i = 0; i < filesToUpload.length; i += CONCURRENT_UPLOADS) {
      const batch = filesToUpload.slice(i, i + CONCURRENT_UPLOADS);
      
      const results = await Promise.allSettled(
        batch.map(zipFile => processZipFile(zipFile))
      );

      results.forEach(result => {
        if (result.status === "fulfilled" && result.value) {
          successCount++;
        } else {
          errorCount++;
        }
      });
    }

    setIsUploading(false);

    if (successCount > 0) {
      toast.success(`Successfully processed ${successCount} file(s)`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to process ${errorCount} file(s)`);
    }

    if (successCount > 0) {
      onUploadComplete();
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setZipFiles([]);
      setVisibleCount(MAX_VISIBLE_DEFAULT);
      setIsOpen(false);
    }
  };

  const getStatusIcon = (status: ZipFile["status"]) => {
    switch (status) {
      case "success":
        return <Check className="h-4 w-4 text-green-600" />;
      case "error":
        return <X className="h-4 w-4 text-red-600" />;
      case "skipped":
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (zipFile: ZipFile) => {
    switch (zipFile.status) {
      case "pending":
        return <Badge variant="secondary">Ready</Badge>;
      case "uploading":
        return <Badge className="bg-blue-100 text-blue-700">Uploading</Badge>;
      case "processing":
        return <Badge className="bg-purple-100 text-purple-700">Processing</Badge>;
      case "success":
        return <Badge className="bg-green-100 text-green-700">Complete</Badge>;
      case "error":
        return <Badge variant="destructive">{zipFile.errorMessage || "Error"}</Badge>;
      case "skipped":
        return <Badge variant="outline" className="text-yellow-700">{zipFile.errorMessage || "Skipped"}</Badge>;
    }
  };

  const matchedCount = zipFiles.filter(f => f.matchedAuditId).length;
  const unmatchedCount = zipFiles.filter(f => !f.matchedAuditId).length;
  const visibleFiles = zipFiles.slice(0, visibleCount);
  const hiddenCount = zipFiles.length - visibleCount;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Upload ZIP Files</DialogTitle>
          <DialogDescription>
            Upload multiple ZIP files for PDFs that are already in the system
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".zip"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="bulk-zip-upload"
              disabled={isUploading}
            />
            <label
              htmlFor="bulk-zip-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <FileArchive className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Click to select ZIP files
              </span>
            </label>
          </div>

          {zipFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {matchedCount} matched, {unmatchedCount} unmatched
                </p>
              </div>

              {zipFiles.length > MAX_VISIBLE_DEFAULT && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <Label>Showing {visibleCount} of {zipFiles.length} files</Label>
                  </div>
                  <Slider
                    value={[visibleCount]}
                    onValueChange={(v) => setVisibleCount(v[0])}
                    min={1}
                    max={zipFiles.length}
                    step={1}
                    className="py-2"
                  />
                </div>
              )}

              <ScrollArea className="h-[250px]">
                <ul className="space-y-2 pr-4">
                  {visibleFiles.map((zipFile, index) => (
                    <li key={index} className="space-y-1 p-2 rounded-lg bg-muted/20">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {getStatusIcon(zipFile.status)}
                          <span className="text-sm truncate">{zipFile.file.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {getStatusBadge(zipFile)}
                          {!isUploading && zipFile.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => setZipFiles(prev => prev.filter(f => f.fileName !== zipFile.fileName))}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {(zipFile.status === "uploading" || zipFile.status === "processing") && (
                        <Progress value={zipFile.progress} className="h-1.5" />
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
            disabled={isUploading || matchedCount === 0}
            className="w-full"
          >
            {isUploading ? "Processing..." : `Upload ${matchedCount} File(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
