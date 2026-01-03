import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Users } from "lucide-react";
import { Team, useDeleteTeam, useAssignments } from "@/hooks/useTeamAssignments";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

interface ManageTeamsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: Team[];
}

export const ManageTeamsDialog = ({ open, onOpenChange, teams }: ManageTeamsDialogProps) => {
  const [deleteConfirm, setDeleteConfirm] = useState<Team | null>(null);
  const deleteTeam = useDeleteTeam();
  const { data: assignments } = useAssignments();

  const getTeamStats = (teamId: string) => {
    const teamAssignments = assignments?.filter((a) => a.team_id === teamId) || [];
    const totalNames = teamAssignments.reduce((sum, a) => sum + (a.total_names || 0), 0);
    return {
      interviewCount: teamAssignments.length,
      totalNames,
    };
  };

  const handleDelete = async () => {
    if (deleteConfirm) {
      await deleteTeam.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Teams</DialogTitle>
            <DialogDescription>
              View and manage your data entry teams.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4 max-h-96 overflow-y-auto">
            {teams.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No teams created yet
              </p>
            ) : (
              teams.map((team) => {
                const stats = getTeamStats(team.id);
                return (
                  <div
                    key={team.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{team.name}</h4>
                      {team.description && (
                        <p className="text-sm text-muted-foreground truncate">
                          {team.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {stats.interviewCount} interviews
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {stats.totalNames.toLocaleString()} names
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm(team)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?
              This action cannot be undone. Existing assignments will remain but the team will be hidden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};