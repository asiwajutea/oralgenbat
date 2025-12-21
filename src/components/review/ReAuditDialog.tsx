import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload } from "lucide-react";

interface ReAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auditId: string;
  currentFileName: string;
  onSuccess: () => void;
}

export const ReAuditDialog = ({
  open,
  onOpenChange,
  auditId,
  currentFileName,
  onSuccess,
}: ReAuditDialogProps) => {
  const { session, userRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [replacePdf, setReplacePdf] = useState(false);
  const [replaceZip, setReplaceZip] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);

  const handleSubmit = async () => {
    if (!session?.user) return;
    
    // Require at least one file replacement
    if (!replacePdf && !replaceZip) {
      toast({
        title: "File Required",
        description: "You must replace at least one file (PDF or ZIP) to submit for re-audit.",
        variant: "destructive",
      });
      return;
    }

    if (replacePdf && !pdfFile) {
      toast({
        title: "Validation Error",
        description: "Please select a PDF file.",
        variant: "destructive",
      });
      return;
    }

    if (replaceZip && !zipFile) {
      toast({
        title: "Validation Error",
        description: "Please select a ZIP file.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      let newPdfUrl = null;
      let newZipUrl = null;

      // Upload new PDF if selected
      if (replacePdf && pdfFile) {
        const pdfPath = `${auditId}/${pdfFile.name}`;
        const { error: pdfError } = await supabase.storage
          .from("audit-pdfs")
          .upload(pdfPath, pdfFile, { upsert: true });

        if (pdfError) throw pdfError;
        
        const { data: pdfData } = supabase.storage
          .from("audit-pdfs")
          .getPublicUrl(pdfPath);
        newPdfUrl = pdfData.publicUrl;
      }

      // Upload new ZIP if selected
      if (replaceZip && zipFile) {
        const zipPath = `${auditId}/${zipFile.name}`;
        const { error: zipError } = await supabase.storage
          .from("mobile-zips")
          .upload(zipPath, zipFile, { upsert: true });

        if (zipError) throw zipError;
        
        const { data: zipData } = supabase.storage
          .from("mobile-zips")
          .getPublicUrl(zipPath);
        newZipUrl = zipData.publicUrl;
      }

      // Call the database function to mark for re-audit
      const { error: reauditError } = await supabase.rpc("mark_audit_for_reaudit", {
        _audit_id: auditId,
        _submitted_by: session.user.id,
        _submitted_by_role: userRole as any,
        _comment: comment.trim() || null,
        _new_pdf_url: newPdfUrl,
        _new_zip_url: newZipUrl,
      });

      if (reauditError) throw reauditError;

      toast({
        title: "Success",
        description: "Interview has been submitted for re-audit.",
      });

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error("Re-audit submission error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to submit for re-audit.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setComment("");
    setReplacePdf(false);
    setReplaceZip(false);
    setPdfFile(null);
    setZipFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Submit for Re-Audit</DialogTitle>
          <DialogDescription>
            Upload new files and/or add comments to resubmit this interview for review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Current Interview: {currentFileName}</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="replacePdf"
              checked={replacePdf}
              onCheckedChange={(checked) => setReplacePdf(checked as boolean)}
            />
            <Label htmlFor="replacePdf" className="cursor-pointer">
              Replace PDF File
            </Label>
          </div>

          {replacePdf && (
            <div className="space-y-2">
              <Label htmlFor="pdfFile">Upload New PDF</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="pdfFile"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  disabled={loading}
                />
                {pdfFile && <Upload className="h-4 w-4 text-green-600" />}
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="replaceZip"
              checked={replaceZip}
              onCheckedChange={(checked) => setReplaceZip(checked as boolean)}
            />
            <Label htmlFor="replaceZip" className="cursor-pointer">
              Replace Mobile ZIP File
            </Label>
          </div>

          {replaceZip && (
            <div className="space-y-2">
              <Label htmlFor="zipFile">Upload New ZIP</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="zipFile"
                  type="file"
                  accept=".zip"
                  onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                  disabled={loading}
                />
                {zipFile && <Upload className="h-4 w-4 text-green-600" />}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="comment">Comment (Optional)</Label>
            <Textarea
              id="comment"
              placeholder="Add any notes or explanations for the re-audit..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={loading}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit for Re-Audit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
