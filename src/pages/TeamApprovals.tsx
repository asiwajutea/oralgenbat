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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, XCircle, Loader2, Users, UserPlus } from "lucide-react";
import { format } from "date-fns";

const TeamApprovals = () => {
  const { session, userRole, profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: pendingRequests, isLoading, error } = useQuery({
    queryKey: ["pending-team-assignments", profile?.contractor_id],
    queryFn: async () => {
      console.log("🔍 Debug Info:", {
        userRole,
        contractorId: profile?.contractor_id,
        userId: session?.user?.id
      });

      // First, fetch team assignments
      let query = supabase
        .from("team_assignments")
        .select("*")
        .eq("status", "pending");

      // If user is a contractor (not admin), filter by their contractor_id
      if (userRole === 'contractor' && profile?.contractor_id) {
        console.log("📌 Filtering by contractor_id:", profile.contractor_id);
        query = query.eq("contractor_id", profile.contractor_id);
      }

      const { data: assignments, error: assignmentsError } = await query.order("created_at", { ascending: false });
      
      if (assignmentsError) throw assignmentsError;
      if (!assignments || assignments.length === 0) return [];

      // Fetch field manager profiles for all assignments
      const managerIds = [...new Set(assignments.map(a => a.field_manager_id))];
      const { data: managers, error: managersError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", managerIds);

      if (managersError) console.error("Failed to fetch managers:", managersError);

      // Combine the data
      const combinedData = assignments.map(assignment => ({
        ...assignment,
        manager: managers?.find(m => m.id === assignment.field_manager_id) || null
      }));

      console.log("📊 Query Results:", { 
        assignments: combinedData.length, 
        managers: managers?.length 
      });

      return combinedData;
    },
  });

  // Fetch approved teams grouped by field manager
  const { data: approvedTeams, isLoading: loadingTeams } = useQuery({
    queryKey: ["approved-teams", profile?.contractor_id],
    queryFn: async () => {
      let query = supabase
        .from("team_assignments")
        .select("*")
        .eq("status", "approved");

      if (userRole === 'contractor' && profile?.contractor_id) {
        query = query.eq("contractor_id", profile.contractor_id);
      }

      const { data: assignments, error: assignmentsError } = await query
        .order("field_manager_id");

      if (assignmentsError) throw assignmentsError;
      if (!assignments || assignments.length === 0) return [];

      // Fetch field manager profiles
      const managerIds = [...new Set(assignments.map(a => a.field_manager_id))];
      const { data: managers } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", managerIds);

      // Fetch interviewer names from interview_metadata
      const interviewerCodes = [...new Set(assignments.map(a => a.interviewer_code))];
      const { data: interviewers } = await supabase
        .from("interview_metadata")
        .select("interviewer_code, interviewer_name")
        .in("interviewer_code", interviewerCodes);

      // Create a map of interviewer codes to names
      const interviewerMap = new Map(
        interviewers?.map(i => [i.interviewer_code, i.interviewer_name])
      );

      // Group assignments by field manager with interviewer names
      const teamsByManager = managerIds.map(managerId => {
        const manager = managers?.find(m => m.id === managerId);
        const members = assignments
          .filter(a => a.field_manager_id === managerId)
          .map(assignment => ({
            ...assignment,
            interviewer_name: interviewerMap.get(assignment.interviewer_code) || "Unknown"
          }));
        
        return {
          managerId,
          managerName: manager?.full_name || "Unknown",
          managerEmail: manager?.email,
          members,
          memberCount: members.length
        };
      });

      return teamsByManager;
    },
  });

  // Fetch all field managers for reassignment dropdown
  const { data: allFieldManagers } = useQuery({
    queryKey: ["all-field-managers", profile?.contractor_id],
    queryFn: async () => {
      // Get all field manager user IDs
      const { data: fieldManagerRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "field_manager");

      if (!fieldManagerRoles || fieldManagerRoles.length === 0) return [];

      const managerIds = fieldManagerRoles.map(r => r.user_id);

      // Get profiles for these field managers
      let profilesQuery = supabase
        .from("profiles")
        .select("id, full_name, email, contractor_id")
        .in("id", managerIds)
        .eq("is_approved", true);

      // Filter by contractor_id for contractors
      if (userRole === 'contractor' && profile?.contractor_id) {
        profilesQuery = profilesQuery.eq("contractor_id", profile.contractor_id);
      }

      const { data: managers } = await profilesQuery.order("full_name");

      return managers || [];
    },
  });

  // Fetch unassigned interviewers
  const { data: unassignedInterviewers, isLoading: loadingUnassigned } = useQuery({
    queryKey: ["unassigned-interviewers", profile?.contractor_id],
    queryFn: async () => {
      // Get all interviewers from interview_metadata
      let metadataQuery = supabase
        .from("interview_metadata")
        .select("interviewer_code, interviewer_name, contractor_id");

      if (userRole === 'contractor' && profile?.contractor_id) {
        metadataQuery = metadataQuery.eq("contractor_id", profile.contractor_id);
      }

      const { data: allInterviewers, error: interviewersError } = await metadataQuery;
      
      if (interviewersError) throw interviewersError;

      // Get unique interviewers
      const uniqueInterviewers = Array.from(
        new Map(
          allInterviewers?.map(i => [
            i.interviewer_code,
            {
              code: i.interviewer_code,
              name: i.interviewer_name,
              contractor_id: i.contractor_id
            }
          ])
        ).values()
      );

      // Get all approved assignments
      let assignmentsQuery = supabase
        .from("team_assignments")
        .select("interviewer_code")
        .eq("status", "approved");

      if (userRole === 'contractor' && profile?.contractor_id) {
        assignmentsQuery = assignmentsQuery.eq("contractor_id", profile.contractor_id);
      }

      const { data: approvedAssignments } = await assignmentsQuery;

      const assignedCodes = approvedAssignments?.map(a => a.interviewer_code) || [];
      
      // Filter out assigned interviewers
      return uniqueInterviewers.filter(i => !assignedCodes.includes(i.code));
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

  const reassignAgentMutation = useMutation({
    mutationFn: async ({
      assignmentId,
      newFieldManagerId,
    }: {
      assignmentId: string;
      newFieldManagerId: string;
    }) => {
      if (!session?.user.id) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("team_assignments")
        .update({
          field_manager_id: newFieldManagerId,
        })
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approved-teams"] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-interviewers"] });
      toast({
        title: "Success",
        description: "Agent reassigned successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reassign agent.",
        variant: "destructive",
      });
    },
  });

  const assignAgentMutation = useMutation({
    mutationFn: async ({
      interviewerCode,
      fieldManagerId,
      contractorId,
    }: {
      interviewerCode: string;
      fieldManagerId: string;
      contractorId: string;
    }) => {
      if (!session?.user.id) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("team_assignments")
        .insert({
          interviewer_code: interviewerCode,
          field_manager_id: fieldManagerId,
          contractor_id: contractorId,
          status: "approved",
          approved_by: session.user.id,
          approved_at: new Date().toISOString(),
          notes: "Direct assignment by contractor/admin"
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approved-teams"] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-interviewers"] });
      toast({
        title: "Success",
        description: "Agent assigned to team successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign agent.",
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
            {error && (
              <div className="bg-destructive/10 p-4 rounded-md mb-4">
                <p className="text-destructive font-medium">Error loading requests:</p>
                <p className="text-sm text-muted-foreground">{error.message}</p>
              </div>
            )}
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

        {/* Active Teams Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Active Teams ({approvedTeams?.length || 0})
            </CardTitle>
            <CardDescription>
              Field managers and their assigned interviewers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTeams ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : approvedTeams && approvedTeams.length > 0 ? (
              <div className="space-y-4">
                {approvedTeams.map(team => (
                  <div key={team.managerId} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold">{team.managerName}</h3>
                        <p className="text-sm text-muted-foreground">{team.managerEmail}</p>
                      </div>
                      <Badge variant="outline">{team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}</Badge>
                    </div>
                    <div className="space-y-2">
                      {team.members.map(member => (
                        <div key={member.id} className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/30">
                          <div className="flex items-center gap-2 flex-1">
                            <Badge variant="secondary">{member.interviewer_code}</Badge>
                            <span className="font-medium">{member.interviewer_name}</span>
                            <span className="text-xs text-muted-foreground">
                              • Assigned {format(new Date(member.approved_at), "MMM d, yyyy")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={member.field_manager_id}
                              onValueChange={(newManagerId) => {
                                if (newManagerId !== member.field_manager_id) {
                                  reassignAgentMutation.mutate({
                                    assignmentId: member.id,
                                    newFieldManagerId: newManagerId,
                                  });
                                }
                              }}
                            >
                              <SelectTrigger className="w-[200px] h-8 text-xs">
                                <SelectValue placeholder="Reassign to..." />
                              </SelectTrigger>
                              <SelectContent>
                                {allFieldManagers?.map(manager => (
                                  <SelectItem key={manager.id} value={manager.id}>
                                    {manager.full_name}
                                    {manager.id === team.managerId && " (Current)"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No Active Teams</p>
                <p className="text-sm">No approved team assignments yet.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unassigned Agents Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Unassigned Agents ({unassignedInterviewers?.length || 0})
            </CardTitle>
            <CardDescription>
              Interviewers not currently assigned to any team
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingUnassigned ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : unassignedInterviewers && unassignedInterviewers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Interviewer Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Contractor ID</TableHead>
                    <TableHead>Assign To Team</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unassignedInterviewers.map(interviewer => (
                    <TableRow key={interviewer.code}>
                      <TableCell className="font-medium">{interviewer.code}</TableCell>
                      <TableCell>{interviewer.name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{interviewer.contractor_id}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          onValueChange={(fieldManagerId) => {
                            assignAgentMutation.mutate({
                              interviewerCode: interviewer.code,
                              fieldManagerId,
                              contractorId: interviewer.contractor_id,
                            });
                          }}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select field manager..." />
                          </SelectTrigger>
                          <SelectContent>
                            {allFieldManagers
                              ?.filter(manager => manager.contractor_id === interviewer.contractor_id)
                              .map(manager => (
                                <SelectItem key={manager.id} value={manager.id}>
                                  {manager.full_name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center p-8 text-muted-foreground">
                <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">All Agents Assigned</p>
                <p className="text-sm">All interviewers are assigned to teams.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default TeamApprovals;
