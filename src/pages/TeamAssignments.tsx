import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditPagination } from "@/components/AuditPagination";
import { AssignmentSummaryCards } from "@/components/assignments/AssignmentSummaryCards";
import { CreateTeamDialog } from "@/components/assignments/CreateTeamDialog";
import { AIAutoAssignDialog } from "@/components/assignments/AIAutoAssignDialog";
import { ManageTeamsDialog } from "@/components/assignments/ManageTeamsDialog";
import { format } from "date-fns";
import {
  Plus,
  Sparkles,
  Search,
  Settings,
  Users,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Undo2,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
} from "lucide-react";
import {
  useTeams,
  useUnassignedInterviews,
  useAssignments,
  useAssignInterviews,
  useUnassignInterview,
  useUpdateTypingStatus,
  UnassignedInterview,
  Assignment,
  Team,
} from "@/hooks/useTeamAssignments";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import JSZip from "jszip";

const TeamAssignments = () => {
  const [activeTab, setActiveTab] = useState("unassigned");
  const [searchTerm, setSearchTerm] = useState("");
  const [contractorFilter, setContractorFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"names" | "date">("names");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [selectedInterviews, setSelectedInterviews] = useState<Set<string>>(new Set());
  const [bulkAssignTeamId, setBulkAssignTeamId] = useState<string>("");
  
  // Dialog states
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showAIAssign, setShowAIAssign] = useState(false);
  const [showManageTeams, setShowManageTeams] = useState(false);
  const [unassignDialog, setUnassignDialog] = useState<{ open: boolean; assignment: Assignment | null }>({ open: false, assignment: null });
  const [exportingTeamId, setExportingTeamId] = useState<string | null>(null);
  
  // Expanded team sections for By Team view
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const queryClient = useQueryClient();
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const { data: unassignedInterviews = [], isLoading: unassignedLoading } = useUnassignedInterviews();
  const { data: assignments = [], isLoading: assignmentsLoading } = useAssignments();
  const assignInterviews = useAssignInterviews();
  const unassignInterview = useUnassignInterview();
  const updateTypingStatus = useUpdateTypingStatus();

  // Real-time subscription for assignment notifications
  useEffect(() => {
    const channel = supabase
      .channel('assignment-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'interview_assignments',
        },
        (payload) => {
          toast.info('New interview assigned to a team!', {
            description: 'The assignments list has been updated.',
          });
          queryClient.invalidateQueries({ queryKey: ["interview-assignments"] });
          queryClient.invalidateQueries({ queryKey: ["unassigned-interviews"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Get unique contractors for filter
  const contractors = useMemo(() => {
    const unique = new Set(unassignedInterviews.map((i) => i.contractor_id).filter(Boolean));
    return Array.from(unique) as string[];
  }, [unassignedInterviews]);

  // Filter and sort unassigned interviews
  const filteredUnassigned = useMemo(() => {
    let filtered = [...unassignedInterviews];

    if (searchTerm) {
      filtered = filtered.filter(
        (i) =>
          i.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          i.interviewer_code?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (contractorFilter !== "all") {
      filtered = filtered.filter((i) => i.contractor_id === contractorFilter);
    }

    filtered.sort((a, b) => {
      if (sortBy === "names") {
        return sortOrder === "asc" ? a.total_names - b.total_names : b.total_names - a.total_names;
      } else {
        const dateA = new Date(a.reviewed_at).getTime();
        const dateB = new Date(b.reviewed_at).getTime();
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      }
    });

    return filtered;
  }, [unassignedInterviews, searchTerm, contractorFilter, sortBy, sortOrder]);

  // Paginate
  const totalCount = filteredUnassigned.length;
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const paginatedUnassigned = filteredUnassigned.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Calculate totals
  const unassignedNames = unassignedInterviews.reduce((sum, i) => sum + i.total_names, 0);
  const assignedNames = assignments.reduce((sum, a) => sum + (a.total_names || 0), 0);

  // Group assignments by team
  const assignmentsByTeam = useMemo(() => {
    const grouped = new Map<string, typeof assignments>();
    assignments.forEach((assignment) => {
      const existing = grouped.get(assignment.team_id) || [];
      existing.push(assignment);
      grouped.set(assignment.team_id, existing);
    });
    return grouped;
  }, [assignments]);

  const toggleSelectAll = () => {
    if (selectedInterviews.size === paginatedUnassigned.length) {
      setSelectedInterviews(new Set());
    } else {
      setSelectedInterviews(new Set(paginatedUnassigned.map((i) => i.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedInterviews);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedInterviews(newSelected);
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignTeamId || selectedInterviews.size === 0) return;

    const toAssign = filteredUnassigned
      .filter((i) => selectedInterviews.has(i.id))
      .map((i) => ({
        auditId: i.id,
        teamId: bulkAssignTeamId,
        totalNames: i.total_names,
      }));

    await assignInterviews.mutateAsync(toAssign);
    setSelectedInterviews(new Set());
    setBulkAssignTeamId("");
  };

  const handleSingleAssign = async (interview: UnassignedInterview, teamId: string) => {
    await assignInterviews.mutateAsync([
      {
        auditId: interview.id,
        teamId,
        totalNames: interview.total_names,
      },
    ]);
  };

  const handleUnassign = async () => {
    if (!unassignDialog.assignment) return;
    await unassignInterview.mutateAsync(unassignDialog.assignment.id);
    setUnassignDialog({ open: false, assignment: null });
  };

  const handleTypingStatusChange = async (assignment: Assignment, newStatus: 'typing_in_progress' | 'typing_completed') => {
    await updateTypingStatus.mutateAsync({
      assignmentId: assignment.id,
      status: newStatus,
    });
  };

  const toggleTeamExpanded = (teamId: string) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setExpandedTeams(newExpanded);
  };

  const toggleSort = (field: "names" | "date") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const handleExportTeamPDFs = async (team: Team) => {
    setExportingTeamId(team.id);
    try {
      const { data, error } = await supabase.functions.invoke('export-team-pdfs', {
        body: { teamId: team.id, teamName: team.name }
      });

      if (error) throw error;
      
      if (!data?.files || data.files.length === 0) {
        toast.info(data?.message || 'No new assignments to export for this team');
        return;
      }

      toast.info(`Downloading ${data.files.length} PDFs...`);

      const zip = new JSZip();
      
      // Download and add each PDF to the zip
      for (const file of data.files) {
        try {
          const response = await fetch(file.url);
          if (response.ok) {
            const blob = await response.blob();
            zip.file(file.fileName, blob);
          }
        } catch (err) {
          console.error(`Failed to download ${file.fileName}:`, err);
        }
      }

      // Generate filename with date and time from export timestamp
      const exportDate = data.exportTimestamp ? new Date(data.exportTimestamp) : new Date();
      const dateStr = format(exportDate, 'yyyy-MM-dd_HH-mm');
      const sanitizedTeamName = team.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const fileName = `${sanitizedTeamName}_PDFs_${dateStr}.zip`;

      // Generate and download the zip
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Downloaded ${data.files.length} PDFs`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export PDFs');
    } finally {
      setExportingTeamId(null);
    }
  };

  const getTypingStatusBadge = (status: string) => {
    if (status === 'typing_completed') {
      return (
        <Badge className="bg-success text-success-foreground gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 text-orange-600 border-orange-300">
        <Clock className="h-3 w-3" />
        In Progress
      </Badge>
    );
  };

  const isLoading = teamsLoading || unassignedLoading || assignmentsLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Interview Team Assignments</h1>
            <p className="text-sm text-muted-foreground">
              Assign passed interviews to data entry teams
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowManageTeams(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Manage Teams
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCreateTeam(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Team
          </Button>
          <Button size="sm" onClick={() => setShowAIAssign(true)} disabled={unassignedInterviews.length === 0 || teams.length === 0}>
            <Sparkles className="h-4 w-4 mr-2" />
            AI Auto-Assign
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <AssignmentSummaryCards
        unassignedCount={unassignedInterviews.length}
        unassignedNames={unassignedNames}
        teamCount={teams.length}
        assignedCount={assignments.length}
        assignedNames={assignedNames}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="unassigned">
            Unassigned ({unassignedInterviews.length})
          </TabsTrigger>
          <TabsTrigger value="assigned">
            Assigned ({assignments.length})
          </TabsTrigger>
          <TabsTrigger value="by-team">By Team</TabsTrigger>
        </TabsList>

        {/* Unassigned Tab */}
        <TabsContent value="unassigned" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by interview ID or agent..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select
              value={contractorFilter}
              onValueChange={(v) => {
                setContractorFilter(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Contractor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Contractors</SelectItem>
                {contractors.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleSort("names")}
              className="gap-1"
            >
              <ArrowUpDown className="h-4 w-4" />
              Names {sortBy === "names" && (sortOrder === "asc" ? "↑" : "↓")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleSort("date")}
              className="gap-1"
            >
              <ArrowUpDown className="h-4 w-4" />
              Date {sortBy === "date" && (sortOrder === "asc" ? "↑" : "↓")}
            </Button>
          </div>

          {/* Bulk Assign */}
          {selectedInterviews.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">
                {selectedInterviews.size} selected
              </span>
              <Select value={bulkAssignTeamId} onValueChange={setBulkAssignTeamId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select team..." />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleBulkAssign}
                disabled={!bulkAssignTeamId || assignInterviews.isPending}
              >
                Assign Selected
              </Button>
            </div>
          )}

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {paginatedUnassigned.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No unassigned interviews found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedInterviews.size === paginatedUnassigned.length && paginatedUnassigned.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Interview</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Names</TableHead>
                      <TableHead>Passed Date</TableHead>
                      <TableHead className="text-right">Assign</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedUnassigned.map((interview) => (
                      <TableRow key={interview.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedInterviews.has(interview.id)}
                            onCheckedChange={() => toggleSelect(interview.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium font-mono text-sm">
                          {interview.file_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {interview.interviewer_code || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {interview.total_names.toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {interview.reviewed_at &&
                            format(new Date(interview.reviewed_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Select
                            onValueChange={(teamId) => handleSingleAssign(interview, teamId)}
                          >
                            <SelectTrigger className="w-[140px] h-8">
                              <SelectValue placeholder="Assign to..." />
                            </SelectTrigger>
                            <SelectContent>
                              {teams.map((team) => (
                                <SelectItem key={team.id} value={team.id}>
                                  {team.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <AuditPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(n) => {
              setItemsPerPage(n);
              setCurrentPage(1);
            }}
          />
        </TabsContent>

        {/* Assigned Tab */}
        <TabsContent value="assigned" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {assignments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No assigned interviews yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interview</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Names</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell className="font-medium font-mono text-sm">
                          {assignment.audit?.file_name || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge>{assignment.team?.name || "-"}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {(assignment.total_names || 0).toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={assignment.typing_status}
                            onValueChange={(v) => handleTypingStatusChange(assignment, v as 'typing_in_progress' | 'typing_completed')}
                          >
                            <SelectTrigger className="w-[140px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="typing_in_progress">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  In Progress
                                </div>
                              </SelectItem>
                              <SelectItem value="typing_completed">
                                <div className="flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Completed
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm">
                          {assignment.assigned_at &&
                            format(new Date(assignment.assigned_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setUnassignDialog({ open: true, assignment })}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Team Tab */}
        <TabsContent value="by-team" className="space-y-4">
          {teams.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12 text-muted-foreground">
                No teams created yet
              </CardContent>
            </Card>
          ) : (
            teams.map((team) => {
              const teamAssignments = assignmentsByTeam.get(team.id) || [];
              const teamNames = teamAssignments.reduce((sum, a) => sum + (a.total_names || 0), 0);
              const completedCount = teamAssignments.filter((a) => a.typing_status === 'typing_completed').length;
              const isExpanded = expandedTeams.has(team.id);

              return (
                <Card key={team.id}>
                  <CardHeader
                    className="cursor-pointer"
                    onClick={() => toggleTeamExpanded(team.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{team.name}</CardTitle>
                        <CardDescription>
                          {teamAssignments.length} interviews • {teamNames.toLocaleString()} names • {completedCount}/{teamAssignments.length} completed
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportTeamPDFs(team);
                          }}
                          disabled={exportingTeamId === team.id || teamAssignments.length === 0}
                        >
                          {exportingTeamId === team.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent>
                      {teamAssignments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No interviews assigned to this team yet
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Interview</TableHead>
                              <TableHead>Names</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Assigned Date</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {teamAssignments.map((assignment) => (
                              <TableRow key={assignment.id}>
                                <TableCell className="font-mono text-sm">
                                  {assignment.audit?.file_name || "-"}
                                </TableCell>
                                <TableCell>
                                  {(assignment.total_names || 0).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                  {getTypingStatusBadge(assignment.typing_status)}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {assignment.assigned_at &&
                                    format(new Date(assignment.assigned_at), "MMM d, yyyy")}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setUnassignDialog({ open: true, assignment });
                                    }}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Undo2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CreateTeamDialog open={showCreateTeam} onOpenChange={setShowCreateTeam} />
      <AIAutoAssignDialog
        open={showAIAssign}
        onOpenChange={setShowAIAssign}
        teams={teams}
        unassignedInterviews={unassignedInterviews}
      />
      <ManageTeamsDialog open={showManageTeams} onOpenChange={setShowManageTeams} teams={teams} />
      
      {/* Unassign Confirmation Dialog */}
      <AlertDialog open={unassignDialog.open} onOpenChange={(open) => setUnassignDialog({ open, assignment: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unassign Interview</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unassign "{unassignDialog.assignment?.audit?.file_name}" from {unassignDialog.assignment?.team?.name}? 
              This will move it back to the unassigned pool.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnassign} disabled={unassignInterview.isPending}>
              Unassign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeamAssignments;