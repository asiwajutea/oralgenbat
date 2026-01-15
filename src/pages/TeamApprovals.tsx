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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CheckCircle, XCircle, Loader2, Users, UserPlus, Link2 } from "lucide-react";
import { format } from "date-fns";

const TeamApprovals = () => {
  const { session, userRole, profile } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = userRole === "super_admin";
  
  // Use active_contractor_id for contractor filtering (except super_admin)
  const effectiveContractorId = profile?.active_contractor_id || profile?.contractor_id;
  const isContractor = userRole === 'contractor';

  const { data: pendingRequests, isLoading, error } = useQuery({
    queryKey: ["pending-team-assignments", effectiveContractorId],
    queryFn: async () => {
      let query = supabase
        .from("team_assignments")
        .select("*")
        .eq("status", "pending");

      if (!isSuperAdmin && isContractor && effectiveContractorId) {
        query = query.eq("contractor_id", effectiveContractorId);
      }

      const { data: assignments, error: assignmentsError } = await query.order("created_at", { ascending: false });
      
      if (assignmentsError) throw assignmentsError;
      if (!assignments || assignments.length === 0) return [];

      const managerIds = [...new Set(assignments.map(a => a.field_manager_id))];
      const { data: managers } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", managerIds);

      const combinedData = assignments.map(assignment => ({
        ...assignment,
        manager: managers?.find(m => m.id === assignment.field_manager_id) || null
      }));

      return combinedData;
    },
  });

  // Fetch approved teams grouped by field manager
  const { data: approvedTeams, isLoading: loadingTeams } = useQuery({
    queryKey: ["approved-teams", effectiveContractorId],
    queryFn: async () => {
      let query = supabase
        .from("team_assignments")
        .select("*")
        .eq("status", "approved");

      if (!isSuperAdmin && isContractor && effectiveContractorId) {
        query = query.eq("contractor_id", effectiveContractorId);
      }

      const { data: assignments, error: assignmentsError } = await query.order("field_manager_id");

      if (assignmentsError) throw assignmentsError;
      if (!assignments || assignments.length === 0) return [];

      const managerIds = [...new Set(assignments.map(a => a.field_manager_id))];
      const { data: managers } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", managerIds);

      const interviewerCodes = [...new Set(assignments.map(a => a.interviewer_code))];
      const { data: interviewers } = await supabase
        .from("interview_metadata")
        .select("interviewer_code, interviewer_name")
        .in("interviewer_code", interviewerCodes);

      const interviewerMap = new Map(
        interviewers?.map(i => [i.interviewer_code, i.interviewer_name])
      );

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
    queryKey: ["all-field-managers", effectiveContractorId],
    queryFn: async () => {
      const { data: fieldManagerRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "field_manager");

      if (!fieldManagerRoles || fieldManagerRoles.length === 0) return [];

      const managerIds = fieldManagerRoles.map(r => r.user_id);

      let profilesQuery = supabase
        .from("profiles")
        .select("id, full_name, email, contractor_id")
        .in("id", managerIds)
        .eq("is_approved", true);

      if (!isSuperAdmin && isContractor && effectiveContractorId) {
        profilesQuery = profilesQuery.eq("contractor_id", effectiveContractorId);
      }

      const { data: managers } = await profilesQuery.order("full_name");

      return managers || [];
    },
  });

  // Fetch unassigned interviewers
  const { data: unassignedInterviewers, isLoading: loadingUnassigned } = useQuery({
    queryKey: ["unassigned-interviewers", effectiveContractorId],
    queryFn: async () => {
      let metadataQuery = supabase
        .from("interview_metadata")
        .select("interviewer_code, interviewer_name, contractor_id");

      if (!isSuperAdmin && isContractor && effectiveContractorId) {
        metadataQuery = metadataQuery.eq("contractor_id", effectiveContractorId);
      }

      const { data: allInterviewers, error: interviewersError } = await metadataQuery;
      
      if (interviewersError) throw interviewersError;

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

      let assignmentsQuery = supabase
        .from("team_assignments")
        .select("interviewer_code")
        .eq("status", "approved");

      if (!isSuperAdmin && isContractor && effectiveContractorId) {
        assignmentsQuery = assignmentsQuery.eq("contractor_id", effectiveContractorId);
      }

      const { data: approvedAssignments } = await assignmentsQuery;

      const assignedCodes = approvedAssignments?.map(a => a.interviewer_code) || [];
      
      return uniqueInterviewers.filter(i => !assignedCodes.includes(i.code));
    },
  });

  // FM-Admin Assignments (Super Admin only)
  const { data: fmAdminAssignments = [], isLoading: loadingFmAdmin } = useQuery({
    queryKey: ["fm-admin-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("field_manager_admin_assignments")
        .select(`
          id,
          field_manager_id,
          admin_id,
          is_active,
          assigned_at
        `)
        .eq("is_active", true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: isSuperAdmin,
  });

  // Fetch all admins (Super Admin only)
  const { data: allAdmins = [] } = useQuery({
    queryKey: ["all-admins"],
    queryFn: async () => {
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (!adminRoles || adminRoles.length === 0) return [];

      const adminIds = adminRoles.map(r => r.user_id);
      const { data: admins } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", adminIds)
        .eq("is_approved", true);

      return admins || [];
    },
    enabled: isSuperAdmin,
  });

  // FM-SubContractor Assignments (Super Admin only)
  const { data: fmSubContractorAssignments = [], isLoading: loadingFmSubContractor } = useQuery({
    queryKey: ["fm-subcontractor-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("field_manager_subcontractor_assignments")
        .select(`
          id,
          field_manager_id,
          sub_contractor_id,
          is_active,
          assigned_at
        `)
        .eq("is_active", true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: isSuperAdmin,
  });

  // Fetch all sub-contractors (Super Admin only)
  const { data: allSubContractors = [] } = useQuery({
    queryKey: ["all-sub-contractors"],
    queryFn: async () => {
      const { data: subContractorRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "sub_contractor");

      if (!subContractorRoles || subContractorRoles.length === 0) return [];

      const subContractorIds = subContractorRoles.map(r => r.user_id);
      const { data: subContractors } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", subContractorIds)
        .eq("is_approved", true);

      return subContractors || [];
    },
    enabled: isSuperAdmin,
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
      queryClient.invalidateQueries({ queryKey: ["approved-teams"] });
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

  // FM-Admin assignment mutation
  const assignFmToAdminMutation = useMutation({
    mutationFn: async ({
      fieldManagerId,
      adminId,
    }: {
      fieldManagerId: string;
      adminId: string;
    }) => {
      if (!session?.user.id) throw new Error("Not authenticated");

      // Check for existing assignment
      const { data: existing } = await supabase
        .from("field_manager_admin_assignments")
        .select("id")
        .eq("field_manager_id", fieldManagerId)
        .eq("is_active", true)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("field_manager_admin_assignments")
          .update({
            admin_id: adminId,
            assigned_by: session.user.id,
            assigned_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("field_manager_admin_assignments")
          .insert({
            field_manager_id: fieldManagerId,
            admin_id: adminId,
            assigned_by: session.user.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fm-admin-assignments"] });
      toast({
        title: "Success",
        description: "Field manager assigned to admin.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign field manager.",
        variant: "destructive",
      });
    },
  });

  // FM-SubContractor assignment mutation
  const assignFmToSubContractorMutation = useMutation({
    mutationFn: async ({
      fieldManagerId,
      subContractorId,
    }: {
      fieldManagerId: string;
      subContractorId: string;
    }) => {
      if (!session?.user.id) throw new Error("Not authenticated");

      // Check for existing assignment
      const { data: existing } = await supabase
        .from("field_manager_subcontractor_assignments")
        .select("id")
        .eq("field_manager_id", fieldManagerId)
        .eq("is_active", true)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("field_manager_subcontractor_assignments")
          .update({
            sub_contractor_id: subContractorId,
            assigned_by: session.user.id,
            assigned_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("field_manager_subcontractor_assignments")
          .insert({
            field_manager_id: fieldManagerId,
            sub_contractor_id: subContractorId,
            assigned_by: session.user.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fm-subcontractor-assignments"] });
      toast({
        title: "Success",
        description: "Field manager assigned to sub-contractor.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign field manager.",
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

  const getAdminForFm = (fmId: string) => {
    const assignment = fmAdminAssignments.find(a => a.field_manager_id === fmId);
    if (!assignment) return null;
    return allAdmins.find(a => a.id === assignment.admin_id);
  };

  const getSubContractorForFm = (fmId: string) => {
    const assignment = fmSubContractorAssignments.find(a => a.field_manager_id === fmId);
    if (!assignment) return null;
    return allSubContractors.find(sc => sc.id === assignment.sub_contractor_id);
  };

  return (
    <Layout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Team Assignment Approvals</h1>
            <p className="text-sm text-muted-foreground">
              Review and approve field manager team assignment requests
            </p>
          </div>
        </div>

        <Accordion type="multiple" defaultValue={["pending", "active"]} className="space-y-4">
          {/* Pending Requests Accordion */}
          <AccordionItem value="pending" className="border rounded-lg">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <span className="font-semibold">Pending Requests ({pendingRequests?.length || 0})</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <p className="text-sm text-muted-foreground mb-4">
                Review requests from field managers to assign interviewers to their teams
              </p>
              {error && (
                <div className="bg-destructive/10 p-4 rounded-md mb-4">
                  <p className="text-destructive font-medium">Error loading requests:</p>
                  <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
                </div>
              )}
              {isLoading ? (
                <div className="flex justify-center p-8 sm:p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : pendingRequests && pendingRequests.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field Manager</TableHead>
                        <TableHead>Interviewer</TableHead>
                        <TableHead className="hidden sm:table-cell">Contractor</TableHead>
                        <TableHead className="hidden md:table-cell">Request Date</TableHead>
                        <TableHead className="hidden lg:table-cell">Notes</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium text-sm">
                                {(request.manager as any)?.full_name || "Unknown"}
                              </div>
                              <div className="text-xs text-muted-foreground hidden sm:block">
                                {(request.manager as any)?.email}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {request.interviewer_code}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className="text-xs">{request.contractor_id}</Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {format(new Date(request.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell max-w-[150px] truncate text-sm">
                            {request.notes || "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1 sm:gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApprove(request.id)}
                                disabled={updateAssignmentMutation.isPending}
                                className="gap-1 h-8 text-xs"
                              >
                                <CheckCircle className="h-3 w-3" />
                                <span className="hidden sm:inline">Approve</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleReject(request.id)}
                                disabled={updateAssignmentMutation.isPending}
                                className="gap-1 h-8 text-xs"
                              >
                                <XCircle className="h-3 w-3" />
                                <span className="hidden sm:inline">Reject</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center p-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No Pending Requests</p>
                  <p className="text-sm">
                    All team assignment requests have been processed.
                  </p>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Active Teams Accordion */}
          <AccordionItem value="active" className="border rounded-lg">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <span className="font-semibold">Active Teams ({approvedTeams?.length || 0})</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <p className="text-sm text-muted-foreground mb-4">
                Field managers and their assigned interviewers
              </p>
              {loadingTeams ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : approvedTeams && approvedTeams.length > 0 ? (
                <div className="space-y-4">
                  {approvedTeams.map(team => (
                    <div key={team.managerId} className="border rounded-lg p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div>
                          <h3 className="font-semibold text-sm sm:text-base">{team.managerName}</h3>
                          <p className="text-xs sm:text-sm text-muted-foreground">{team.managerEmail}</p>
                        </div>
                        <Badge variant="outline" className="w-fit">{team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}</Badge>
                      </div>
                      <div className="space-y-2">
                        {team.members.map(member => (
                          <div key={member.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded border bg-muted/30">
                            <div className="flex flex-wrap items-center gap-2 flex-1">
                              <Badge variant="secondary" className="text-xs">{member.interviewer_code}</Badge>
                              <span className="font-medium text-sm">{member.interviewer_name}</span>
                              <span className="text-xs text-muted-foreground hidden sm:inline">
                                • Assigned {format(new Date(member.approved_at), "MMM d, yyyy")}
                              </span>
                            </div>
                            <div className="w-full sm:w-auto">
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
                                <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs">
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
            </AccordionContent>
          </AccordionItem>

          {/* Unassigned Agents Accordion */}
          <AccordionItem value="unassigned" className="border rounded-lg">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                <span className="font-semibold">Unassigned Agents ({unassignedInterviewers?.length || 0})</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <p className="text-sm text-muted-foreground mb-4">
                Interviewers not currently assigned to any team
              </p>
              {loadingUnassigned ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : unassignedInterviewers && unassignedInterviewers.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="min-w-[500px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Interviewer</TableHead>
                        <TableHead className="hidden sm:table-cell">Name</TableHead>
                        <TableHead className="hidden md:table-cell">Contractor</TableHead>
                        <TableHead>Assign To Team</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unassignedInterviewers.map(interviewer => (
                        <TableRow key={interviewer.code}>
                          <TableCell>
                            <div className="font-medium text-sm">{interviewer.code}</div>
                            <div className="text-xs text-muted-foreground sm:hidden">{interviewer.name || "-"}</div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm">{interviewer.name || "-"}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline" className="text-xs">{interviewer.contractor_id}</Badge>
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
                              <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs">
                                <SelectValue placeholder="Select FM..." />
                              </SelectTrigger>
                              <SelectContent>
                                {allFieldManagers
                                  ?.filter(manager => manager.contractor_id === interviewer.contractor_id)
                                  .sort((a, b) => a.full_name.localeCompare(b.full_name))
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
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">All Agents Assigned</p>
                  <p className="text-sm">All interviewers are assigned to teams.</p>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* FM-Admin Assignments (Super Admin only) */}
          {isSuperAdmin && (
            <AccordionItem value="fm-admin" className="border rounded-lg">
              <AccordionTrigger className="px-6 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  <span className="font-semibold">Field Manager → Admin Assignments</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <p className="text-sm text-muted-foreground mb-4">
                  Assign field managers to admins for interview tracking visibility
                </p>
                {loadingFmAdmin ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : allFieldManagers && allFieldManagers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[500px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field Manager</TableHead>
                          <TableHead className="hidden sm:table-cell">Contractor</TableHead>
                          <TableHead className="hidden md:table-cell">Current Admin</TableHead>
                          <TableHead>Assign To Admin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allFieldManagers.map(fm => {
                          const currentAdmin = getAdminForFm(fm.id);
                          return (
                            <TableRow key={fm.id}>
                              <TableCell>
                                <div>
                                  <div className="font-medium text-sm">{fm.full_name}</div>
                                  <div className="text-xs text-muted-foreground">{fm.email}</div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <Badge variant="outline" className="text-xs">{fm.contractor_id}</Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                {currentAdmin ? (
                                  <Badge variant="secondary" className="text-xs">{currentAdmin.full_name}</Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">Not assigned</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={currentAdmin?.id || ""}
                                  onValueChange={(adminId) => {
                                    if (adminId && adminId !== currentAdmin?.id) {
                                      assignFmToAdminMutation.mutate({
                                        fieldManagerId: fm.id,
                                        adminId,
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs">
                                    <SelectValue placeholder="Select admin..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[...allAdmins].sort((a, b) => a.full_name.localeCompare(b.full_name)).map(admin => (
                                      <SelectItem key={admin.id} value={admin.id}>
                                        {admin.full_name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center p-8 text-muted-foreground">
                    <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No Field Managers</p>
                    <p className="text-sm">No approved field managers found.</p>
                  </div>
                )}
            </AccordionContent>
            </AccordionItem>
          )}

          {/* FM-SubContractor Assignments (Super Admin only) */}
          {isSuperAdmin && (
            <AccordionItem value="fm-subcontractor" className="border rounded-lg">
              <AccordionTrigger className="px-6 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  <span className="font-semibold">Field Manager → Sub-Contractor Assignments</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <p className="text-sm text-muted-foreground mb-4">
                  Assign field managers to sub-contractors for interview tracking visibility
                </p>
                {loadingFmSubContractor ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : allFieldManagers && allFieldManagers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[500px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field Manager</TableHead>
                          <TableHead className="hidden sm:table-cell">Contractor</TableHead>
                          <TableHead className="hidden md:table-cell">Current Sub-Contractor</TableHead>
                          <TableHead>Assign To Sub-Contractor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allFieldManagers.map(fm => {
                          const currentSubContractor = getSubContractorForFm(fm.id);
                          return (
                            <TableRow key={fm.id}>
                              <TableCell>
                                <div>
                                  <div className="font-medium text-sm">{fm.full_name}</div>
                                  <div className="text-xs text-muted-foreground">{fm.email}</div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <Badge variant="outline" className="text-xs">{fm.contractor_id}</Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                {currentSubContractor ? (
                                  <Badge variant="secondary" className="text-xs">{currentSubContractor.full_name}</Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">Not assigned</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={currentSubContractor?.id || ""}
                                  onValueChange={(subContractorId) => {
                                    if (subContractorId && subContractorId !== currentSubContractor?.id) {
                                      assignFmToSubContractorMutation.mutate({
                                        fieldManagerId: fm.id,
                                        subContractorId,
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs">
                                    <SelectValue placeholder="Select sub-contractor..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[...allSubContractors].sort((a, b) => a.full_name.localeCompare(b.full_name)).map(sc => (
                                      <SelectItem key={sc.id} value={sc.id}>
                                        {sc.full_name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center p-8 text-muted-foreground">
                    <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No Field Managers</p>
                    <p className="text-sm">No approved field managers found.</p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>
    </Layout>
  );
};

export default TeamApprovals;
