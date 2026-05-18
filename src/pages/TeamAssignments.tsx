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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  History,
} from "lucide-react";
import {
  useTeams,
  useUnassignedInterviews,
  useAssignments,
  useAssignInterviews,
  useUnassignInterview,
  useUpdateTypingStatus,
  useExportBatches,
  useBulkMarkComplete,
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
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number; fileName: string; phase: string } | null>(null);
  const [selectedAssignedInterviews, setSelectedAssignedInterviews] = useState<Set<string>>(new Set());
  
  // Export history pagination
  const [exportHistoryPage, setExportHistoryPage] = useState(1);
  const [exportHistoryItemsPerPage, setExportHistoryItemsPerPage] = useState(10);
  
  // Expanded team sections for By Team view
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const queryClient = useQueryClient();
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const { data: unassignedInterviews = [], isLoading: unassignedLoading } = useUnassignedInterviews();
  const { data: assignments = [], isLoading: assignmentsLoading } = useAssignments();
  const { data: exportBatches = [] } = useExportBatches();
  const assignInterviews = useAssignInterviews();
  const unassignInterview = useUnassignInterview();
  const updateTypingStatus = useUpdateTypingStatus();
  const bulkMarkComplete = useBulkMarkComplete();

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

  // Sort export batches by date descending and paginate
  const sortedExportBatches = useMemo(() => {
    return [...exportBatches].sort((a, b) => 
      new Date(b.exported_at).getTime() - new Date(a.exported_at).getTime()
    );
  }, [exportBatches]);

  const exportHistoryTotalPages = Math.ceil(sortedExportBatches.length / exportHistoryItemsPerPage);
  const paginatedExportBatches = sortedExportBatches.slice(
    (exportHistoryPage - 1) * exportHistoryItemsPerPage,
    exportHistoryPage * exportHistoryItemsPerPage
  );

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

  // Toggle selection for assigned interviews (bulk mark complete)
  const toggleSelectAssigned = (id: string) => {
    const newSelected = new Set(selectedAssignedInterviews);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedAssignedInterviews(newSelected);
  };

  // Get incomplete assignments for bulk selection
  const incompleteAssignments = assignments.filter(a => a.entry_status !== 'data_entry_complete');
  
  const toggleSelectAllAssigned = () => {
    if (selectedAssignedInterviews.size === incompleteAssignments.length) {
      setSelectedAssignedInterviews(new Set());
    } else {
      setSelectedAssignedInterviews(new Set(incompleteAssignments.map(a => a.id)));
    }
  };

  const handleBulkMarkComplete = async () => {
    if (selectedAssignedInterviews.size === 0) return;
    await bulkMarkComplete.mutateAsync(Array.from(selectedAssignedInterviews));
    setSelectedAssignedInterviews(new Set());
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

  const handleExportTeamPDFs = async (team: Team, batchIdToRedownload?: string) => {
    setExportingTeamId(team.id);
    setExportProgress({ current: 0, total: 0, fileName: 'Preparing…', phase: 'preparing' });
    try {
      const { data, error } = await supabase.functions.invoke('export-team-pdfs', {
        body: { teamId: team.id, teamName: team.name, batchId: batchIdToRedownload }
      });

      if (error) throw error;
      
      if (!data?.files || data.files.length === 0) {
        toast.info(data?.message || 'No new assignments to export for this team');
        return;
      }

      const zip = new JSZip();
      const totalFiles = data.files.length;
      setExportProgress({ current: 0, total: totalFiles, fileName: 'Starting download…', phase: 'downloading' });

      // Download and add each PDF to the zip
      for (let i = 0; i < data.files.length; i++) {
        const file = data.files[i];
        setExportProgress({ current: i, total: totalFiles, fileName: file.fileName, phase: 'downloading' });
        try {
          // Download PDF
          const response = await fetch(file.url);
          if (response.ok) {
            const blob = await response.blob();
            zip.file(file.fileName, blob);
          }
          
          // Download metadata ZIP if present (for re-audited interviews)
          if (file.metadataUrl && file.metadataFileName) {
            const metaResponse = await fetch(file.metadataUrl);
            if (metaResponse.ok) {
              const metaBlob = await metaResponse.blob();
              zip.file(file.metadataFileName, metaBlob);
            }
          }
        } catch (err) {
          console.error(`Failed to download ${file.fileName}:`, err);
        }
        setExportProgress({ current: i + 1, total: totalFiles, fileName: file.fileName, phase: 'downloading' });
      }

      // Generate filename with date and time from export timestamp
      const exportDate = data.exportTimestamp ? new Date(data.exportTimestamp) : new Date();
      const dateStr = format(exportDate, 'yyyy-MM-dd_HH-mm');
      const sanitizedTeamName = team.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const fileName = `${sanitizedTeamName}_PDFs_${dateStr}.zip`;

      setExportProgress({ current: totalFiles, total: totalFiles, fileName: 'Zipping files…', phase: 'zipping' });
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
      
      // Refresh export batches
      queryClient.invalidateQueries({ queryKey: ["team-export-batches"] });
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export PDFs');
    } finally {
      setExportingTeamId(null);
      setExportProgress(null);
    }
  };

  // Get export batches for a team
  const getTeamBatches = (teamId: string) => {
    return exportBatches.filter(b => b.team_id === teamId);
  };

  const getTypingStatusBadge = (assignment: Assignment) => {
    if (assignment.entry_status === 'data_entry_complete' || assignment.typing_status === 'typing_completed') {
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
        teamStats={teams.map(team => {
          const teamAssignments = assignmentsByTeam.get(team.id) || [];
          return {
            teamName: team.name,
            assigned: teamAssignments.length,
            completed: teamAssignments.filter(a => a.entry_status === 'data_entry_complete' || a.typing_status === 'typing_completed').length,
          };
        })}
      />

      {/* Export History Accordion - At Top (collapsed by default) */}
      {exportBatches.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="export-history" className="border rounded-lg">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4" />
                <span className="font-semibold">Export History</span>
                <Badge variant="secondary">{exportBatches.length} batches</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead>Names</TableHead>
                    <TableHead>Exported At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedExportBatches.map((batch) => {
                    const team = teams.find(t => t.id === batch.team_id);
                    return (
                      <TableRow key={batch.id}>
                        <TableCell>{team?.name || 'Unknown Team'}</TableCell>
                        <TableCell>{batch.total_files} PDFs</TableCell>
                        <TableCell>{batch.total_names.toLocaleString()}</TableCell>
                        <TableCell>{format(new Date(batch.exported_at), "MMM d, yyyy h:mm a")}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => team && handleExportTeamPDFs(team, batch.export_batch_id)}
                            disabled={!team || exportingTeamId === team?.id}
                          >
                            {exportingTeamId === team?.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              
              {/* Pagination */}
              {exportHistoryTotalPages > 1 && (
                <div className="mt-4">
                  <AuditPagination
                    currentPage={exportHistoryPage}
                    totalPages={exportHistoryTotalPages}
                    totalCount={exportBatches.length}
                    itemsPerPage={exportHistoryItemsPerPage}
                    onPageChange={setExportHistoryPage}
                    onItemsPerPageChange={setExportHistoryItemsPerPage}
                  />
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

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
                {[...contractors].sort((a, b) => a.localeCompare(b)).map((c) => (
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
          {/* Bulk Actions Bar */}
          {selectedAssignedInterviews.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">
                {selectedAssignedInterviews.size} selected
              </span>
              <Button
                size="sm"
                onClick={handleBulkMarkComplete}
                disabled={bulkMarkComplete.isPending}
                className="gap-1"
              >
                {bulkMarkComplete.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Mark as Completed
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedAssignedInterviews(new Set())}
              >
                Clear Selection
              </Button>
            </div>
          )}
          
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
                      <TableHead className="w-12">
                        <Checkbox
                          checked={incompleteAssignments.length > 0 && selectedAssignedInterviews.size === incompleteAssignments.length}
                          onCheckedChange={toggleSelectAllAssigned}
                          disabled={incompleteAssignments.length === 0}
                        />
                      </TableHead>
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
                      <TableRow key={assignment.id} className={assignment.is_flagged_for_issue && !assignment.issue_resolved_at ? "bg-orange-50 dark:bg-orange-950/20" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedAssignedInterviews.has(assignment.id)}
                            onCheckedChange={() => toggleSelectAssigned(assignment.id)}
                            disabled={assignment.entry_status === 'data_entry_complete'}
                          />
                        </TableCell>
                        <TableCell className="font-medium font-mono text-sm">
                          <div className="flex items-center gap-2">
                            {assignment.audit?.file_name || "-"}
                            {assignment.is_flagged_for_issue && !assignment.issue_resolved_at && (
                              <Badge variant="destructive" className="text-[10px]">Issue</Badge>
                            )}
                          </div>
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
                          {assignment.entry_status === 'data_entry_complete' ? (
                            <Badge className="bg-success text-success-foreground gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Completed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-orange-600 border-orange-300">
                              <Clock className="h-3 w-3" />
                              In Progress
                            </Badge>
                          )}
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
              const completedCount = teamAssignments.filter((a) => a.entry_status === 'data_entry_complete' || a.typing_status === 'typing_completed').length;
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
                                  {getTypingStatusBadge(assignment)}
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