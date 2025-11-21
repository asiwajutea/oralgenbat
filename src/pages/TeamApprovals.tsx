import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, XCircle, Loader2, Users } from "lucide-react";
import { format } from "date-fns";

const TeamApprovals = () => {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const { data: pendingRequests, isLoading } = useQuery({
    queryKey: ["pending-team-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_assignments")
        .select(`
          *,
          manager:profiles!field_manager_id (
            id,
            full_name,
            email
          )
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async ({
      assignmentId,
      status,
    }: {
      assignmentId: string;
      status: "approved" | "rejected";
    }) => {
      if (!session?.user.id) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("team_assignments")
        .update({
          status,
          approved_by: session.user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pending-team-assignments"] });
      toast({
        title: "Success",
        description: `Assignment ${variables.status}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update assignment.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (assignmentId: string) => {
    updateAssignmentMutation.mutate({ assignmentId, status: "approved" });
  };

  const handleReject = (assignmentId: string) => {
    updateAssignmentMutation.mutate({ assignmentId, status: "rejected" });
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Team Assignment Approvals</h1>
            <p className="text-muted-foreground">
              Review and approve field manager team assignment requests
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Pending Requests ({pendingRequests?.length || 0})
            </CardTitle>
            <CardDescription>
              Review requests from field managers to assign interviewers to their teams
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : pendingRequests && pendingRequests.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field Manager</TableHead>
                    <TableHead>Interviewer Code</TableHead>
                    <TableHead>Contractor ID</TableHead>
                    <TableHead>Request Date</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {(request.manager as any)?.full_name || "Unknown"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {(request.manager as any)?.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {request.interviewer_code}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{request.contractor_id}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(request.created_at), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {request.notes || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(request.id)}
                            disabled={updateAssignmentMutation.isPending}
                            className="gap-1"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(request.id)}
                            disabled={updateAssignmentMutation.isPending}
                            className="gap-1"
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center p-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No Pending Requests</p>
                <p className="text-sm">
                  All team assignment requests have been processed.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default TeamApprovals;
