import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, UserPlus, Trash2, Loader2 } from "lucide-react";

const TeamManagement = () => {
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();
  const [selectedInterviewer, setSelectedInterviewer] = useState<string | null>(null);
  const [requestNotes, setRequestNotes] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch available interviewers from interview_metadata
  const { data: availableInterviewers, isLoading: loadingInterviewers } = useQuery({
    queryKey: ["available-interviewers", profile?.contractor_id],
    queryFn: async () => {
      if (!profile?.contractor_id) return [];

      const { data, error } = await supabase
        .from("interview_metadata")
        .select("interviewer_code, interviewer_name, contractor_id")
        .eq("contractor_id", profile.contractor_id);

      if (error) throw error;

      // Get unique interviewers
      const uniqueInterviewers = Array.from(
        new Map(
          data.map((item) => [
            item.interviewer_code,
            {
              code: item.interviewer_code,
              name: item.interviewer_name,
              contractor_id: item.contractor_id,
            },
          ])
        ).values()
      );

      return uniqueInterviewers;
    },
    enabled: !!profile?.contractor_id,
  });

  // Fetch current team assignments
  const { data: teamAssignments, isLoading: loadingAssignments } = useQuery({
    queryKey: ["team-assignments", session?.user.id],
    queryFn: async () => {
      if (!session?.user.id) return [];

      const { data, error } = await supabase
        .from("team_assignments")
        .select("*")
        .eq("field_manager_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!session?.user.id,
  });

  const requestAssignmentMutation = useMutation({
    mutationFn: async ({
      interviewerCode,
      contractorId,
      notes,
    }: {
      interviewerCode: string;
      contractorId: string;
      notes: string;
    }) => {
      if (!session?.user.id) throw new Error("Not authenticated");

      const { error } = await supabase.from("team_assignments").insert({
        field_manager_id: session.user.id,
        interviewer_code: interviewerCode,
        contractor_id: contractorId,
        notes: notes.trim() || null,
        status: "pending",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-assignments"] });
      toast({
        title: "Success",
        description: "Assignment request submitted for approval.",
      });
      setDialogOpen(false);
      setSelectedInterviewer(null);
      setRequestNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit request.",
        variant: "destructive",
      });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from("team_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-assignments"] });
      toast({
        title: "Success",
        description: "Assignment request deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete request.",
        variant: "destructive",
      });
    },
  });

  const handleRequestAssignment = (interviewer: any) => {
    setSelectedInterviewer(interviewer.code);
    setDialogOpen(true);
  };

  const handleSubmitRequest = () => {
    const interviewer = availableInterviewers?.find(
      (i) => i.code === selectedInterviewer
    );
    if (!interviewer) return;

    requestAssignmentMutation.mutate({
      interviewerCode: interviewer.code,
      contractorId: interviewer.contractor_id,
      notes: requestNotes,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-700">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-700">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const assignedCodes = teamAssignments?.map((a) => a.interviewer_code) || [];
  const unassignedInterviewers =
    availableInterviewers?.filter((i) => !assignedCodes.includes(i.code)) || [];

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Team Management</h1>
            <p className="text-muted-foreground">
              Manage your interviewer team assignments
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* My Team Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                My Team ({teamAssignments?.length || 0})
              </CardTitle>
              <CardDescription>
                Your current interviewer assignments and requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAssignments ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : teamAssignments && teamAssignments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">SN</TableHead>
                      <TableHead>Interviewer Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamAssignments.map((assignment, index) => (
                      <TableRow key={assignment.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {assignment.interviewer_code}
                        </TableCell>
                        <TableCell>{getStatusBadge(assignment.status)}</TableCell>
                        <TableCell>
                          {assignment.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                deleteAssignmentMutation.mutate(assignment.id)
                              }
                              disabled={deleteAssignmentMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  No team assignments yet. Request interviewers from the available
                  list.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Available Interviewers Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Available Interviewers
              </CardTitle>
              <CardDescription>
                Interviewers from your contractor that you can request
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingInterviewers ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : unassignedInterviewers && unassignedInterviewers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">SN</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unassignedInterviewers.map((interviewer, index) => (
                      <TableRow key={interviewer.code}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {interviewer.code}
                        </TableCell>
                        <TableCell>{interviewer.name || "N/A"}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => handleRequestAssignment(interviewer)}
                          >
                            Request
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  All interviewers have been assigned or requested.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Request Assignment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Interviewer Assignment</DialogTitle>
            <DialogDescription>
              Submit a request to add this interviewer to your team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Interviewer Code</Label>
              <Input value={selectedInterviewer || ""} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any notes for the approver..."
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitRequest}
              disabled={requestAssignmentMutation.isPending}
            >
              {requestAssignmentMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default TeamManagement;
