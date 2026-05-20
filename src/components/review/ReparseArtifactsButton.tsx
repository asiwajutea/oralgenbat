import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  auditId: string;
  mobileZipUrl?: string | null;
  hasPdf?: boolean;
}

/** Manual re-parse of artifact data (auditor / admin only). */
export const ReparseArtifactsButton = ({ auditId, mobileZipUrl, hasPdf }: Props) => {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const run = async () => {
    setBusy(true);
    const errors: string[] = [];
    try {
      if (mobileZipUrl) {
        toast.info("Reparsing mobile ZIP…");
        // Clear old metadata/photos so process-mobile-zip writes a clean slate
        await supabase.from("interview_photos").delete().eq("audit_id", auditId);
        await supabase.from("interview_metadata").delete().eq("audit_id", auditId);
        const { error } = await supabase.functions.invoke("process-mobile-zip", {
          body: { auditId, mobileZipUrl },
        });
        if (error) errors.push(`ZIP: ${error.message || error}`);
      }
      if (hasPdf) {
        toast.info("Reparsing PDF…");
        const { error } = await supabase.functions.invoke("analyze-pdf", { body: { auditId } });
        if (error) errors.push(`PDF: ${error.message || error}`);
      }
      if (errors.length) {
        toast.error(`Reparse completed with errors: ${errors.join("; ")}`);
      } else {
        toast.success("Artifacts reparsed.");
      }
      qc.invalidateQueries({ queryKey: ["interview-metadata", auditId] });
      qc.invalidateQueries({ queryKey: ["interview-photos", auditId] });
      qc.invalidateQueries({ queryKey: ["audit", auditId] });
    } catch (e: any) {
      toast.error(e?.message || "Reparse failed");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          <span className="hidden sm:inline">Reparse artifacts</span>
          <span className="sm:hidden">Reparse</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reparse artifact data?</AlertDialogTitle>
          <AlertDialogDescription>
            This re-runs PDF analysis{mobileZipUrl ? " and re-extracts the mobile metadata ZIP" : ""}. Existing parsed metadata and photos will be replaced. Use this when an artifact has been replaced but the page still shows the old data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); run(); }} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Reparsing…</> : "Reparse"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};