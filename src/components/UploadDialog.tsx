import { useState } from "react";
import { isValidInterviewName } from "@/lib/utils";
import { compressPdf, shouldCompressPdf, formatFileSize } from "@/utils/compressPdf";
import { Upload } from "lucide-react";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface UploadDialogProps {
  onUploadComplete: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onUploadProgress?: (progress: import("@/components/FloatingUploadProgress").UploadProgressData | null) => void;
}

export const UploadDialog = ({ 
  onUploadComplete, 
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onUploadProgress,
}: UploadDialogProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [visibleCount, setVisibleCount] = useState(5);
  const [completedFileCount, setCompletedFileCount] = useState(0);
  const [compressionStatus, setCompressionStatus] = useState<string>("");

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = controlledOnOpenChange || setInternalOpen;

  const MAX_VISIBLE_DEFAULT = 5;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfFiles = files.filter((file) => file.type === "application/pdf");
    
    if (pdfFiles.length !== files.length) {
      toast.error("Only PDF files are allowed");
    }

    // Validate interview naming format
    const invalidFiles = pdfFiles.filter(f => !isValidInterviewName(f.name.replace(/\.pdf$/i, "")));
    if (invalidFiles.length > 0) {
      toast.error(`Invalid filename(s): ${invalidFiles.map(f => f.name).slice(0, 3).join(", ")}${invalidFiles.length > 3 ? ` and ${invalidFiles.length - 3} more` : ""}. Expected format: NGXX_XXX_XXXXXXXX_XXXX (e.g. NG71_650_20250702_1233)`);
    }
    const validFiles = pdfFiles.filter(f => isValidInterviewName(f.name.replace(/\.pdf$/i, "")));
    
    setSelectedFiles(validFiles);
    setVisibleCount(Math.min(MAX_VISIBLE_DEFAULT, validFiles.length));
  };

  const uploadFileWithProgress = async (
    file: File,
    storagePath: string
  ): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      try {
        // Get signed upload URL
        const { data: uploadData, error: urlError } = await supabase.storage
          .from("audit-pdfs")
          .createSignedUploadUrl(storagePath);

        if (urlError) throw urlError;

        // Upload with progress tracking
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress((prev) => ({
              ...prev,
              [file.name]: percent,
            }));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 200) {
            // Get public URL
            const { data: { publicUrl } } = supabase.storage
              .from("audit-pdfs")
              .getPublicUrl(storagePath);
            resolve(publicUrl);
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Upload failed")));

        xhr.open("PUT", uploadData.signedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      } catch (error) {
        reject(error);
      }
    });
  };

  const checkForDuplicates = async (files: File[]) => {
    const fileNames = files.map(file => file.name.replace(/\.pdf$/i, ""));
    
    const { data: existingAudits, error } = await supabase
      .from("audits")
      .select("file_name")
      .in("file_name", fileNames);

    if (error) throw error;

    const existingFileNames = new Set(existingAudits?.map(audit => audit.file_name) || []);
    const duplicates = fileNames.filter(name => existingFileNames.has(name));
    const validFiles = files.filter(file => {
      const fileName = file.name.replace(/\.pdf$/i, "");
      return !existingFileNames.has(fileName);
    });

    return { duplicates, validFiles };
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Please select at least one PDF file");
      return;
    }

    setIsUploading(true);
    setUploadProgress({});
    setCompletedFileCount(0);

    try {
      // Check for duplicates
      const { duplicates, validFiles } = await checkForDuplicates(selectedFiles);

      // If all files are duplicates, show error and stop
      if (duplicates.length > 0 && validFiles.length === 0) {
        toast.error(`Interview already exists: ${duplicates.join(", ")}`);
        setIsUploading(false);
        return;
      }

      // If some files are duplicates, show warning
      if (duplicates.length > 0) {
        toast.error(`Skipping existing interviews: ${duplicates.join(", ")}`);
      }

      // Upload only valid files
      let completedFiles = 0;
      const totalSize = validFiles.reduce((s, f) => s + f.size, 0);
      
      for (let i = 0; i < validFiles.length; i++) {
        let file = validFiles[i];
        const fileName = file.name.replace(/\.pdf$/i, "");
        const timestamp = Date.now();
        const storagePath = `${fileName}_${timestamp}.pdf`;

        // Update floating progress
        onUploadProgress?.({
          fileName: `${i + 1}/${validFiles.length} files`,
          interviewName: "PDF Upload",
          fileSize: totalSize,
          progress: Math.round((i / validFiles.length) * 100),
          status: "uploading",
        });

        // Compress large PDFs before upload
        if (shouldCompressPdf(file)) {
          const originalSize = formatFileSize(file.size);
          setCompressionStatus(`Compressing ${i + 1}/${validFiles.length}...`);
          try {
            file = await compressPdf(file, (msg) => setCompressionStatus(msg));
            const compressedSize = formatFileSize(file.size);
            toast.info(`${fileName}: ${originalSize} → ${compressedSize}`);
          } catch (err) {
            console.error("Compression failed, uploading original:", err);
            toast.error(`Compression failed for ${fileName}, uploading original`);
          }
          setCompressionStatus("");
        }

        // Upload with progress tracking
        const publicUrl = await uploadFileWithProgress(file, storagePath);

        // Insert into database
        const { error: dbError } = await supabase.from("audits").insert({
          file_name: fileName,
          file_url: publicUrl,
          status: "Pending",
        });

        if (dbError) throw dbError;
        completedFiles++;
        setCompletedFileCount(completedFiles);
      }

      if (validFiles.length > 0) {
        toast.success(`Successfully uploaded ${validFiles.length} file(s)`);
        onUploadProgress?.({
          fileName: `${validFiles.length} files`,
          interviewName: "PDF Upload",
          fileSize: totalSize,
          progress: 100,
          status: "success",
        });
      }
      
      setSelectedFiles([]);
      setUploadProgress({});
      setVisibleCount(MAX_VISIBLE_DEFAULT);
      setIsOpen(false);
      onUploadComplete();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload files");
      onUploadProgress?.({
        fileName: "Upload failed",
        interviewName: "PDF Upload",
        fileSize: 0,
        progress: 0,
        status: "error",
        errorMessage: "Failed to upload files",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const visibleFiles = selectedFiles.slice(0, visibleCount);
  const hiddenCount = selectedFiles.length - visibleCount;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload PDF Files</DialogTitle>
          <DialogDescription>
            Select one or more PDF files to upload for audit
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
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Click to select PDF files
              </span>
            </label>
          </div>

          {selectedFiles.length > 0 && (
            <div className="space-y-3">
              {/* Overall progress during upload */}
              {isUploading && selectedFiles.length > 1 && (
                <div className="space-y-1 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>Uploading {completedFileCount + 1} of {selectedFiles.length} file(s)...</span>
                    <span>{Math.round((completedFileCount / selectedFiles.length) * 100)}%</span>
                  </div>
                  <Progress value={(completedFileCount / selectedFiles.length) * 100} className="h-2" />
                </div>
              )}

              <p className="text-sm font-medium">
                {isUploading
                  ? compressionStatus || `Uploading ${completedFileCount + 1} of ${selectedFiles.length} file(s)...`
                  : `Selected ${selectedFiles.length} file(s):`}
              </p>

              {/* Slider for controlling visible files when many are selected */}
              {selectedFiles.length > MAX_VISIBLE_DEFAULT && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <Label>Showing {visibleCount} of {selectedFiles.length} files</Label>
                  </div>
                  <Slider
                    value={[visibleCount]}
                    onValueChange={(v) => setVisibleCount(v[0])}
                    min={1}
                    max={selectedFiles.length}
                    step={1}
                    className="py-2"
                  />
                </div>
              )}

              <ul className="space-y-3 max-h-[200px] overflow-y-auto">
                {visibleFiles.map((file, index) => (
                  <li key={index} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate flex-1">{file.name}</span>
                      {uploadProgress[file.name] !== undefined && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {uploadProgress[file.name]}%
                        </span>
                      )}
                    </div>
                    {uploadProgress[file.name] !== undefined && (
                      <Progress value={uploadProgress[file.name]} className="h-2" />
                    )}
                  </li>
                ))}
              </ul>

              {hiddenCount > 0 && (
                <p className="text-sm text-muted-foreground text-center">
                  +{hiddenCount} more file(s) not shown
                </p>
              )}
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={isUploading || selectedFiles.length === 0}
            className="w-full"
          >
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};