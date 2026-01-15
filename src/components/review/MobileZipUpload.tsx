import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import JSZip from "jszip";

interface MobileZipUploadProps {
  auditId: string;
  expectedFileName: string;
  onUploadSuccess: () => void;
  existingZipUrl?: string | null;
  hasProcessingFailed?: boolean;
}

export const MobileZipUpload = ({ auditId, expectedFileName, onUploadSuccess, existingZipUrl, hasProcessingFailed }: MobileZipUploadProps) => {
  const { userRole } = useAuth();
  
  // Auditors cannot upload files - return null to hide component
  if (userRole === 'auditor') {
    return null;
  }
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'verifying' | 'processing' | 'deleting'>('idle');
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Function to delete existing corrupted ZIP and allow fresh upload
  const deleteExistingZip = async () => {
    setUploadStatus('deleting');
    try {
      const filePath = `${auditId}/${expectedFileName}.zip`;
      
      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from("mobile-zips")
        .remove([filePath]);
        
      if (deleteError) {
        console.warn("Could not delete file:", deleteError);
      }

      // Clear the database references
      await supabase.from('interview_photos').delete().eq('audit_id', auditId);
      await supabase.from('interview_metadata').delete().eq('audit_id', auditId);
      await supabase
        .from('audits')
        .update({ mobile_zip_url: null, mobile_zip_uploaded_at: null })
        .eq('id', auditId);

      toast({
        title: "Corrupted file removed",
        description: "You can now upload a fresh copy of the ZIP file.",
      });
      
      onUploadSuccess(); // Refresh the UI
    } catch (error) {
      console.error('Error deleting corrupted ZIP:', error);
      toast({
        title: "Failed to delete file",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadStatus('idle');
    }
  };

  const uploadFileWithProgress = async (
    file: File,
    filePath: string,
    validatedArrayBuffer: ArrayBuffer
  ): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`Starting upload of ${file.size} bytes to ${filePath}`);
        
        // Use the pre-validated ArrayBuffer to ensure binary integrity
        // This prevents any potential corruption during File->Blob conversion
        const { data, error: uploadError } = await supabase.storage
          .from("mobile-zips")
          .upload(filePath, validatedArrayBuffer, {
            cacheControl: '3600',
            upsert: true,
            contentType: 'application/zip',
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        console.log('Upload completed:', data);
        
        // Simulate progress for user feedback (since standard upload doesn't provide progress)
        setUploadProgress(100);
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from("mobile-zips")
          .getPublicUrl(filePath);
        
        // Verify the file is accessible by fetching it and validating
        console.log('Verifying upload integrity...');
        let verified = false;
        for (let attempt = 1; attempt <= 5; attempt++) {
          const waitMs = attempt * 2000; // 2s, 4s, 6s, 8s, 10s
          console.log(`Verification attempt ${attempt}/5, waiting ${waitMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
          
          try {
            const response = await fetch(publicUrl);
            if (!response.ok) {
              console.log(`Attempt ${attempt}: HTTP ${response.status}`);
              continue;
            }
            
            const downloadedBuffer = await response.arrayBuffer();
            const downloadedBytes = new Uint8Array(downloadedBuffer);
            
            // Verify size matches
            if (downloadedBytes.length !== validatedArrayBuffer.byteLength) {
              console.log(`Attempt ${attempt}: Size mismatch - got ${downloadedBytes.length}, expected ${validatedArrayBuffer.byteLength}`);
              continue;
            }
            
            // Verify ZIP signature
            if (downloadedBytes[0] !== 0x50 || downloadedBytes[1] !== 0x4B) {
              console.log(`Attempt ${attempt}: Invalid ZIP signature in downloaded file`);
              continue;
            }
            
            // Verify EOCD exists
            const searchStart = Math.max(0, downloadedBytes.length - 65536);
            let foundEOCD = false;
            for (let i = downloadedBytes.length - 22; i >= searchStart; i--) {
              if (downloadedBytes[i] === 0x50 && downloadedBytes[i+1] === 0x4B && 
                  downloadedBytes[i+2] === 0x05 && downloadedBytes[i+3] === 0x06) {
                foundEOCD = true;
                break;
              }
            }
            
            if (!foundEOCD) {
              console.log(`Attempt ${attempt}: EOCD not found in downloaded file`);
              continue;
            }
            
            console.log(`✓ Upload verified on attempt ${attempt}`);
            verified = true;
            break;
          } catch (verifyError) {
            console.log(`Attempt ${attempt}: Verification error -`, verifyError);
          }
        }
        
        if (!verified) {
          throw new Error('Upload verification failed after 5 attempts. The file may not have been stored correctly. Please try again.');
        }
          
        console.log('File verified at:', publicUrl);
        resolve(publicUrl);
      } catch (error) {
        console.error('Upload failed:', error);
        reject(error);
      }
    });
  };

  const validateZipFile = async (file: File): Promise<{ valid: boolean; error?: string; details?: string; arrayBuffer?: ArrayBuffer }> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      // Check for ZIP magic number (PK)
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
        return { 
          valid: false, 
          error: "Invalid ZIP file", 
          details: "The file does not appear to be a valid ZIP archive. It may have been renamed from another format." 
        };
      }
      
      // Check for End of Central Directory (EOCD) signature
      // EOCD signature is PK\x05\x06 and should be in the last 65KB
      const searchStart = Math.max(0, bytes.length - 65536);
      let foundEOCD = false;
      
      for (let i = bytes.length - 22; i >= searchStart; i--) {
        if (bytes[i] === 0x50 && bytes[i+1] === 0x4B && 
            bytes[i+2] === 0x05 && bytes[i+3] === 0x06) {
          foundEOCD = true;
          break;
        }
      }
      
      if (!foundEOCD) {
        return { 
          valid: false, 
          error: "Incomplete or corrupted ZIP file", 
          details: "The ZIP file appears to be incomplete or corrupted. This often happens when the file wasn't fully transferred from the mobile device. Please export the ZIP file again from the mobile app and ensure it transfers completely." 
        };
      }
      
      // Try to actually load with JSZip to verify the structure
      const zip = await JSZip.loadAsync(arrayBuffer);
      const files = Object.keys(zip.files);
      
      if (files.length === 0) {
        return { 
          valid: false, 
          error: "Empty ZIP file", 
          details: "The ZIP file contains no files. Please export the interview data again from the mobile app." 
        };
      }
      
      // Check for expected files (metadata.json is required)
      const hasMetadata = files.some(f => f.toLowerCase().includes('metadata.json'));
      if (!hasMetadata) {
        return { 
          valid: false, 
          error: "Missing interview data", 
          details: "The ZIP file does not contain the required metadata.json file. Please ensure you're uploading the correct interview ZIP exported from the mobile app." 
        };
      }
      
      // Return the validated arrayBuffer so we can reuse it for upload
      return { valid: true, arrayBuffer };
    } catch (error) {
      console.error("ZIP validation error:", error);
      return { 
        valid: false, 
        error: "Failed to read ZIP file", 
        details: error instanceof Error 
          ? `${error.message}. The file may be corrupted, use an unsupported compression format (like ZIP64), or was not fully transferred. Please try exporting the interview again from the mobile app.`
          : "The file could not be read. Please ensure the file is a valid ZIP archive." 
      };
    }
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

    // Validate ZIP file integrity before uploading
    setIsUploading(true);
    setUploadStatus('uploading');
    setUploadProgress(0);
    
    toast({
      title: "Validating ZIP file...",
      description: "Checking file integrity before upload",
    });

    const validation = await validateZipFile(file);
    if (!validation.valid) {
      setIsUploading(false);
      setUploadStatus('idle');
      toast({
        title: validation.error || "Invalid ZIP file",
        description: validation.details || "The file could not be validated. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setUploadProgress(10);
    toast({
      title: "ZIP file validated ✓",
      description: "Starting upload...",
    });

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

      setUploadStatus('verifying');
      // Upload with progress tracking using the validated ArrayBuffer (includes verification)
      const publicUrl = await uploadFileWithProgress(file, filePath, validation.arrayBuffer!);

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
      case 'verifying':
        return 'Verifying upload...';
      case 'processing':
        return 'Processing ZIP...';
      case 'deleting':
        return 'Removing corrupted file...';
      default:
        return existingZipUrl && hasProcessingFailed ? 'Upload New ZIP File' : 'Upload Mobile ZIP File';
    }
  };

  // Show corrupted file warning if there's an existing ZIP that failed processing
  if (existingZipUrl && hasProcessingFailed && uploadStatus === 'idle') {
    return (
      <div className="p-8 text-center border border-dashed border-destructive/50 rounded-lg bg-destructive/5">
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-destructive">Corrupted ZIP File Detected</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              The previously uploaded ZIP file is corrupted and cannot be processed. This usually happens when the file wasn't fully transferred from the mobile device.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              <strong>Solution:</strong> Delete the corrupted file and re-upload a fresh copy from the mobile app.
            </p>
          </div>

          <div className="flex gap-3">
            <Button 
              onClick={deleteExistingZip}
              variant="destructive"
              className="gap-2"
            >
              Delete Corrupted File
            </Button>
            <Button 
              onClick={triggerFileInput}
              variant="outline"
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Fresh Copy
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 text-center border border-dashed rounded-lg bg-muted/5">
      <div className="flex flex-col items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          {isUploading || uploadStatus === 'deleting' ? (
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

        {isUploading && uploadStatus === 'verifying' && (
          <div className="w-full max-w-md">
            <p className="text-sm text-center text-muted-foreground">
              Verifying upload integrity...
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
          disabled={isUploading || uploadStatus === 'deleting'}
          className="gap-2"
        >
          {isUploading || uploadStatus === 'deleting' ? (
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
