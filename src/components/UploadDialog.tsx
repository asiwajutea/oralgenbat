import { useState } from "react";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface UploadDialogProps {
  onUploadComplete: () => void;
}

export const UploadDialog = ({ onUploadComplete }: UploadDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfFiles = files.filter((file) => file.type === "application/pdf");
    
    if (pdfFiles.length !== files.length) {
      toast.error("Only PDF files are allowed");
    }
    
    setSelectedFiles(pdfFiles);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Please select at least one PDF file");
      return;
    }

    setIsUploading(true);

    try {
      for (const file of selectedFiles) {
        // Extract file name without extension
        const fileName = file.name.replace(/\.pdf$/i, "");
        const timestamp = Date.now();
        const storagePath = `${fileName}_${timestamp}.pdf`;

        // Upload to storage
        const { data: storageData, error: storageError } = await supabase.storage
          .from("audit-pdfs")
          .upload(storagePath, file);

        if (storageError) throw storageError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from("audit-pdfs")
          .getPublicUrl(storagePath);

        // Insert into database
        const { error: dbError } = await supabase.from("audits").insert({
          file_name: fileName,
          file_url: publicUrl,
          status: "Pending",
        });

        if (dbError) throw dbError;
      }

      toast.success(`Successfully uploaded ${selectedFiles.length} file(s)`);
      setSelectedFiles([]);
      setIsOpen(false);
      onUploadComplete();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload files");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Upload className="h-4 w-4" />
          UPLOAD PDF
        </Button>
      </DialogTrigger>
      <DialogContent>
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
            <div className="space-y-2">
              <p className="text-sm font-medium">Selected files:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {selectedFiles.map((file, index) => (
                  <li key={index} className="truncate">
                    {file.name}
                  </li>
                ))}
              </ul>
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
