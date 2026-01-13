import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, X, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface ContractorAssignment {
  id: string;
  user_id: string;
  contractor_id: string;
  is_primary: boolean;
  assigned_at: string | null;
}

interface ContractorAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  currentContractorId: string;
  onUpdate: () => void;
}

export const ContractorAssignmentDialog = ({
  open,
  onOpenChange,
  userId,
  userName,
  currentContractorId,
  onUpdate,
}: ContractorAssignmentDialogProps) => {
  const { user: currentUser } = useAuth();
  const [assignments, setAssignments] = useState<ContractorAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContractorId, setNewContractorId] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_contractor_assignments")
        .select("*")
        .eq("user_id", userId)
        .order("assigned_at", { ascending: true });

      if (error) throw error;
      setAssignments(data || []);
    } catch (error) {
      console.error("Error fetching contractor assignments:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && userId) {
      fetchAssignments();
    }
  }, [open, userId]);

  const addContractor = async () => {
    if (!newContractorId.trim()) return;

    // Check if already assigned
    if (assignments.some(a => a.contractor_id === newContractorId.trim())) {
      toast.error("This contractor is already assigned");
      return;
    }

    setAdding(true);
    try {
      // First, ensure the user's original contractor_id is in assignments
      // This is needed so the contractor switcher shows both contractors
      const originalExists = assignments.some(a => a.contractor_id === currentContractorId);
      
      if (!originalExists && currentContractorId) {
        await supabase
          .from("user_contractor_assignments")
          .insert({
            user_id: userId,
            contractor_id: currentContractorId,
            is_primary: true,
            assigned_by: currentUser?.id,
          });
      }

      // Now add the new contractor
      const { error } = await supabase
        .from("user_contractor_assignments")
        .insert({
          user_id: userId,
          contractor_id: newContractorId.trim(),
          is_primary: !originalExists && !currentContractorId, // Only primary if no existing contractors
          assigned_by: currentUser?.id,
        });

      if (error) throw error;

      toast.success(`Added contractor ${newContractorId}`);
      setNewContractorId("");
      fetchAssignments();
      onUpdate();
    } catch (error) {
      console.error("Error adding contractor:", error);
      toast.error("Failed to add contractor");
    } finally {
      setAdding(false);
    }
  };

  const removeContractor = async (assignmentId: string, contractorId: string) => {
    try {
      const { error } = await supabase
        .from("user_contractor_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;

      toast.success(`Removed contractor ${contractorId}`);
      fetchAssignments();
      onUpdate();
    } catch (error) {
      console.error("Error removing contractor:", error);
      toast.error("Failed to remove contractor");
    }
  };

  const setPrimary = async (assignmentId: string, contractorId: string) => {
    try {
      // First, unset all primary flags
      await supabase
        .from("user_contractor_assignments")
        .update({ is_primary: false })
        .eq("user_id", userId);

      // Then set the new primary
      const { error } = await supabase
        .from("user_contractor_assignments")
        .update({ is_primary: true })
        .eq("id", assignmentId);

      if (error) throw error;

      toast.success(`Set ${contractorId} as primary`);
      fetchAssignments();
      onUpdate();
    } catch (error) {
      console.error("Error setting primary:", error);
      toast.error("Failed to set primary contractor");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Contractor Access</DialogTitle>
          <DialogDescription>
            Assign multiple contractors to {userName}. Current default: {currentContractorId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current assignments */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Assigned Contractors</h4>
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No additional contractors assigned. The user's default is {currentContractorId}.
              </p>
            ) : (
              <ScrollArea className="max-h-48">
                <div className="space-y-2">
                  {assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between p-2 border rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{assignment.contractor_id}</span>
                        {assignment.is_primary && (
                          <Badge variant="default" className="gap-1">
                            <Star className="h-3 w-3" />
                            Primary
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!assignment.is_primary && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPrimary(assignment.id, assignment.contractor_id)}
                            title="Set as primary"
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeContractor(assignment.id, assignment.contractor_id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Add new contractor */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Add Contractor</h4>
            <div className="flex gap-2">
              <Input
                placeholder="Enter Contractor ID"
                value={newContractorId}
                onChange={(e) => setNewContractorId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addContractor()}
              />
              <Button onClick={addContractor} disabled={adding || !newContractorId.trim()}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
