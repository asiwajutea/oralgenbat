import { useState } from "react";
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
  const { data: fieldManagers = [] } = useQuery({
    queryKey: ["canonical-field-managers"],
    queryFn: async () => {
      const { data: fmRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "field_manager");
      if (!fmRoles?.length) return [];
      const fmIds = fmRoles.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", fmIds);
      return (profiles || []).sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

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
            <Select value={selectedFmId} onValueChange={setSelectedFmId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a field manager" />
              </SelectTrigger>
              <SelectContent>
                {fieldManagers
                  .filter(fm => fm.id !== currentFmId)
                  .map(fm => (
                    <SelectItem key={fm.id} value={fm.id}>{fm.full_name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
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
