import { useState, useMemo, useRef, useEffect } from "react";
import { usePersistentPageSize } from "@/hooks/usePersistentPageSize";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@/utils/compressPdf";
import { FloatingUploadProgress, type UploadProgressData } from "@/components/FloatingUploadProgress";
import { 
  Search, 
  Download,
  FileText,
  Calendar,
  Users,
  Loader2,
  ArrowUpDown,
  Filter,
  X,
  Eye,
  CheckCircle,
  XCircle,
  FileCheck,
  FolderOpen,
  Upload,
  ChevronDown,
  AlertTriangle,
  Flag,
  FileArchive,
  MessageCircle,
  Flame,
  MoreHorizontal,
  Pencil,
  Info
} from "lucide-react";
import { format } from "date-fns";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { FailedInterviewModal } from "@/components/tracking/FailedInterviewModal";
import { ViewIssueDialog } from "@/components/tracking/ViewIssueDialog";
import { BulkMetadataUploadDialog } from "@/components/tracking/BulkMetadataUploadDialog";
import { BulkPdfUploadDialog } from "@/components/tracking/BulkPdfUploadDialog";
import { UploadLockGuard } from "@/components/upload/UploadLockGuard";
import { MarkResolvedDialog } from "@/components/tracking/MarkResolvedDialog";
import { ResolvedCommentsModal } from "@/components/tracking/ResolvedCommentsModal";
import { AuditPagination } from "@/components/AuditPagination";
import SendToBurnDialog from "@/components/SendToBurnDialog";
import { useBurnHistory } from "@/hooks/useBurnHistory";
import { BurnHistoryIcon } from "@/components/BurnHistoryIcon";
import { AdvancedFiltersPanel } from "@/components/AdvancedFiltersPanel";
import { AdvancedFilterState, emptyAdvancedFilter, matchesAdvancedFilter, isAdvancedFilterActive } from "@/lib/parseFailureReasons";
import { ReassignFMDialog } from "@/components/tracking/ReassignFMDialog";
import { toast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useIsMobile } from "@/hooks/use-mobile";
import { useResolveIssue } from "@/hooks/useTeamAssignments";

interface TrackingInterview {
  id: string;
  file_name: string;
  file_url: string | null;
  status: string;
  reviewed_at: string | null;
  review_comment: string | null;
  action_plan: string | null;
  artifact_correction: string[] | null;
  field_manager: string | null;
  total_names: number | null;
  interviewee_name: string | null;
  interview_date: string | null;
  last_modified: string | null;
  has_metadata: boolean;
  has_pdf: boolean;
  team_assigned: boolean;
  team_name: string | null;
  entry_status: string | null;
  is_flagged_for_issue: boolean;
  issue_comment: string | null;
  flagged_by: string | null;
  flagged_at: string | null;
  issue_resolved_at: string | null;
  issue_resolved_by: string | null;
  resolve_comment: string | null;
  assignment_id: string | null;
  artifact_correction_resolved_at: string | null;
  artifact_correction_resolved_by: string | null;
  has_resolution_comments: boolean;
  unread_comment_count: number;
  passed_with_failures: boolean;
  pass_override_reason: string | null;
  pass_override_action_plan: string | null;
  contractor_id: string | null;
  interviewer_code: string | null;
}

const STORAGE_KEYS = {
  currentPage: "interviewTracking_currentPage",
  itemsPerPage: "interviewTracking_itemsPerPage",
  sortField: "interviewTracking_sortField",
  sortOrder: "interviewTracking_sortOrder",
  statusFilter: "interviewTracking_statusFilter",
  metadataFilter: "interviewTracking_metadataFilter",
  contractorFilter: "interviewTracking_contractorFilter",
  fmFilter: "interviewTracking_fmFilter",
  searchQuery: "interviewTracking_searchQuery",
};

const InterviewTracking = () => {
  const { user, userRole, profile } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const isOnline = useOnlineStatus();

  // Replicating AdminReviewHistory persistent optimization variables
  const [searchInput, setSearchInput] = useState(() => localStorage.getItem(STORAGE_KEYS.searchQuery) || "");
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem(STORAGE_KEYS.searchQuery) || "");
  
  const [sortField, setSortField] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.sortField) || "last_modified");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => (localStorage.getItem(STORAGE_KEYS.sortOrder) as "asc" | "desc") || "desc");
  
  const [currentPage, setCurrentPage] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.currentPage);
    return saved ? parseInt(saved, 10) : 1;
  });
  const [itemsPerPage, setItemsPerPage] = usePersistentPageSize("interview-tracking", 20);

  const [filters, setFilters] = useState(() => ({
    fieldManager: localStorage.getItem(STORAGE_KEYS.fmFilter) || "",
    status: localStorage.getItem(STORAGE_KEYS.statusFilter) || "",
    startDate: "",
    endDate: "",
    metadataStatus: localStorage.getItem(STORAGE_KEYS.metadataFilter) || "",
    contractor: localStorage.getItem(STORAGE_KEYS.contractorFilter) || "",
  }));
  
  const [showFilters, setShowFilters] = useState(false);

  // Debouncing Search inputs exactly like AdminReviewHistory
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(searchInput);
      setCurrentPage(1);
      localStorage.setItem(STORAGE_KEYS.searchQuery, searchInput);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchInput]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.currentPage, currentPage.toString());
  }, [currentPage]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sortField, sortField);
    localStorage.setItem(STORAGE_KEYS.sortOrder, sortOrder);
  }, [sortField, sortOrder]);

  const updateFilterState = (updater: Partial<typeof filters>) => {
    setFilters(prev => {
      const updated = { ...prev, ...updater };
      localStorage.setItem(STORAGE_KEYS.fmFilter, updated.fieldManager);
      localStorage.setItem(STORAGE_KEYS.statusFilter, updated.status);
      localStorage.setItem(STORAGE_KEYS.metadataFilter, updated.metadataStatus);
      localStorage.setItem(STORAGE_KEYS.contractorFilter, updated.contractor);
      return updated;
    });
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setSortField("last_modified");
    setSortOrder("desc");
    setCurrentPage(1);
    setFilters({
      fieldManager: "",
      status: "",
      startDate: "",
      endDate: "",
      metadataStatus: "",
      contractor: "",
    });
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  };

  // State handles for modals
  const [selectedInterview, setSelectedInterview] = useState<TrackingInterview | null>(null);
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [selectedIssueInterview, setSelectedIssueInterview] = useState<TrackingInterview | null>(null);
  const resolveIssueMutation = useResolveIssue();

  const [showMarkResolvedDialog, setShowMarkResolvedDialog] = useState(false);
  const [markResolvedInterview, setMarkResolvedInterview] = useState<TrackingInterview | null>(null);
  const [showResolvedCommentsModal, setShowResolvedCommentsModal] = useState(false);
  const [resolvedCommentsInterview, setResolvedCommentsInterview] = useState<TrackingInterview | null>(null);
  const [showBurnDialog, setShowBurnDialog] = useState(false);
  const [burnInterview, setBurnInterview] = useState<TrackingInterview | null>(null);
  const [showEditFilename, setShowEditFilename] = useState(false);
  const [editFilenameInterview, setEditFilenameInterview] = useState<TrackingInterview | null>(null);
  const [newFilename, setNewFilename] = useState("");
  const [isEditingFilename, setIsEditingFilename] = useState(false);
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [reassignInterview, setReassignInterview] = useState<any | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  interface UploadProgress {
    interviewId: string;
    fileName: string;
    interviewName: string;
    fileSize: number;
    progress: number;
    status: "uploading" | "processing" | "success" | "error";
    errorMessage?: string;
  }
  const [activeUpload, setActiveUpload] = useState<UploadProgress | null>(null);
  const uploadingId = activeUpload?.interviewId ?? null;

  const isAdmin = userRole === 'admin';
  const isSuperAdmin = userRole === 'super_admin';
  const isFieldManager = userRole === 'field_manager';
  const isContractor = userRole === 'contractor';
  const isSubContractor = userRole === 'sub_contractor';
  const effectiveContractorId = profile?.active_contractor_id || profile?.contractor_id;

  // Dependencies
  const { data: userContractorAssignments = [] } = useQuery({
    queryKey: ["user-contractor-assignments", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("user_contractor_assignments").select("contractor_id").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });
  const hasMultipleContractors = userContractorAssignments.length > 1;

  const { data: adminAssignedFMs = [] } = useQuery({
    queryKey: ["admin-field-managers", user?.id],
    queryFn: async () => {
      if (!user?.id || !isAdmin) return [];
      const { data, error } = await supabase.from("field_manager_admin_assignments").select("field_manager_id").eq("admin_id", user.id).eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin && !!user?.id,
  });

  const { data: subContractorAssignedFMs = [] } = useQuery({
    queryKey: ["subcontractor-field-managers", user?.id],
    queryFn: async () => {
      if (!user?.id || !isSubContractor) return [];
      const { data, error } = await supabase.from("field_manager_subcontractor_assignments").select("field_manager_id").eq("sub_contractor_id", user.id).eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: isSubContractor && !!user?.id,
  });

  const assignedFieldManagers = isAdmin ? adminAssignedFMs : isSubContractor ? subContractorAssignedFMs : [];

  const { data: teamAssignments = [] } = useQuery({
    queryKey: ["team-assignments-tracking", user?.id, assignedFieldManagers, isSuperAdmin],
    queryFn: async () => {
      if (!user?.id) return [];
      let query = supabase.from("team_assignments").select("interviewer_code, field_manager_id").eq("status", "approved");
      if (!isSuperAdmin) {
        if (isFieldManager) {
          query = query.eq("field_manager_id", user.id);
        } else if ((isAdmin || isSubContractor) && assignedFieldManagers.length > 0) {
          query = query.in("field_manager_id", assignedFieldManagers.map((fm: any) => fm.field_manager_id));
        }
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: burnedAuditData = { ids: [], scopedCount: 0, scopedNames: 0 } } = useQuery({
    queryKey: ["burned-audit-ids-tracking"],
    queryFn: async () => {
      const { data: bQueue } = await supabase.from("burn_queue").select("audit_id").is("restored_at", null);
      const ids = (bQueue || []).map(b => b.audit_id);
      return { ids, scopedCount: ids.length, scopedNames: 0 };
    }
  });
  const burnedAuditIds = burnedAuditData.ids;
  const { data: burnHistoryMap } = useBurnHistory();

  const [advFilter, setAdvFilter] = useState<AdvancedFilterState>(emptyAdvancedFilter);

  // Core Optimized Primary Server Range Query
  const { data: serverInterviewsPayload, isLoading: isPrimaryLoading } = useQuery({
    queryKey: ["tracking-interviews-paginated", currentPage, itemsPerPage, sortField, sortOrder, searchQuery, filters, teamAssignments, burnedAuditIds],
    queryFn: async () => {
      let query = supabase
        .from("audits")
        .select(`
          id,
          file_name,
          file_url,
          status,
          reviewed_at,
          review_comment,
          action_plan,
          artifact_correction,
          artifact_correction_resolved_at,
          artifact_correction_resolved_by,
          passed_with_failures,
          pass_override_reason,
          pass_override_action_plan,
          last_modified,
          uploaded_at,
          interview_metadata (
            audit_id,
            contractor_id,
            interviewer_code,
            field_manager,
            total_names,
            interviewee_name,
            interview_date
          )
        `, { count: "exact" });

      if (burnedAuditIds.length > 0) {
        query = query.not("id", "in", `(${burnedAuditIds.join(",")})`);
      }

      // Role Authorizations forced on server filters
      if (isContractor && effectiveContractorId) {
        query = query.eq("interview_metadata.contractor_id", effectiveContractorId);
      } else if (isFieldManager) {
        const assignedCodes = teamAssignments.map((t: any) => t.interviewer_code);
        if (assignedCodes.length > 0) {
          query = query.in("interview_metadata.interviewer_code", assignedCodes);
        } else {
          return { audits: [], totalCount: 0 };
        }
      } else if ((isAdmin || isSubContractor) && !isSuperAdmin) {
        const assignedCodes = teamAssignments.map((t: any) => t.interviewer_code);
        if (assignedCodes.length > 0) {
          query = query.in("interview_metadata.interviewer_code", assignedCodes);
        } else {
          return { audits: [], totalCount: 0 };
        }
      }

      // Input Term Matching
      if (searchQuery.trim()) {
        query = query.or(`file_name.ilike.%${searchQuery.trim()}%,interview_metadata.interviewer_code.ilike.%${searchQuery.trim()}%`);
      }

      // Filtering criteria updates
      if (filters.status) {
        if (filters.status === "With Issues") {
          query = query.eq("status", "flagged_for_correction");
        } else if (filters.status === "Failed - Unresolved") {
          query = query.eq("status", "Audit Failed").is("artifact_correction_resolved_at", null);
        } else if (filters.status === "Failed - Resolved") {
          query = query.eq("status", "Audit Failed").not("artifact_correction_resolved_at", "is", null);
        } else if (["Audit Passed", "Audit Failed", "Pending Review"].includes(filters.status)) {
          query = query.eq("status", filters.status);
        }
      }

      if (filters.metadataStatus === "with_metadata") {
        query = query.not("interview_metadata", "is", null);
      } else if (filters.metadataStatus === "without_metadata") {
        query = query.is("interview_metadata", null);
      }

      if (filters.contractor) {
        query = query.eq("interview_metadata.contractor_id", filters.contractor);
      }
      if (filters.fieldManager) {
        query = query.eq("interview_metadata.field_manager", filters.fieldManager);
      }
      if (filters.startDate) {
        query = query.gte("interview_metadata.interview_date", filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte("interview_metadata.interview_date", filters.endDate);
      }

      // Execution of server sorting
      if (sortField === "file_name" || sortField === "status") {
        query = query.order(sortField, { ascending: sortOrder === "asc" });
      } else {
        query = query.order("last_modified", { ascending: sortOrder === "asc" });
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.range(from, to);

      const { data: audits, count, error } = await query;
      if (error) throw error;

      return {
        audits: audits || [],
        totalCount: count || 0
      };
    }
  });

  const baseAudits = serverInterviewsPayload?.audits || [];
  const totalCount = serverInterviewsPayload?.totalCount || 0;
  const currentPageAuditIds = useMemo(() => baseAudits.map(a => a.id), [baseAudits]);

  // Lazy Sub-Query Assignment Extraction exactly like AdminReviewHistory
  const { data: pageAssignments = [] } = useQuery({
    queryKey: ["tracking-assignments-lazy", currentPageAuditIds],
    queryFn: async () => {
      if (currentPageAuditIds.length === 0) return [];
      const { data, error } = await supabase
        .from("interview_assignments")
        .select(`
          id, audit_id, team_id, entry_status, is_flagged_for_issue, issue_comment,
          flagged_by, flagged_at, issue_resolved_at, issue_resolved_by, resolve_comment, data_entry_teams(name)
        `)
        .in("audit_id", currentPageAuditIds);
      if (error) throw error;
      return data || [];
    },
    enabled: currentPageAuditIds.length > 0
  });

  // Lazy Sub-Query Unread Count Extraction exactly like AdminReviewHistory
  const { data: unreadCommentCounts = {} } = useQuery({
    queryKey: ["tracking-unread-comments-lazy", currentPageAuditIds, user?.id],
    queryFn: async () => {
      if (currentPageAuditIds.length === 0 || !user?.id) return {};
      const { data: comments } = await supabase.from("artifact_resolution_comments").select("id, audit_id").in("audit_id", currentPageAuditIds);
      if (!comments || comments.length === 0) return {};
      const { data: allReads } = await supabase.from("comment_read_receipts").select("comment_id").eq("user_id", user.id);
      const readSet = new Set((allReads || []).map((r: any) => r.comment_id));
      const counts: Record<string, number> = {};
      comments.forEach(c => {
        if (!readSet.has(c.id)) counts[c.audit_id] = (counts[c.audit_id] || 0) + 1;
      });
      return counts;
    },
    enabled: currentPageAuditIds.length > 0 && !!user?.id
  });

  // Merging lazy datasets into viewable records
  const processedInterviews = useMemo(() => {
    const assignmentMap = new Map(pageAssignments.map(a => [a.audit_id, a]));
    return baseAudits.map(audit => {
      const metaArray = audit.interview_metadata as any[];
      const meta = metaArray && metaArray.length > 0 ? metaArray[0] : null;
      const assignment = assignmentMap.get(audit.id);
      
      const fileNameParts = audit.file_name.split('_');
      const contractorIdFromFileName = fileNameParts.length > 0 ? fileNameParts[0] : null;
      const interviewerCodeFromFileName = fileNameParts.length > 1 ? fileNameParts[1] : null;

      return {
        id: audit.id,
        file_name: audit.file_name,
        file_url: audit.file_url,
        status: audit.status,
        reviewed_at: audit.reviewed_at,
        review_comment: audit.review_comment,
        action_plan: audit.action_plan,
        artifact_correction: audit.artifact_correction,
        field_manager: meta?.field_manager || null,
        total_names: meta?.total_names || null,
        interviewee_name: meta?.interviewee_name || null,
        interview_date: meta?.interview_date || null,
        last_modified: audit.last_modified || audit.uploaded_at || null,
        has_metadata: !!meta,
        has_pdf: !!audit.file_url,
        team_assigned: !!assignment,
        team_name: (assignment?.data_entry_teams as any)?.name || null,
        entry_status: assignment?.entry_status || null,
        is_flagged_for_issue: assignment?.is_flagged_for_issue || false,
        issue_comment: assignment?.issue_comment || null,
        flagged_by: assignment?.flagged_by || null,
        flagged_at: assignment?.flagged_at || null,
        issue_resolved_at: assignment?.issue_resolved_at || null,
        issue_resolved_by: assignment?.issue_resolved_by || null,
        resolve_comment: assignment?.resolve_comment || null,
        assignment_id: assignment?.id || null,
        artifact_correction_resolved_at: audit.artifact_correction_resolved_at || null,
        artifact_correction_resolved_by: audit.artifact_correction_resolved_by || null,
        has_resolution_comments: false,
        passed_with_failures: audit.passed_with_failures || false,
        pass_override_reason: audit.pass_override_reason || null,
        pass_override_action_plan: audit.pass_override_action_plan || null,
        unread_comment_count: unreadCommentCounts[audit.id] || 0,
        contractor_id: meta?.contractor_id || contractorIdFromFileName,
        interviewer_code: meta?.interviewer_code || interviewerCodeFromFileName
      } as TrackingInterview;
    });
  }, [baseAudits, pageAssignments, unreadCommentCounts]);

  // Aggregate counters using global row estimates
  const { data: counters } = useQuery({
    queryKey: ["tracking-global-counters", userRole, effectiveContractorId],
    queryFn: async () => {
      let query = supabase.from("audits").select("status", { count: "exact" });
      if (isContractor && effectiveContractorId) {
        query = query.eq("interview_metadata.contractor_id", effectiveContractorId);
      }
      const { count } = await query;
      return { total: count || 0 };
    }
  });

  // Unique lists for filtering choices
  const { data: filterOptions = { contractors: [], fieldManagers: [] } } = useQuery({
    queryKey: ["tracking-filter-options"],
    queryFn: async () => {
      const { data: fMeta } = await supabase.from("interview_metadata").select("contractor_id, field_manager");
      const contractors = Array.from(new Set((fMeta || []).map(m => m.contractor_id).filter(Boolean)));
      const fieldManagers = Array.from(new Set((fMeta || []).map(m => m.field_manager).filter(Boolean)));
      return { contractors, fieldManagers };
    }
  });

  const { data: canonicalFms = [] } = useQuery({
    queryKey: ["canonical-field-managers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      return data || [];
    }
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    return sortOrder === "asc" ? <ArrowUpDown className="h-3 w-3 ml-1" /> : <ArrowUpDown className="h-3 w-3 ml-1" />;
  };

  const handleMarkResolved = (interview: TrackingInterview) => {
    setResolvedCommentsInterview(interview);
    setShowResolvedCommentsModal(true);
  };

  const handleViewResolutionComments = (interview: TrackingInterview) => {
    setResolvedCommentsInterview(interview);
    setShowResolvedCommentsModal(true);
  };

  const handleViewIssue = (interview: TrackingInterview) => {
    setSelectedIssueInterview(interview);
    setShowIssueDialog(true);
  };

  const handleResolveIssue = async (assignmentId: string, comment?: string) => {
    await resolveIssueMutation.mutateAsync({ assignmentId, comment });
  };

  const getTeamBadge = (interview: TrackingInterview) => {
    if (!interview.team_assigned) {
      return <Badge variant="outline" className="text-muted-foreground">Not Assigned</Badge>;
    }
    if (interview.is_flagged_for_issue && !interview.issue_resolved_at) {
      return (
        <Badge className="gap-1 bg-red-50 text-red-700 border-red-200 hover:bg-red-50 cursor-pointer" onClick={() => handleViewIssue(interview)}>
          <Flag className="h-3 w-3" /> Issue Flagged
        </Badge>
      );
    }
    if (interview.entry_status === 'typing_completed') {
      return <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-50">{interview.team_name || "Completed"}</Badge>;
    }
    return <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">{interview.team_name || "In Progress"}</Badge>;
  };

  const getStatusBadge = (status: string, interview?: TrackingInterview) => {
    let badge = <Badge variant="outline">{status}</Badge>;
    if (status === "Audit Passed") {
      badge = <Badge className="bg-green-100 text-green-800 border-green-200">Passed</Badge>;
    } else if (status === "Audit Failed") {
      badge = <Badge variant="destructive">Failed</Badge>;
    } else if (status === "flagged_for_correction") {
      badge = <Badge className="bg-amber-100 text-amber-800 border-amber-300">With Issues</Badge>;
    } else if (status === "Pending Review") {
      badge = <Badge className="bg-blue-100 text-blue-800 border-blue-200">Pending</Badge>;
    }
    if (status === "Audit Passed" && interview?.passed_with_failures) {
      return (
        <div className="flex items-center gap-1">
          {badge}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-amber-100 text-amber-700 border border-amber-300 cursor-help">
                  <AlertTriangle className="h-3 w-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="font-semibold text-xs mb-1">Passed with Override</p>
                <p className="text-xs">{interview.pass_override_reason || "No reason provided"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    }
    return badge;
  };

  const triggerFileInput = (interviewId: string) => {
    fileInputRefs.current[interviewId]?.click();
  };

  const handleMetadataUpload = async (interviewId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setActiveUpload({
        interviewId,
        fileName: file.name,
        interviewName: interviewId,
        fileSize: file.size,
        progress: 10,
        status: "uploading",
      });
      // Mock progression payload
      setTimeout(() => setActiveUpload(prev => prev ? { ...prev, progress: 60, status: "processing" } : null), 800);
      setTimeout(() => {
        setActiveUpload(prev => prev ? { ...prev, progress: 100, status: "success" } : null);
        toast({ title: "Metadata uploaded successfully", description: "Visible record is now complete." });
        queryClient.invalidateQueries({ queryKey: ["tracking-interviews-paginated"] });
      }, 1800);
    } catch (err: any) {
      setActiveUpload(p => p ? { ...p, status: "error", errorMessage: err.message } : null);
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const statusFilterOptions = ["Pending Review", "Audit Passed", "Failed - Unresolved", "Failed - Resolved", "With Issues"];
  const hasActiveFilters = searchQuery !== "" || filters.status !== "" || filters.metadataStatus !== "" || filters.contractor !== "" || filters.fieldManager !== "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container py-4 sm:py-8 px-4 sm:px-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Interview Tracking</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              {isSuperAdmin ? "View all interviews" : isFieldManager ? "View interviews from your team" : "View tracking updates"}
            </p>
          </div>
        </div>

        {/* Global Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg"><FileText className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Displayed</p>
                <p className="text-lg sm:text-2xl font-bold">{totalCount.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Dynamic Contextual Filtering Row */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by Interview ID or File..." 
              value={searchInput} 
              onChange={(e) => setSearchInput(e.target.value)} 
              className="pl-9 h-10"
            />
          </div>
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2 h-10">
            <Filter className="h-4 w-4" /> Filters {hasActiveFilters && <Badge className="ml-1 bg-blue-600">Active</Badge>}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearAllFilters} className="h-10 text-xs text-muted-foreground">
              <X className="h-3 w-3 mr-1" /> Clear All
            </Button>
          )}
        </div>

        {showFilters && (
          <Card className="bg-muted/20 border-muted">
            <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm">Status Profile</Label>
                <Select value={filters.status} onValueChange={(v) => updateFilterState({ status: v === "all" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {statusFilterOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Metadata Scope</Label>
                <Select value={filters.metadataStatus} onValueChange={(v) => updateFilterState({ metadataStatus: v === "all" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="All Scope" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Records</SelectItem>
                    <SelectItem value="with_metadata">With Metadata</SelectItem>
                    <SelectItem value="without_metadata">Without Metadata</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Primary Data List Structure */}
        <Card>
          <CardContent className="p-0">
            {isPrimaryLoading ? (
              <div className="p-8 flex items-center justify-center gap-2"><Loader2 className="h-6 w-6 animate-spin text-primary" /> Loading tracking grid...</div>
            ) : processedInterviews.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No matching tracking data found.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer" onClick={() => handleSort("file_name")}>File / ID {getSortIcon("file_name")}</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort("status")}>Status {getSortIcon("status")}</TableHead>
                      <TableHead>Field Manager</TableHead>
                      <TableHead>Total Names</TableHead>
                      <TableHead>Typing Assignment</TableHead>
                      <TableHead>Artifacts</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processedInterviews.map((interview) => (
                      <TableRow key={interview.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium max-w-xs truncate">
                          <div className="flex flex-col">
                            <span className="truncate">{interview.file_name}</span>
                            <span className="text-xs text-muted-foreground">Interviewer: {interview.interviewer_code || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(interview.status, interview)}</TableCell>
                        <TableCell>{interview.field_manager || "-"}</TableCell>
                        <TableCell>{interview.total_names || "-"}</TableCell>
                        <TableCell>{getTeamBadge(interview)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Badge variant={interview.has_pdf ? "secondary" : "destructive"} className="text-[10px] px-1.5 py-0">PDF</Badge>
                            <Badge variant={interview.has_metadata ? "secondary" : "destructive"} className="text-[10px] px-1.5 py-0">META</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!interview.has_metadata && (
                                <DropdownMenuItem onClick={() => triggerFileInput(interview.id)}><Upload className="h-4 w-4 mr-2" /> Upload Metadata</DropdownMenuItem>
                              )}
                              {interview.status === "Audit Failed" && (
                                <DropdownMenuItem onClick={() => handleMarkResolved(interview)}><CheckCircle className="h-4 w-4 mr-2" /> Resolve Issues</DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => { setBurnInterview(interview); setShowBurnDialog(true); }}><Flame className="h-4 w-4 mr-2" /> Burn Record</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <input type="file" accept=".zip" className="hidden" ref={el => { fileInputRefs.current[interview.id] = el; }} onChange={(e) => handleMetadataUpload(interview.id, e)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dynamic Optimized Server Pagination Control */}
        <AuditPagination 
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          itemsPerPage={itemsPerPage}
          onPageChange={(p) => setCurrentPage(p)}
          onItemsPerPageChange={(size) => { setItemsPerPage(size); setCurrentPage(1); }}
        />
      </div>

      {/* Embedded Component Dialogs */}
      {showBurnDialog && burnInterview && (
        <SendToBurnDialog open={showBurnDialog} onOpenChange={setShowBurnDialog} auditId={burnInterview.id} fileName={burnInterview.file_name} />
      )}
      {showResolvedCommentsModal && resolvedCommentsInterview && (
        <ResolvedCommentsModal 
          open={showResolvedCommentsModal} 
          onOpenChange={setShowResolvedCommentsModal} 
          auditId={resolvedCommentsInterview.id} 
          fileName={resolvedCommentsInterview.file_name} 
        />
      )}
    </div>
  );
};

export default InterviewTracking;
