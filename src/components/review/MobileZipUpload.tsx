import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface MobileZipUploadProps {
  auditId: string;
  onUploadSuccess: () => void;
}

export const MobileZipUpload = ({ auditId, onUploadSuccess }: MobileZipUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing'>('idle');

  const handleFileSelect = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast({
        title: "Invalid file type",
        description: "Please select a ZIP file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadStatus('uploading');

    try {
      console.log('=== UPLOAD DEBUG ===');
      console.log('Original filename:', file.name);
      console.log('Upload path:', `${auditId}/${file.name}`);
      
      toast({
        title: "Uploading mobile ZIP file...",
      });

      const filePath = `${auditId}/${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('mobile-zips')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('mobile-zips')
        .getPublicUrl(filePath);

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
          description: "Please try again or contact support",
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
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadStatus('idle');
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
        </div>

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
