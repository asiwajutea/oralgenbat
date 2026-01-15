import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Users,
  UserPlus,
  Check,
  X,
  Search,
  ArrowLeftRight,
  Loader2,
  Building2,
  Clock,
  CheckCircle2,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";
import Layout from "@/components/Layout";

const SubContractorTeamManagement = () => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [reassignSelections, setReassignSelections] = useState<Record<string, string>>({});
  const [assignSelections, setAssignSelections] = useState<Record<string, string>>({});

  const effectiveContractorId = profile?.active_contractor_id || profile?.contractor_id;

  // Get assigned field managers for this sub-contractor
  const { data: assignedManagers = [], isLoading: loadingManagers } = useQuery({
    queryKey: ["subcontractor-assigned-fms", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // First get the assignments
      const { data: assignments, error } = await supabase
        .from("field_manager_subcontractor_assignments")
        .select("field_manager_id")
        .eq("sub_contractor_id", user.id)
        .eq("is_active", true);

      if (error) throw error;
      if (!assignments || assignments.length === 0) return [];

      // Use RPC to get field manager names (bypasses RLS)
      const fmIds = assignments.map(a => a.field_manager_id);
      const profilePromises = fmIds.map(async (fmId) => {
        const { data: name } = await supabase.rpc("get_user_display_name", { 
          _user_id: fmId 
        });
        return { 
          id: fmId, 
          full_name: name || "Unknown",
          email: null,
          contractor_id: null
        };
      });
      const profiles = await Promise.all(profilePromises);

      // Combine the data
      return assignments.map(a => ({
        field_manager_id: a.field_manager_id,
        profiles: profiles.find(p => p.id === a.field_manager_id) || null
      }));
    },
    enabled: !!user?.id,
  });

  const assignedManagerIds = assignedManagers.map((m: any) => m.field_manager_id);

  // Get pending requests from assigned field managers
  const { data: pendingRequests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ["subcontractor-pending-requests", assignedManagerIds, effectiveContractorId],
    queryFn: async () => {
      if (assignedManagerIds.length === 0 || !effectiveContractorId) return [];

      const { data, error } = await supabase
        .from("team_assignments")
        .select(`
          id,
          interviewer_code,
          field_manager_id,
          contractor_id,
          notes,
          created_at
        `)
        .eq("status", "pending")
        .eq("contractor_id", effectiveContractorId)
        .in("field_manager_id", assignedManagerIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Get FM names using RPC
      const uniqueFmIds = [...new Set(data.map(d => d.field_manager_id))];
      const fmNamePromises = uniqueFmIds.map(async (fmId) => {
        const { data: name } = await supabase.rpc("get_user_display_name", { _user_id: fmId });
        return { id: fmId, name: name || "Unknown" };
      });
      const fmNames = await Promise.all(fmNamePromises);
      const fmNameMap = Object.fromEntries(fmNames.map(f => [f.id, f.name]));

      return data.map(item => ({
        ...item,
        fm_name: fmNameMap[item.field_manager_id] || "Unknown"
      }));
    },
    enabled: assignedManagerIds.length > 0 && !!effectiveContractorId,
  });

  // Get approved team members grouped by field manager
  const { data: teamMembers = [], isLoading: loadingTeam } = useQuery({
    queryKey: ["subcontractor-team-members", assignedManagerIds, effectiveContractorId],
    queryFn: async () => {
      if (assignedManagerIds.length === 0 || !effectiveContractorId) return [];

      const { data, error } = await supabase
        .from("team_assignments")
        .select(`
          id,
          interviewer_code,
          field_manager_id,
          contractor_id,
          approved_at
        `)
        .eq("status", "approved")
        .eq("contractor_id", effectiveContractorId)
        .in("field_manager_id", assignedManagerIds)
        .order("interviewer_code", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: assignedManagerIds.length > 0 && !!effectiveContractorId,
  });

  // Get interviewer names from metadata
  const { data: interviewerNames = {} } = useQuery({
    queryKey: ["interviewer-names", effectiveContractorId],
    queryFn: async () => {
      if (!effectiveContractorId) return {};

      const { data, error } = await supabase
        .from("interview_metadata")
        .select("interviewer_code, interviewer_name")
        .eq("contractor_id", effectiveContractorId);

      if (error) throw error;

      const names: Record<string, string> = {};
      data?.forEach((m) => {
        if (m.interviewer_code && m.interviewer_name) {
          names[m.interviewer_code] = m.interviewer_name;
        }
      });
      return names;
    },
    enabled: !!effectiveContractorId,
  });

  // Get unassigned agents (interviewers not in any approved team)
  const { data: unassignedAgents = [], isLoading: loadingUnassigned } = useQuery({
    queryKey: ["subcontractor-unassigned-agents", effectiveContractorId, teamMembers],
    queryFn: async () => {
      if (!effectiveContractorId) return [];

      // Get all unique interviewer codes for this contractor
      const { data: allInterviewers, error } = await supabase
        .from("interview_metadata")
        .select("interviewer_code, interviewer_name")
        .eq("contractor_id", effectiveContractorId);

      if (error) throw error;

      const uniqueInterviewers = new Map();
      allInterviewers?.forEach((i) => {
        if (i.interviewer_code && !uniqueInterviewers.has(i.interviewer_code)) {
          uniqueInterviewers.set(i.interviewer_code, i.interviewer_name || i.interviewer_code);
        }
      });

      // Get assigned codes
      const assignedCodes = new Set(teamMembers.map((t: any) => t.interviewer_code));

      // Filter unassigned
      const unassigned: { code: string; name: string }[] = [];
      uniqueInterviewers.forEach((name, code) => {
        if (!assignedCodes.has(code)) {
          unassigned.push({ code, name });
        }
      });

      return unassigned.sort((a, b) => a.code.localeCompare(b.code));
    },
    enabled: !!effectiveContractorId,
  });

  // Approve/Reject mutation
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("team_assignments")
        .update({
          status,
          approved_at: status === "approved" ? new Date().toISOString() : null,
          approved_by: user?.id,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(`Request ${status === "approved" ? "approved" : "rejected"}`);
      queryClient.invalidateQueries({ queryKey: ["subcontractor-pending-requests"] });
      queryClient.invalidateQueries({ queryKey: ["subcontractor-team-members"] });
      queryClient.invalidateQueries({ queryKey: ["subcontractor-unassigned-agents"] });
    },
    onError: (error: any) => {
      toast.error("Failed to update request", { description: error.message });
    },
  });

  // Reassign agent mutation
  const reassignAgentMutation = useMutation({
    mutationFn: async ({ assignmentId, newManagerId }: { assignmentId: string; newManagerId: string }) => {
      const { error } = await supabase
        .from("team_assignments")
        .update({
          field_manager_id: newManagerId,
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        })
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agent reassigned successfully");
      queryClient.invalidateQueries({ queryKey: ["subcontractor-team-members"] });
      setReassignSelections({});
    },
    onError: (error: any) => {
      toast.error("Failed to reassign agent", { description: error.message });
    },
  });

  // Direct assign agent mutation
  const assignAgentMutation = useMutation({
    mutationFn: async ({ code, managerId }: { code: string; managerId: string }) => {
      const { error } = await supabase.from("team_assignments").insert({
        interviewer_code: code,
        field_manager_id: managerId,
        contractor_id: effectiveContractorId,
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agent assigned successfully");
      queryClient.invalidateQueries({ queryKey: ["subcontractor-team-members"] });
      queryClient.invalidateQueries({ queryKey: ["subcontractor-unassigned-agents"] });
      setAssignSelections({});
    },
    onError: (error: any) => {
      toast.error("Failed to assign agent", { description: error.message });
    },
  });

  // Group team members by field manager
  const teamByManager = teamMembers.reduce((acc: Record<string, any[]>, member: any) => {
    const fmId = member.field_manager_id;
    if (!acc[fmId]) acc[fmId] = [];
    acc[fmId].push(member);
    return acc;
  }, {});

  // Filter unassigned agents by search
  const filteredUnassigned = unassignedAgents.filter(
    (a) =>
      a.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isLoading = loadingManagers || loadingRequests || loadingTeam || loadingUnassigned;

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Team Management
            </h1>
            <p className="text-muted-foreground">
              Manage your assigned field managers and their teams
            </p>
          </div>
          {effectiveContractorId && (
            <Badge variant="outline" className="text-sm">
              Contractor: {effectiveContractorId}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Accordion type="multiple" defaultValue={["managers", "pending", "teams"]} className="space-y-4">
            {/* Assigned Field Managers */}
            <AccordionItem value="managers" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <span className="font-semibold">My Assigned Field Managers</span>
                  <Badge variant="secondary">{assignedManagers.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {assignedManagers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-6">
                    No field managers assigned yet. Contact a Super Admin to assign field managers.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {assignedManagers.map((assignment: any) => {
                      const memberCount = teamByManager[assignment.field_manager_id]?.length || 0;
                      return (
                        <Card key={assignment.field_manager_id}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{assignment.full_name || "Unknown"}</p>
                              </div>
                              <Badge variant="outline" className="gap-1">
                                <Users className="h-3 w-3" />
                                {memberCount}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Pending Requests */}
            <AccordionItem value="pending" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  <span className="font-semibold">Pending Requests</span>
                  {pendingRequests.length > 0 && (
                    <Badge variant="destructive">{pendingRequests.length}</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {pendingRequests.length === 0 ? (
                  <p className="text-muted-foreground text-center py-6">
                    No pending requests from your assigned field managers.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Interviewer Code</TableHead>
                        <TableHead>Field Manager</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequests.map((request: any) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">
                            {request.interviewer_code}
                            {interviewerNames[request.interviewer_code] && (
                              <span className="text-muted-foreground ml-2">
                                ({interviewerNames[request.interviewer_code]})
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{request.fm_name || "Unknown"}</TableCell>
                          <TableCell>
                            {new Date(request.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {request.notes || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => updateAssignmentMutation.mutate({ id: request.id, status: "approved" })}
                                disabled={updateAssignmentMutation.isPending}
                              >
                                <Check className="h-3 w-3" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1 text-destructive"
                                onClick={() => updateAssignmentMutation.mutate({ id: request.id, status: "rejected" })}
                                disabled={updateAssignmentMutation.isPending}
                              >
                                <X className="h-3 w-3" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Team Members by Field Manager */}
            <AccordionItem value="teams" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">Team Members by Field Manager</span>
                  <Badge variant="secondary">{teamMembers.length} agents</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {Object.keys(teamByManager).length === 0 ? (
                  <p className="text-muted-foreground text-center py-6">
                    No approved team members yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {assignedManagers.map((assignment: any) => {
                      const members = teamByManager[assignment.field_manager_id] || [];
                      return (
                        <Card key={assignment.field_manager_id}>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center justify-between">
                              <span>{assignment.full_name || "Unknown"}</span>
                              <Badge variant="outline">{members.length} members</Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {members.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No team members yet.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Interviewer Code</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Reassign To</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {members.map((member: any) => (
                                    <TableRow key={member.id}>
                                      <TableCell className="font-mono">{member.interviewer_code}</TableCell>
                                      <TableCell>
                                        {interviewerNames[member.interviewer_code] || "-"}
                                      </TableCell>
                                      <TableCell>
                                        <Select
                                          value={reassignSelections[member.id] || ""}
                                          onValueChange={(v) =>
                                            setReassignSelections({ ...reassignSelections, [member.id]: v })
                                          }
                                        >
                                          <SelectTrigger className="w-[180px]">
                                            <SelectValue placeholder="Select manager" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {assignedManagers
                                              .filter((m: any) => m.field_manager_id !== member.field_manager_id)
                                              .map((m: any) => (
                                                <SelectItem key={m.field_manager_id} value={m.field_manager_id}>
                                                  {m.full_name || "Unknown"}
                                                </SelectItem>
                                              ))}
                                          </SelectContent>
                                        </Select>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="gap-1"
                                          disabled={
                                            !reassignSelections[member.id] || reassignAgentMutation.isPending
                                          }
                                          onClick={() =>
                                            reassignAgentMutation.mutate({
                                              assignmentId: member.id,
                                              newManagerId: reassignSelections[member.id],
                                            })
                                          }
                                        >
                                          <ArrowLeftRight className="h-3 w-3" />
                                          Reassign
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Unassigned Agents */}
            <AccordionItem value="unassigned" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <UserMinus className="h-5 w-5" />
                  <span className="font-semibold">Unassigned Agents</span>
                  <Badge variant="outline">{unassignedAgents.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by code or name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 max-w-sm"
                    />
                  </div>

                  {filteredUnassigned.length === 0 ? (
                    <p className="text-muted-foreground text-center py-6">
                      {unassignedAgents.length === 0
                        ? "All agents are assigned to field managers."
                        : "No agents match your search."}
                    </p>
                  ) : (
                    <>
                      {/* Desktop Table View */}
                      <div className="hidden md:block">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Interviewer Code</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Assign To</TableHead>
                              <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredUnassigned.slice(0, 20).map((agent) => (
                              <TableRow key={agent.code}>
                                <TableCell className="font-mono">{agent.code}</TableCell>
                                <TableCell>{agent.name}</TableCell>
                                <TableCell>
                                  <Select
                                    value={assignSelections[agent.code] || ""}
                                    onValueChange={(v) =>
                                      setAssignSelections({ ...assignSelections, [agent.code]: v })
                                    }
                                  >
                                    <SelectTrigger className="w-[180px]">
                                      <SelectValue placeholder="Select manager" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {assignedManagers.map((m: any) => (
                                        <SelectItem key={m.field_manager_id} value={m.field_manager_id}>
                                          {m.full_name || "Unknown"}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    className="gap-1"
                                    disabled={!assignSelections[agent.code] || assignAgentMutation.isPending}
                                    onClick={() =>
                                      assignAgentMutation.mutate({
                                        code: agent.code,
                                        managerId: assignSelections[agent.code],
                                      })
                                    }
                                  >
                                    <UserPlus className="h-3 w-3" />
                                    Assign
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile Accordion View */}
                      <div className="md:hidden">
                        <Accordion type="single" collapsible className="space-y-2">
                          {filteredUnassigned.slice(0, 20).map((agent) => (
                            <AccordionItem
                              key={agent.code}
                              value={agent.code}
                              className="border rounded-lg bg-card"
                            >
                              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                                <div className="flex items-center justify-between w-full pr-2">
                                  <div className="flex items-center gap-3">
                                    <Badge variant="secondary" className="font-mono text-xs">
                                      {agent.code}
                                    </Badge>
                                    <span className="text-sm font-medium truncate max-w-[140px]">
                                      {agent.name}
                                    </span>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-4 pb-4">
                                <div className="space-y-4">
                                  {/* Agent Details */}
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                      <p className="text-muted-foreground text-xs">Code</p>
                                      <p className="font-mono font-medium">{agent.code}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground text-xs">Name</p>
                                      <p className="font-medium">{agent.name}</p>
                                    </div>
                                  </div>

                                  {/* Assign To Field */}
                                  <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">Assign to Field Manager</p>
                                    <Select
                                      value={assignSelections[agent.code] || ""}
                                      onValueChange={(v) =>
                                        setAssignSelections({ ...assignSelections, [agent.code]: v })
                                      }
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select manager" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {assignedManagers.map((m: any) => (
                                          <SelectItem key={m.field_manager_id} value={m.field_manager_id}>
                                            {m.full_name || "Unknown"}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {/* Action Button */}
                                  <Button
                                    className="w-full gap-2"
                                    disabled={!assignSelections[agent.code] || assignAgentMutation.isPending}
                                    onClick={() =>
                                      assignAgentMutation.mutate({
                                        code: agent.code,
                                        managerId: assignSelections[agent.code],
                                      })
                                    }
                                  >
                                    <UserPlus className="h-4 w-4" />
                                    Assign Agent
                                  </Button>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </div>
                    </>
                  )}
                  {filteredUnassigned.length > 20 && (
                    <p className="text-sm text-muted-foreground text-center">
                      Showing 20 of {filteredUnassigned.length} agents. Use search to find specific agents.
                    </p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </Layout>
  );
};

export default SubContractorTeamManagement;
