import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Flame, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface SendToBurnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auditId: string;
  fileName: string;
  onSuccess?: () => void;
}

const SendToBurnDialog = ({ open, onOpenChange, auditId, fileName, onSuccess }: SendToBurnDialogProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const burnMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      if (!reason.trim()) throw new Error("Reason is required");

      const { error } = await supabase.from("burn_queue").insert({
        audit_id: auditId,
        file_name: fileName,
        sent_by: user.id,
        reason: reason.trim(),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Sent to burn",
        description: `"${fileName}" has been sent to the burn queue.`,
      });
      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["admin-review-history"] });
      queryClient.invalidateQueries({ queryKey: ["burn-queue"] });
      queryClient.invalidateQueries({ queryKey: ["contractor-audits"] });
      setReason("");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send to burn",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Send to Burn
          </DialogTitle>
          <DialogDescription>
            Send <span className="font-mono font-medium">{fileName}</span> to the burn queue. It will be permanently deleted after 190 days.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="burn-reason">Reason *</Label>
            <Textarea
              id="burn-reason"
              placeholder="Provide a reason for burning this interview..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => burnMutation.mutate()}
            disabled={!reason.trim() || burnMutation.isPending}
          >
            {burnMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Flame className="h-4 w-4 mr-2" />
            )}
            Send to Burn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendToBurnDialog;
