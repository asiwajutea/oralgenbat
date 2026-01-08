import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface MobileZipUploadProps {
  auditId: string;
  expectedFileName: string;
  onUploadSuccess: () => void;
}

export const MobileZipUpload = ({ auditId, expectedFileName, onUploadSuccess }: MobileZipUploadProps) => {
  const { userRole } = useAuth();
  
  // Auditors cannot upload files - return null to hide component
  if (userRole === 'auditor') {
    return null;
  }
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing'>('idle');
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const uploadFileWithProgress = async (
    file: File,
    filePath: string
  ): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`Starting upload of ${file.size} bytes to ${filePath}`);
        
        // Use standard upload with upsert for better reliability
        const { data, error: uploadError } = await supabase.storage
          .from("mobile-zips")
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true,
            contentType: file.type || 'application/zip',
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        console.log('Upload completed:', data);
        
        // Simulate progress for user feedback (since standard upload doesn't provide progress)
        setUploadProgress(100);
        
        // Wait longer for storage to fully commit the file
        console.log('Waiting for storage to finalize...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from("mobile-zips")
          .getPublicUrl(filePath);
          
        console.log('File available at:', publicUrl);
        resolve(publicUrl);
      } catch (error) {
        console.error('Upload failed:', error);
        reject(error);
      }
    });
  };

  const handleFileSelect = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast({
        title: "Invalid file type",
        description: "Please select a ZIP file",
        variant: "destructive",
      });
      return;
    }

    // Validate filename matches expected interview ID
    const zipFileName = file.name.replace(/\.zip$/i, '');
    if (zipFileName !== expectedFileName) {
      toast({
        title: "Filename mismatch",
        description: `The ZIP file must be named "${expectedFileName}.zip" to match the interview ID. Your file is named "${file.name}"`,
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadStatus('uploading');
    setUploadProgress(0);

    try {
      console.log('=== UPLOAD DEBUG ===');
      console.log('Original filename:', file.name);
      console.log('Upload path:', `${auditId}/${file.name}`);
      
      const filePath = `${auditId}/${file.name}`;

      // Check if file already exists and delete it for clean re-upload
      const { data: existingFiles } = await supabase.storage
        .from("mobile-zips")
        .list(auditId);

      const fileExists = existingFiles?.some(f => f.name === file.name);

      if (fileExists) {
        console.log('Existing file found, deleting for re-upload...');
        
        // Delete existing file
        const { error: deleteError } = await supabase.storage
          .from("mobile-zips")
          .remove([filePath]);
          
        if (deleteError) {
          console.warn("Could not delete existing file:", deleteError);
        }

        // Clean up any partial data from previous failed processing
        console.log('Cleaning up partial data from previous attempt...');
        await supabase.from('interview_photos').delete().eq('audit_id', auditId);
        await supabase.from('interview_metadata').delete().eq('audit_id', auditId);
      }
      
      toast({
        title: "Uploading mobile ZIP file...",
      });

      // Upload with progress tracking
      const publicUrl = await uploadFileWithProgress(file, filePath);

      const { error: updateError } = await supabase
        .from('audits')
        .update({
          mobile_zip_url: publicUrl,
          mobile_zip_uploaded_at: new Date().toISOString(),
        })
        .eq('id', auditId);

      if (updateError) throw updateError;

      setUploadStatus('processing');
      toast({
        title: "Mobile materials uploaded. Processing ZIP file...",
      });

      const { error: functionError } = await supabase.functions.invoke('process-mobile-zip', {
        body: { auditId, mobileZipUrl: publicUrl }
      });

      if (functionError) {
        toast({
          title: "ZIP uploaded but processing failed",
          description: `Processing failed for "${expectedFileName}.zip". Please try again or contact support.`,
          variant: "destructive",
        });
        throw functionError;
      }

      toast({
        title: "Mobile materials processed successfully",
      });

      onUploadSuccess();
    } catch (error) {
      console.error('Error uploading mobile materials:', error);
      toast({
        title: "Failed to upload mobile materials",
        description: `Upload failed for "${expectedFileName}.zip". ${error instanceof Error ? error.message : "Please try again."}`,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadStatus('idle');
      setUploadProgress(0);
    }
  };

  const triggerFileInput = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      await handleFileSelect(file);
    };
    input.click();
  };

  const getButtonText = () => {
    switch (uploadStatus) {
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'Processing ZIP...';
      default:
        return 'Upload Mobile ZIP File';
    }
  };

  return (
    <div className="p-8 text-center border border-dashed rounded-lg bg-muted/5">
      <div className="flex flex-col items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          {isUploading ? (
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          ) : (
            <Upload className="h-8 w-8 text-primary" />
          )}
        </div>
        
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">No Mobile Data Available</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Upload a mobile ZIP file to view interview photos, audio analysis, and detailed metadata
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Expected file: <span className="font-mono font-medium">{expectedFileName}.zip</span>
          </p>
        </div>

        {isUploading && uploadStatus === 'uploading' && (
          <div className="w-full max-w-md space-y-2">
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-xs text-center text-muted-foreground">
              Uploading: {uploadProgress}%
            </p>
          </div>
        )}

        {isUploading && uploadStatus === 'processing' && (
          <div className="w-full max-w-md">
            <p className="text-sm text-center text-muted-foreground">
              Processing ZIP file...
            </p>
          </div>
        )}

        <Button 
          onClick={triggerFileInput}
          disabled={isUploading}
          className="gap-2"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {getButtonText()}
        </Button>
      </div>
    </div>
  );
};
