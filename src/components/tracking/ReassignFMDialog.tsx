import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ReassignFMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auditId: string;
  fileName: string;
  currentFmId?: string | null;
  currentFmName?: string | null;
}

export const ReassignFMDialog = ({
  open,
  onOpenChange,
  auditId,
  fileName,
  currentFmId,
  currentFmName,
}: ReassignFMDialogProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedFmId, setSelectedFmId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch canonical FM list
  const { data: fieldManagers = [], isLoading: fmLoading, error: fmError, refetch: refetchFms } = useQuery({
    queryKey: ["canonical-field-managers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_canonical_field_managers");
      if (error) {
        console.error("get_canonical_field_managers failed:", error);
        throw error;
      }
      return (data || []) as Array<{ id: string; full_name: string }>;
    },
    enabled: open,
    staleTime: 60_000,
    retry: 1,
  });

  // Refetch every time the dialog opens to recover from any earlier cached failure
  useEffect(() => {
    if (open) {
      refetchFms();
    }
  }, [open, refetchFms]);

  const handleReassign = async () => {
    if (!selectedFmId || !auditId) return;
    setIsSubmitting(true);

    try {
      // Upsert into interview_fm_overrides (unique on audit_id)
      const { error } = await supabase
        .from("interview_fm_overrides")
        .upsert(
          {
            audit_id: auditId,
            field_manager_id: selectedFmId,
            assigned_by: user?.id,
          },
          { onConflict: "audit_id" }
        );

      if (error) throw error;

      const newFmName = fieldManagers.find(fm => fm.id === selectedFmId)?.full_name || "Unknown";

      toast({
        title: "FM Reassigned",
        description: `${fileName} reassigned to ${newFmName}`,
      });

      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["team-assignments-tracking"] });
      queryClient.invalidateQueries({ queryKey: ["interview-fm-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["field-manager-audits"] });
      queryClient.invalidateQueries({ queryKey: ["field-manager-team"] });
      onOpenChange(false);
      setSelectedFmId("");
    } catch (error: any) {
      console.error("Reassign error:", error);
      toast({
        title: "Reassignment Failed",
        description: error.message || "Could not reassign field manager",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSelectedFmId(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign Field Manager</DialogTitle>
          <DialogDescription>
            Reassign this specific interview to a different Field Manager. Other interviews by the same agent will not be affected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Interview</p>
            <p className="text-sm font-mono">{fileName}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">Current Field Manager</p>
            {currentFmName ? (
              <Badge variant="secondary">{currentFmName}</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Not Assigned</Badge>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">New Field Manager</p>
            <Select value={selectedFmId} onValueChange={setSelectedFmId} disabled={fmLoading}>
              <SelectTrigger>
                <SelectValue placeholder={
                  fmLoading
                    ? "Loading field managers…"
                    : fmError
                      ? "Failed to load — click to retry"
                      : fieldManagers.filter(fm => fm.id !== currentFmId).length === 0
                        ? "No other field managers available"
                        : "Select a field manager"
                } />
              </SelectTrigger>
              <SelectContent>
                {fieldManagers
                  .filter(fm => fm.id !== currentFmId)
                  .map(fm => (
                    <SelectItem key={fm.id} value={fm.id}>{fm.full_name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {fmError && (
              <button
                type="button"
                onClick={() => refetchFms()}
                className="text-xs text-primary mt-1 underline"
              >
                Retry loading field managers
              </button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleReassign} disabled={!selectedFmId || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Reassigning...
              </>
            ) : (
              "Reassign"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
