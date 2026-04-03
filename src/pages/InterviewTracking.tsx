import { useState, useMemo, useRef } from "react";
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
import { MarkResolvedDialog } from "@/components/tracking/MarkResolvedDialog";
import { ResolvedCommentsModal } from "@/components/tracking/ResolvedCommentsModal";
import { AuditPagination } from "@/components/AuditPagination";
import SendToBurnDialog from "@/components/SendToBurnDialog";
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
  // Flagged issue fields
  is_flagged_for_issue: boolean;
  issue_comment: string | null;
  flagged_by: string | null;
  flagged_at: string | null;
  issue_resolved_at: string | null;
  issue_resolved_by: string | null;
  resolve_comment: string | null;
  assignment_id: string | null;
  // Artifact correction resolution fields
  artifact_correction_resolved_at: string | null;
  artifact_correction_resolved_by: string | null;
  has_resolution_comments: boolean;
  unread_comment_count: number;
  passed_with_failures: boolean;
  pass_override_reason: string | null;
  pass_override_action_plan: string | null;
}

const InterviewTracking = () => {
  const { user, userRole, profile } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("last_modified");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  // Filters
  const [filters, setFilters] = useState({
    fieldManager: "",
    status: "",
    startDate: "",
    endDate: "",
    metadataStatus: "",
    contractor: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  // Get user's contractor assignments for multi-contractor users
  const { data: userContractorAssignments = [] } = useQuery({
    queryKey: ["user-contractor-assignments", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("user_contractor_assignments")
        .select("contractor_id")
        .eq("user_id", user.id);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const hasMultipleContractors = userContractorAssignments.length > 1;

  // Failed interview modal
  const [selectedInterview, setSelectedInterview] = useState<TrackingInterview | null>(null);
  const [showFailedModal, setShowFailedModal] = useState(false);

  // View Issue dialog
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [selectedIssueInterview, setSelectedIssueInterview] = useState<TrackingInterview | null>(null);
  const resolveIssueMutation = useResolveIssue();

  // Mark Resolved dialog state
  const [showMarkResolvedDialog, setShowMarkResolvedDialog] = useState(false);
  const [markResolvedInterview, setMarkResolvedInterview] = useState<TrackingInterview | null>(null);
  
  // Resolved Comments modal state
  const [showResolvedCommentsModal, setShowResolvedCommentsModal] = useState(false);
  const [resolvedCommentsInterview, setResolvedCommentsInterview] = useState<TrackingInterview | null>(null);

  // Send to Burn dialog state
  const [showBurnDialog, setShowBurnDialog] = useState(false);
  const [burnInterview, setBurnInterview] = useState<TrackingInterview | null>(null);

  // Edit Filename dialog state
  const [showEditFilename, setShowEditFilename] = useState(false);
  const [editFilenameInterview, setEditFilenameInterview] = useState<TrackingInterview | null>(null);
  const [newFilename, setNewFilename] = useState("");
  const [isEditingFilename, setIsEditingFilename] = useState(false);

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // File upload refs and progress tracking
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
  
  // Use active_contractor_id if set, otherwise fall back to contractor_id
  const effectiveContractorId = profile?.active_contractor_id || profile?.contractor_id;

  // Get field managers assigned to this admin (uses field_manager_admin_assignments)
  const { data: adminAssignedFMs = [] } = useQuery({
    queryKey: ["admin-field-managers", user?.id],
    queryFn: async () => {
      if (!user?.id || !isAdmin) return [];
      
      const { data, error } = await supabase
        .from("field_manager_admin_assignments")
        .select("field_manager_id")
        .eq("admin_id", user.id)
        .eq("is_active", true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin && !!user?.id,
  });

  // Get field managers assigned to this sub-contractor (uses field_manager_subcontractor_assignments)
  const { data: subContractorAssignedFMs = [] } = useQuery({
    queryKey: ["subcontractor-field-managers", user?.id],
    queryFn: async () => {
      if (!user?.id || !isSubContractor) return [];
      
      const { data, error } = await supabase
        .from("field_manager_subcontractor_assignments")
        .select("field_manager_id")
        .eq("sub_contractor_id", user.id)
        .eq("is_active", true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: isSubContractor && !!user?.id,
  });

  // Combine assigned field managers based on role
  const assignedFieldManagers = isAdmin ? adminAssignedFMs : isSubContractor ? subContractorAssignedFMs : [];

  // Get team codes for field managers
  const { data: teamAssignments = [] } = useQuery({
    queryKey: ["team-assignments-tracking", user?.id, assignedFieldManagers],
    queryFn: async () => {
      if (!user?.id) return [];
      
      let query = supabase
        .from("team_assignments")
        .select("interviewer_code, field_manager_id")
        .eq("status", "approved");
      
      if (isFieldManager) {
        query = query.eq("field_manager_id", user.id);
      } else if ((isAdmin || isSubContractor) && assignedFieldManagers.length > 0) {
        const fmIds = assignedFieldManagers.map((fm: any) => fm.field_manager_id);
        query = query.in("field_manager_id", fmIds);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && (isFieldManager || ((isAdmin || isSubContractor) && assignedFieldManagers.length > 0) || isSuperAdmin),
  });

  // Main interviews query - uses JOIN to avoid large .in() queries that fail silently
  const { data: interviews = [], isLoading } = useQuery({
    queryKey: ["tracking-interviews", userRole, effectiveContractorId, teamAssignments],
    queryFn: async () => {
      // Paginated fetch to bypass 1000 row default limit
      const fetchAllAudits = async () => {
        const batchSize = 1000;
        let allAudits: any[] = [];
        let from = 0;
        let hasMore = true;
        
        while (hasMore) {
          const { data: batch, error } = await supabase
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
            `)
            .range(from, from + batchSize - 1);
          
          if (error) throw error;
          if (!batch || batch.length === 0) {
            hasMore = false;
          } else {
            allAudits.push(...batch);
            if (batch.length < batchSize) {
              hasMore = false;
            }
            from += batchSize;
          }
        }
        return allAudits;
      };
      
      const auditsWithMeta = await fetchAllAudits();
      
      if (!auditsWithMeta || auditsWithMeta.length === 0) return [];
      
      // Get interview assignments separately
      const auditIds = auditsWithMeta.map(a => a.id);
      
      // Batch assignments query to avoid URL length issues
      const batchSize = 200;
      const allAssignments: any[] = [];
      
      for (let i = 0; i < auditIds.length; i += batchSize) {
        const batch = auditIds.slice(i, i + batchSize);
        const { data: batchAssignments, error: assignmentsError } = await supabase
          .from("interview_assignments")
          .select(`
            id,
            audit_id, 
            team_id, 
            entry_status,
            is_flagged_for_issue,
            issue_comment,
            flagged_by,
            flagged_at,
            issue_resolved_at,
            issue_resolved_by,
            resolve_comment,
            data_entry_teams(name)
          `)
          .in("audit_id", batch);
        
        if (assignmentsError) {
          console.error("Error fetching assignments batch:", assignmentsError);
        } else if (batchAssignments) {
          allAssignments.push(...batchAssignments);
        }
      }
      
      const assignmentMap = new Map(allAssignments.map(a => [a.audit_id, a]));
      
      let results: TrackingInterview[] = auditsWithMeta.map(audit => {
        // interview_metadata comes as an array from the nested select (LEFT JOIN)
        const metaArray = audit.interview_metadata as any[];
        const meta = metaArray && metaArray.length > 0 ? metaArray[0] : null;
        const assignment = assignmentMap.get(audit.id);
        
        // Extract contractor_id from file_name if not in metadata (format: NG71_711_20251208_0937)
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
          // Flagged issue fields
          is_flagged_for_issue: assignment?.is_flagged_for_issue || false,
          issue_comment: assignment?.issue_comment || null,
          flagged_by: assignment?.flagged_by || null,
          flagged_at: assignment?.flagged_at || null,
          issue_resolved_at: assignment?.issue_resolved_at || null,
          issue_resolved_by: assignment?.issue_resolved_by || null,
          resolve_comment: assignment?.resolve_comment || null,
          assignment_id: assignment?.id || null,
          // Artifact correction resolution fields
          artifact_correction_resolved_at: (audit as any).artifact_correction_resolved_at || null,
          artifact_correction_resolved_by: (audit as any).artifact_correction_resolved_by || null,
          has_resolution_comments: false,
          passed_with_failures: audit.passed_with_failures || false,
          pass_override_reason: audit.pass_override_reason || null,
          pass_override_action_plan: audit.pass_override_action_plan || null,
          unread_comment_count: 0, // Will be populated after we fetch comments count
          // For filtering - use metadata if available, otherwise extract from file_name
          contractor_id: meta?.contractor_id || contractorIdFromFileName,
          interviewer_code: meta?.interviewer_code || interviewerCodeFromFileName,
        };
      });
      
      // Apply role-based filtering
      if (isContractor && effectiveContractorId) {
        results = results.filter(r => (r as any).contractor_id === effectiveContractorId);
      } else if (isSubContractor && effectiveContractorId) {
        results = results.filter(r => (r as any).contractor_id === effectiveContractorId);
      } else if (isAdmin && teamAssignments.length > 0) {
        const assignedCodes = teamAssignments.map((t: any) => t.interviewer_code);
        results = results.filter(r => (r as any).interviewer_code && assignedCodes.includes((r as any).interviewer_code));
      } else if (isFieldManager && teamAssignments.length > 0) {
        const myCodes = teamAssignments.map((t: any) => t.interviewer_code);
        results = results.filter(r => (r as any).interviewer_code && myCodes.includes((r as any).interviewer_code));
      }
      // Super admin sees all
      
      return results;
    },
    enabled: !!user?.id,
  });

  // Fetch burned audit IDs to exclude from listing
  const { data: burnedAuditData = { ids: new Set<string>(), scopedCount: 0 } } = useQuery({
    queryKey: ["burned-audit-ids", profile?.active_contractor_id, profile?.contractor_id, userRole],
    queryFn: async () => {
      const { data } = await supabase
        .from("burn_queue")
        .select("audit_id, file_name")
        .is("restored_at", null);
      const allBurned = data || [];
      const ids = new Set(allBurned.map((b) => b.audit_id));
      
      // Scope count by user's contractor for non-admins
      const effectiveCid = profile?.active_contractor_id || profile?.contractor_id;
      let scopedCount = allBurned.length;
      if (!isSuperAdmin && effectiveCid) {
        scopedCount = allBurned.filter(b => b.file_name?.startsWith(effectiveCid)).length;
      }
      
      return { ids, scopedCount };
    },
  });
  const burnedAuditIds = burnedAuditData.ids;

  // Filter out burned interviews
  const nonBurnedInterviews = useMemo(() => {
    if (burnedAuditIds.size === 0) return interviews;
    return interviews.filter((i) => !burnedAuditIds.has(i.id));
  }, [interviews, burnedAuditIds]);

  // Only fetch unread comment counts for the CURRENT PAGE's audit IDs (lazy-load optimization)
  const currentPageAuditIds = useMemo(() => {
    // We need to compute paginated IDs from nonBurnedInterviews after filtering/sorting
    // For now, use all non-burned IDs but cap for the current page
    return nonBurnedInterviews.map(i => i.id);
  }, [nonBurnedInterviews]);

  const { data: unreadCommentCounts = {} } = useQuery({
    queryKey: ["unread-comment-counts", currentPageAuditIds, user?.id],
    queryFn: async () => {
      if (currentPageAuditIds.length === 0 || !user?.id) return {};
      
      // Fetch all comments for all interviews (not by current user) - batch to avoid URL issues
      const batchSize = 200;
      let allComments: any[] = [];
      for (let i = 0; i < currentPageAuditIds.length; i += batchSize) {
        const batch = currentPageAuditIds.slice(i, i + batchSize);
        const { data: batchComments } = await supabase
          .from("artifact_correction_comments")
          .select("id, audit_id, user_id")
          .in("audit_id", batch)
          .neq("user_id", user.id);
        if (batchComments) allComments.push(...batchComments);
      }
      const comments = allComments;
      
      if (!comments || comments.length === 0) return {};

      // Fetch which of these comments the current user has already read
      const commentIds = comments.map(c => c.id);
      let allReads: any[] = [];
      for (let i = 0; i < commentIds.length; i += batchSize) {
        const batch = commentIds.slice(i, i + batchSize);
        const { data: reads } = await supabase
          .from("artifact_comment_reads" as any)
          .select("comment_id")
          .eq("user_id", user.id)
          .in("comment_id", batch);
        if (reads) allReads.push(...reads);
      }
      
      const readSet = new Set(allReads.map((r: any) => r.comment_id));
      
      // Count unread comments per audit
      const counts: Record<string, number> = {};
      comments.forEach(c => {
        if (!readSet.has(c.id)) {
          counts[c.audit_id] = (counts[c.audit_id] || 0) + 1;
        }
      });
      
      return counts;
    },
    enabled: currentPageAuditIds.length > 0 && !!user?.id,
  });

  // Merge unread counts into interviews
  const interviewsWithUnreadCounts = useMemo(() => {
    return nonBurnedInterviews.map(i => ({
      ...i,
      unread_comment_count: unreadCommentCounts[i.id] || 0,
    }));
  }, [nonBurnedInterviews, unreadCommentCounts]);

  // Get unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    const fieldManagers = [...new Set(interviewsWithUnreadCounts.map(i => i.field_manager).filter(Boolean))];
    const statuses = [...new Set(interviewsWithUnreadCounts.map(i => i.status).filter(Boolean))];
    const contractors = [...new Set(interviewsWithUnreadCounts.map(i => (i as any).contractor_id).filter(Boolean))];
    return { fieldManagers, statuses, contractors };
  }, [interviewsWithUnreadCounts]);

  // Apply filters and search
  const filteredInterviews = useMemo(() => {
    return interviewsWithUnreadCounts.filter(interview => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          interview.file_name.toLowerCase().includes(query) ||
          interview.interviewee_name?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      
      // Apply other filters
      if (filters.fieldManager && interview.field_manager !== filters.fieldManager) return false;
      
      // Status filter - special cases for "With Issues", "Failed - Unresolved", and "Failed - Resolved"
      if (filters.status === "With Issues") {
        if (!interview.is_flagged_for_issue || interview.issue_resolved_at) return false;
      } else if (filters.status === "Failed - Unresolved") {
        if (interview.status !== "Audit Failed" || interview.artifact_correction_resolved_at) return false;
      } else if (filters.status === "Failed - Resolved") {
        if (interview.status !== "Audit Failed" || !interview.artifact_correction_resolved_at) return false;
      } else if (filters.status && interview.status !== filters.status) {
        return false;
      }
      
      if (filters.startDate && interview.interview_date && interview.interview_date < filters.startDate) return false;
      if (filters.endDate && interview.interview_date && interview.interview_date > filters.endDate) return false;
      
      // Metadata status filter
      if (filters.metadataStatus === "with_metadata" && !interview.has_metadata) return false;
      if (filters.metadataStatus === "without_metadata" && interview.has_metadata) return false;
      
      // Contractor filter
      if (filters.contractor && (interview as any).contractor_id !== filters.contractor) return false;
      
      return true;
    });
  }, [interviewsWithUnreadCounts, searchQuery, filters]);

  // Sort interviews
  const sortedInterviews = useMemo(() => {
    return [...filteredInterviews].sort((a, b) => {
      let aVal = a[sortField as keyof TrackingInterview];
      let bVal = b[sortField as keyof TrackingInterview];
      
      if (aVal === null) aVal = "";
      if (bVal === null) bVal = "";
      
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      }
      
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortOrder === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [filteredInterviews, sortField, sortOrder]);

  // Paginate
  const paginatedInterviews = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedInterviews.slice(start, start + itemsPerPage);
  }, [sortedInterviews, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedInterviews.length / itemsPerPage);

  // Calculate total names for stat cards
  const nameStats = useMemo(() => {
    const passed = interviewsWithUnreadCounts.filter(i => i.status === "Audit Passed");
    const failed = interviewsWithUnreadCounts.filter(i => i.status === "Audit Failed");
    const pending = interviewsWithUnreadCounts.filter(i => i.status === "Pending" || i.status === "Awaiting Review");
    
    const sum = (list: typeof interviewsWithUnreadCounts) => 
      list.reduce((acc, i) => acc + (i.total_names || 0), 0);

    const filteredPassed = filteredInterviews.filter(i => i.status === "Audit Passed");
    const filteredFailed = filteredInterviews.filter(i => i.status === "Audit Failed");
    const filteredUnresolved = filteredInterviews.filter(i => i.is_flagged_for_issue && !i.issue_resolved_at);
    const filteredNoMeta = filteredInterviews.filter(i => !i.has_metadata);
    
    return {
      total: sum(interviewsWithUnreadCounts),
      passed: sum(passed),
      failed: sum(failed),
      pending: sum(pending),
      filtered: sum(filteredInterviews),
      filteredTotal: sum(filteredInterviews),
      filteredPassed: sum(filteredPassed),
      filteredFailed: sum(filteredFailed),
      filteredUnresolved: sum(filteredUnresolved),
      filteredNoMeta: sum(filteredNoMeta),
      filteredInterviewCount: filteredInterviews.length,
      filteredPassedCount: filteredPassed.length,
      filteredFailedCount: filteredFailed.length,
      filteredUnresolvedCount: filteredUnresolved.length,
      filteredNoMetaCount: filteredNoMeta.length,
    };
  }, [interviewsWithUnreadCounts, filteredInterviews]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleExportCSV = () => {
    const headers = ["Interview ID", "Field Manager", "Total Names", "Interviewee", "Interview Date", "Status", "Team Assigned", "PDF", "Metadata"];
    const rows = sortedInterviews.map(i => [
      i.file_name,
      i.field_manager || "",
      i.total_names?.toString() || "",
      i.interviewee_name || "",
      i.interview_date || "",
      i.status,
      i.team_assigned ? (i.team_name || "Yes") : "No",
      i.has_pdf ? "Yes" : "No",
      i.has_metadata ? "Yes" : "No",
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-tracking-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      const maxLineWidth = pageWidth - margin * 2;
      let pageNum = 1;

      const addPageHeader = (isFirstPage: boolean = false) => {
        doc.setFillColor(31, 41, 55);
        doc.rect(0, 0, pageWidth, isFirstPage ? 25 : 15, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(isFirstPage ? 16 : 10);
        doc.setFont("helvetica", "bold");
        if (isFirstPage) {
          doc.text("Interview Tracking Report", margin, 15);
        } else {
          doc.text("Interview Tracking Report", margin, 10);
          doc.text(`Page ${pageNum}`, pageWidth - margin, 10, { align: 'right' });
        }
        doc.setTextColor(0, 0, 0);
      };

      addPageHeader(true);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${format(new Date(), "PPp")}`, margin, 35);
      doc.text(`Total Records: ${sortedInterviews.length}`, margin + 70, 35);

      let y = 45;

      sortedInterviews.forEach((interview, i) => {
        const entryHeight = 22;
        if (y + entryHeight > 285) {
          doc.addPage();
          pageNum++;
          addPageHeader(false);
          y = 22;
        }

        doc.setFont("helvetica", "bold");
        doc.text(`${i + 1}. ${interview.file_name}`, margin, y);
        doc.setFont("helvetica", "normal");
        y += 4.5;
        doc.text(`Status: ${interview.status} | Field Manager: ${interview.field_manager || "-"} | Names: ${interview.total_names || "-"}`, margin, y);
        y += 4.5;
        doc.text(`Interviewee: ${interview.interviewee_name || "-"} | Date: ${interview.interview_date || "-"} | PDF: ${interview.has_pdf ? "Yes" : "No"} | Meta: ${interview.has_metadata ? "Yes" : "No"}`, margin, y);
        y += 6;
      });

      doc.save(`interview-tracking-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  const clearFilters = () => {
    setFilters({
      fieldManager: "",
      status: "",
      startDate: "",
      endDate: "",
      metadataStatus: "",
      contractor: "",
    });
    setSearchQuery("");
  };

  const hasActiveFilters = Object.values(filters).some(v => v) || searchQuery;

  // Build status options including "With Issues" and "Failed - Unresolved"
  const statusFilterOptions = useMemo(() => {
    const options = [...filterOptions.statuses];
    if (!options.includes("With Issues")) {
      options.push("With Issues");
    }
    if (!options.includes("Failed - Unresolved")) {
      options.push("Failed - Unresolved");
    }
    if (!options.includes("Failed - Resolved")) {
      options.push("Failed - Resolved");
    }
    return options.sort((a, b) => (a ?? '').localeCompare(b ?? ''));
  }, [filterOptions.statuses]);

  // Check if user can resolve issues (field managers, admins, super admins, sub_contractors)
  const canResolveIssue = isFieldManager || isAdmin || isSuperAdmin || isSubContractor;

  // Handler to open Comments modal (replaces Mark Resolved flow)
  const handleMarkResolved = (interview: TrackingInterview) => {
    setResolvedCommentsInterview(interview);
    setShowResolvedCommentsModal(true);
  };

  // Handler to open Comments modal for resolved interviews
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

  // Get team assignment badge based on flagged status
  const getTeamBadge = (interview: TrackingInterview) => {
    if (!interview.team_assigned) {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Not Assigned
        </Badge>
      );
    }

    // Flagged and not resolved - RED
    if (interview.is_flagged_for_issue && !interview.issue_resolved_at) {
      return (
        <Badge className="gap-1 bg-red-500 text-white border-red-600">
          <AlertTriangle className="h-3 w-3" />
          {interview.team_name || "Flagged"}
        </Badge>
      );
    }

    // Completed - GREEN
    if (interview.entry_status === 'data_entry_complete') {
      return (
        <Badge className="gap-1 bg-green-500 text-white border-green-600">
          <Users className="h-3 w-3" />
          {interview.team_name || "Assigned"}
        </Badge>
      );
    }

    // In progress - YELLOW
    return (
      <Badge className="gap-1 bg-yellow-400 text-yellow-900 border-yellow-500">
        <Users className="h-3 w-3" />
        {interview.team_name || "Assigned"}
      </Badge>
    );
  };

  const getStatusBadge = (status: string, artifactCorrection?: string[] | null, interview?: TrackingInterview) => {
    const badge = (() => {
      switch (status) {
        case "Audit Passed":
          return <Badge className="bg-success text-success-foreground gap-1"><CheckCircle className="h-3 w-3" />Passed</Badge>;
        case "Audit Failed":
          return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
        case "Awaiting Review":
          return <Badge variant="outline" className="text-warning border-warning gap-1">Pending</Badge>;
        case "In Review":
          return <Badge variant="secondary" className="gap-1">In Review</Badge>;
        default:
          return <Badge variant="outline">{status}</Badge>;
      }
    })();

    // Show artifact correction indicators for failed audits
    if (status === "Audit Failed" && artifactCorrection && artifactCorrection.length > 0) {
      const hasPdf = artifactCorrection.includes("scanned_pdf");
      const hasMeta = artifactCorrection.includes("mobile_metadata");
      const hasFieldAudit = artifactCorrection.includes("no_field_audit");
      
      let correctionBadge = null;
      if (hasPdf && hasMeta && hasFieldAudit) {
        correctionBadge = <Badge className="h-5 px-1.5 text-[10px] bg-purple-100 text-purple-700 border-purple-300">B+F</Badge>;
      } else if (hasPdf && hasMeta) {
        correctionBadge = <Badge className="h-5 px-1.5 text-[10px] bg-purple-100 text-purple-700 border-purple-300">B</Badge>;
      } else if (hasPdf) {
        correctionBadge = <Badge className="h-5 px-1.5 text-[10px] bg-red-100 text-red-700 border-red-300">P</Badge>;
      } else if (hasMeta) {
        correctionBadge = <Badge className="h-5 px-1.5 text-[10px] bg-orange-100 text-orange-700 border-orange-300">M</Badge>;
      } else if (hasFieldAudit) {
        correctionBadge = <Badge className="h-5 px-1.5 text-[10px] bg-yellow-100 text-yellow-700 border-yellow-300">F</Badge>;
      }

      return (
        <div className="flex items-center gap-1">
          {badge}
          {correctionBadge}
        </div>
      );
    }

    // Show override indicator for passed-with-failures
    if (status === "Audit Passed" && interview?.passed_with_failures) {
      return (
        <div className="flex items-center gap-1">
          {badge}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-amber-100 text-amber-700 border border-amber-300 cursor-help" onClick={(e) => e.stopPropagation()}>
                  <AlertTriangle className="h-3 w-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs" onClick={(e) => e.stopPropagation()}>
                <p className="font-semibold text-xs mb-1">Passed with Override</p>
                <p className="text-xs">{interview.pass_override_reason || "No reason provided"}</p>
                {interview.pass_override_action_plan && (
                  <p className="text-xs mt-1 text-muted-foreground">Action Plan: {interview.pass_override_action_plan}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    }

    return badge;
  };

  const handleViewFailed = (interview: TrackingInterview) => {
    setSelectedInterview(interview);
    setShowFailedModal(true);
  };

  // Handle metadata upload from tracking page
  const handleMetadataUpload = async (interviewId: string, fileName: string, file: File) => {
    if (!file || !file.name.endsWith('.zip')) {
      toast({
        title: "Invalid file",
        description: "Please upload a ZIP file containing metadata",
        variant: "destructive",
      });
      return;
    }

    setActiveUpload({
      interviewId,
      fileName: file.name,
      interviewName: fileName,
      fileSize: file.size,
      progress: 0,
      status: "uploading",
    });
    
    try {
      const zipPath = `mobile-zips/${interviewId}/${Date.now()}_${file.name}`;

      const { data: signedData, error: signError } = await supabase.storage
        .from("mobile-zips")
        .createSignedUploadUrl(zipPath);

      if (signError || !signedData) throw signError || new Error("Failed to create upload URL");

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 80);
            setActiveUpload(prev => prev ? { ...prev, progress: pct } : prev);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed with status ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.open("PUT", signedData.signedUrl);
        xhr.setRequestHeader("Content-Type", file.type || "application/zip");
        xhr.send(file);
      });

      setActiveUpload(prev => prev ? { ...prev, progress: 82, status: "processing" } : prev);

      const { data: urlData } = supabase.storage
        .from("mobile-zips")
        .getPublicUrl(zipPath);

      const { error: updateError } = await supabase
        .from("audits")
        .update({
          mobile_zip_url: urlData.publicUrl,
          mobile_zip_uploaded_at: new Date().toISOString(),
        })
        .eq("id", interviewId);

      if (updateError) throw updateError;

      setActiveUpload(prev => prev ? { ...prev, progress: 90 } : prev);

      const { error: processError } = await supabase.functions.invoke("process-mobile-zip", {
        body: { auditId: interviewId, mobileZipUrl: urlData.publicUrl },
      });

      if (processError) {
        console.error("Process error:", processError);
      }

      setActiveUpload(prev => prev ? { ...prev, progress: 100, status: "success" } : prev);
      queryClient.invalidateQueries({ queryKey: ["interview-metadata"] });

      toast({
        title: "Metadata uploaded successfully",
        description: "The metadata ZIP has been uploaded and processed.",
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      setActiveUpload(prev => prev ? { ...prev, status: "error", errorMessage: error.message || "Upload failed" } : prev);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload metadata",
        variant: "destructive",
      });
    }
  };

  const triggerFileInput = (interviewId: string) => {
    fileInputRefs.current[interviewId]?.click();
  };

  // Action dropdown for both mobile and desktop
  const renderActionDropdown = (interview: TrackingInterview) => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* View PDF - only for interviews with PDF but no metadata */}
          {interview.has_pdf && interview.file_url && !interview.has_metadata && (
            <DropdownMenuItem onClick={() => window.open(interview.file_url!, '_blank')}>
              <FileText className="h-4 w-4 mr-2" />
              View PDF
            </DropdownMenuItem>
          )}
          {/* View Failed */}
          {interview.status === "Audit Failed" && (
            <DropdownMenuItem onClick={() => handleViewFailed(interview)}>
              <Eye className="h-4 w-4 mr-2" />
              View Failed
            </DropdownMenuItem>
          )}
          {/* Comment / Resolved */}
          {interview.status !== "Audit Passed" && !(interview.status === "Awaiting Review" && interview.has_pdf && interview.has_metadata) && (
            interview.artifact_correction_resolved_at ? (
              <DropdownMenuItem onClick={() => handleViewResolutionComments(interview)}>
                <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                Resolved
                {interview.unread_comment_count > 0 && (
                  <Badge variant="destructive" className="ml-auto h-5 min-w-5 text-[10px] px-1">
                    {interview.unread_comment_count}
                  </Badge>
                )}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => handleViewResolutionComments(interview)}>
                <MessageCircle className="h-4 w-4 mr-2" />
                Comment
                {interview.unread_comment_count > 0 && (
                  <Badge variant="destructive" className="ml-auto h-5 min-w-5 text-[10px] px-1">
                    {interview.unread_comment_count}
                  </Badge>
                )}
              </DropdownMenuItem>
            )
          )}
          {/* View Issue */}
          {canResolveIssue && interview.is_flagged_for_issue && !interview.issue_resolved_at && (
            <DropdownMenuItem onClick={() => handleViewIssue(interview)} className="text-destructive">
              <Flag className="h-4 w-4 mr-2" />
              View Issue
            </DropdownMenuItem>
          )}
          {/* Upload Metadata */}
          {!interview.has_metadata && (
            <DropdownMenuItem onClick={() => triggerFileInput(interview.id)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Metadata
            </DropdownMenuItem>
          )}
          {/* Edit Filename - only for interviews without metadata */}
          {!interview.has_metadata && (
            <DropdownMenuItem onClick={() => {
              setEditFilenameInterview(interview);
              setNewFilename(interview.file_name);
              setShowEditFilename(true);
            }}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Filename
            </DropdownMenuItem>
          )}
          {/* Send to Burn */}
          {interview.status !== "Audit Passed" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => { setBurnInterview(interview); setShowBurnDialog(true); }}
                className="text-orange-600 focus:text-orange-600"
              >
                <Flame className="h-4 w-4 mr-2" />
                Send to Burn
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container py-4 sm:py-8 px-4 sm:px-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Interview Tracking</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              {isSuperAdmin ? "View all interviews" :
               (isAdmin || isSubContractor) ? "View interviews from your assigned field managers" :
               isFieldManager ? "View interviews from your team" :
               "View interviews from your contractor"}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <BulkMetadataUploadDialog
              onUploadComplete={() => queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] })}
              trigger={
                <Button variant="outline" className="gap-2 text-xs sm:text-sm">
                  <FileArchive className="h-4 w-4" />
                  <span className="sm:hidden text-[10px]">ZIP</span>
                  <span className="hidden sm:inline">Bulk Metadata</span>
                </Button>
              }
            />
            <BulkPdfUploadDialog
              onUploadComplete={() => queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] })}
              onUploadProgress={(p) => {
                if (p) {
                  setActiveUpload({ interviewId: "bulk-pdf", ...p });
                }
              }}
              trigger={
                <Button variant="outline" className="gap-2 text-xs sm:text-sm">
                  <Upload className="h-4 w-4" />
                  <span className="sm:hidden text-[10px]">PDF</span>
                  <span className="hidden sm:inline">Bulk PDF</span>
                </Button>
              }
            />
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2 text-xs sm:text-sm">
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {hasActiveFilters && <Badge variant="secondary" className="ml-1">Active</Badge>}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2 text-xs sm:text-sm" disabled={isExporting}>
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleExportCSV}>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF}>Export as PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
                <p className="text-lg sm:text-2xl font-bold">
                  {interviewsWithUnreadCounts.length}
                  {hasActiveFilters && <span className="text-sm font-semibold text-muted-foreground"> ({nameStats.filteredInterviewCount})</span>}
                </p>
                <p className="text-xs font-medium text-primary">
                  {nameStats.total.toLocaleString()} names
                </p>
                {hasActiveFilters && nameStats.filteredTotal !== nameStats.total && (
                  <p className="text-xs text-muted-foreground">({nameStats.filteredTotal.toLocaleString()} names)</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Passed</p>
                <p className="text-lg sm:text-2xl font-bold">
                  {interviewsWithUnreadCounts.filter(i => i.status === "Audit Passed").length}
                  {hasActiveFilters && <span className="text-sm font-semibold text-muted-foreground"> ({nameStats.filteredPassedCount})</span>}
                </p>
                <p className="text-xs font-medium text-success">
                  {nameStats.passed.toLocaleString()} names
                </p>
                {hasActiveFilters && nameStats.filteredPassed !== nameStats.passed && (
                  <p className="text-xs text-muted-foreground">({nameStats.filteredPassed.toLocaleString()} names)</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Failed</p>
                <p className="text-lg sm:text-2xl font-bold">
                  {interviewsWithUnreadCounts.filter(i => i.status === "Audit Failed").length}
                  {hasActiveFilters && <span className="text-sm font-semibold text-muted-foreground"> ({nameStats.filteredFailedCount})</span>}
                </p>
                <p className="text-xs font-medium text-destructive">
                  {nameStats.failed.toLocaleString()} names
                </p>
                {hasActiveFilters && nameStats.filteredFailed !== nameStats.failed && (
                  <p className="text-xs text-muted-foreground">({nameStats.filteredFailed.toLocaleString()} names)</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Flag className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Unresolved Issues</p>
                <p className="text-lg sm:text-2xl font-bold text-red-600">
                  {interviewsWithUnreadCounts.filter(i => i.is_flagged_for_issue && !i.issue_resolved_at).length}
                  {hasActiveFilters && <span className="text-sm font-semibold text-muted-foreground"> ({nameStats.filteredUnresolvedCount})</span>}
                </p>
                {hasActiveFilters && (
                  <p className="text-xs text-muted-foreground">({nameStats.filteredUnresolved.toLocaleString()} names)</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <FolderOpen className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">No Metadata</p>
                <p className="text-lg sm:text-2xl font-bold text-orange-600">
                  {interviewsWithUnreadCounts.filter(i => !i.has_metadata).length}
                  {hasActiveFilters && <span className="text-sm font-semibold text-muted-foreground"> ({nameStats.filteredNoMetaCount})</span>}
                </p>
                {hasActiveFilters && (
                  <p className="text-xs text-muted-foreground">({nameStats.filteredNoMeta.toLocaleString()} names)</p>
                )}
              </div>
            </CardContent>
          </Card>
          {/* Sent to Burn stat card */}
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Flame className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Sent to Burn</p>
                <p className="text-lg sm:text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {burnedAuditData.scopedCount}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Filtered</p>
                <p className="text-lg sm:text-2xl font-bold">{filteredInterviews.length}</p>
                <p className="text-xs font-medium text-purple-600">
                  {nameStats.filtered.toLocaleString()} names
                </p>
              </div>
            </CardContent>
          </Card>
        </div>


        {/* Filters Panel */}
        {showFilters && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Filters</CardTitle>
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                  <X className="h-4 w-4" />
                  Clear All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <Label className="text-sm">Search</Label>
                  <Input
                    placeholder="ID, interviewee..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm">Field Manager</Label>
                  <Select value={filters.fieldManager} onValueChange={(v) => setFilters({ ...filters, fieldManager: v === "all" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Field Managers</SelectItem>
                      {[...filterOptions.fieldManagers].sort((a, b) => (a ?? '').localeCompare(b ?? '')).map(fm => (
                        <SelectItem key={fm} value={fm!}>{fm}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Status</Label>
                  <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {statusFilterOptions.map(s => (
                        <SelectItem key={s} value={s!}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Metadata</Label>
                  <Select value={filters.metadataStatus} onValueChange={(v) => setFilters({ ...filters, metadataStatus: v === "all" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Interviews</SelectItem>
                      <SelectItem value="with_metadata">With Metadata</SelectItem>
                      <SelectItem value="without_metadata">Without Metadata</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {hasMultipleContractors && (
                  <div>
                    <Label className="text-sm">Contractor</Label>
                    <Select value={filters.contractor} onValueChange={(v) => setFilters({ ...filters, contractor: v === "all" ? "" : v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Contractors</SelectItem>
                        {filterOptions.contractors.map(c => (
                          <SelectItem key={c} value={c!}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-sm">Start Date</Label>
                  <Input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-sm">End Date</Label>
                  <Input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table/Mobile View */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : paginatedInterviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No interviews found</p>
                <p className="text-sm text-muted-foreground">
                  {hasActiveFilters ? "Try adjusting your filters" : "No interviews match your access level"}
                </p>
              </div>
            ) : isMobile ? (
              /* Mobile Accordion View */
              <div className="divide-y">
                <Accordion type="single" collapsible className="w-full">
                  {paginatedInterviews.map((interview, index) => (
                    <AccordionItem key={interview.id} value={interview.id} className="border-0 border-b">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex flex-col items-start gap-1 text-left flex-1 mr-2">
                          <div className="flex items-center gap-2 w-full">
                            <span className="font-mono text-sm font-medium truncate max-w-[200px]">
                              {interview.file_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Mobile team badge */}
                            {!interview.team_assigned ? (
                              <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                                Not Assigned
                              </Badge>
                            ) : interview.is_flagged_for_issue && !interview.issue_resolved_at ? (
                              <Badge className="h-5 text-[10px] bg-red-500 text-white gap-0.5">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {interview.team_name || "Flagged"}
                              </Badge>
                            ) : interview.entry_status === 'data_entry_complete' ? (
                              <Badge className="h-5 text-[10px] bg-green-500 text-white">
                                {interview.team_name || "Assigned"}
                              </Badge>
                            ) : (
                              <Badge className="h-5 text-[10px] bg-yellow-400 text-yellow-900">
                                {interview.team_name || "Assigned"}
                              </Badge>
                            )}
                            {getStatusBadge(interview.status, interview.artifact_correction, interview)}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="space-y-3">
                          {/* Interview Details */}
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs">Field Manager</p>
                              <p className="font-medium">{interview.field_manager || "-"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Total Names</p>
                              <p className="font-medium">{interview.total_names || "-"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Interviewee</p>
                              <p className="font-medium truncate">{interview.interviewee_name || "-"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Last Modified</p>
                              <p className="font-medium">{interview.last_modified ? format(new Date(interview.last_modified), "MMM d, yyyy") : "-"}</p>
                            </div>
                          </div>
                          
                          {/* Artifacts Status */}
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">Artifacts</p>
                            {interview.has_pdf && interview.has_metadata ? (
                              <Badge variant="outline" className="gap-1 text-success border-success">
                                <CheckCircle className="h-3 w-3" />
                                Complete
                              </Badge>
                            ) : (
                              <div className="flex items-center gap-2">
                                {!interview.has_pdf && (
                                  <Badge variant="destructive" className="gap-1">
                                    <FileCheck className="h-3 w-3" />
                                    PDF
                                  </Badge>
                                )}
                                {!interview.has_metadata && (
                                  <Badge variant="destructive" className="gap-1">
                                    <FolderOpen className="h-3 w-3" />
                                    Meta
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Hidden file input for metadata upload */}
                          {!interview.has_metadata && (
                            <input
                              type="file"
                              accept=".zip"
                              className="hidden"
                              ref={(el) => { fileInputRefs.current[interview.id] = el; }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleMetadataUpload(interview.id, interview.file_name, file);
                                }
                                e.target.value = '';
                              }}
                            />
                          )}

                          {/* Action Dropdown */}
                          <div className="flex items-center gap-2 pt-2">
                            {renderActionDropdown(interview)}
                            <span className="text-xs text-muted-foreground">Actions</span>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                
                {/* Pagination */}
                <div className="px-4 py-3">
                  <AuditPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalCount={sortedInterviews.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={(newValue) => {
                      setItemsPerPage(newValue);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </div>
            ) : (
              /* Desktop Table View */
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">SN</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort("file_name")}>
                        <div className="flex items-center gap-1">
                          Interview ID
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead>Field Manager</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort("total_names")}>
                        <div className="flex items-center gap-1">
                          Names
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead>Interviewee</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort("last_modified")}>
                        <div className="flex items-center gap-1">
                          Last Modified
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Team Assigned</TableHead>
                      <TableHead>Artifacts</TableHead>
                      <TableHead className="w-16">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInterviews.map((interview, index) => (
                      <TableRow key={interview.id}>
                        <TableCell className="font-medium">
                          {(currentPage - 1) * itemsPerPage + index + 1}
                        </TableCell>
                        <TableCell 
                          className={`font-medium font-mono text-sm ${interview.status === "Audit Failed" ? "cursor-pointer hover:text-primary underline md:no-underline md:cursor-default" : ""}`}
                          onClick={() => {
                            if (interview.status === "Audit Failed") {
                              handleViewFailed(interview);
                            }
                          }}
                        >
                          {interview.file_name}
                        </TableCell>
                        <TableCell>{interview.field_manager || "-"}</TableCell>
                        <TableCell>{interview.total_names || "-"}</TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {interview.interviewee_name || "-"}
                        </TableCell>
                        <TableCell>{interview.last_modified ? format(new Date(interview.last_modified), "MMM d, yyyy") : "-"}</TableCell>
                        <TableCell>{getStatusBadge(interview.status, interview.artifact_correction)}</TableCell>
                        <TableCell>
                          {getTeamBadge(interview)}
                        </TableCell>
                        <TableCell>
                          {interview.has_pdf && interview.has_metadata ? (
                            <Badge variant="outline" className="gap-1 text-success border-success">
                              <CheckCircle className="h-3 w-3" />
                              Complete
                            </Badge>
                          ) : (
                            <div className="flex items-center gap-2">
                              {!interview.has_pdf && (
                                <Badge variant="destructive" className="gap-1">
                                  <FileCheck className="h-3 w-3" />
                                  PDF
                                </Badge>
                              )}
                              {!interview.has_metadata && (
                                <Badge variant="destructive" className="gap-1">
                                  <FolderOpen className="h-3 w-3" />
                                  Meta
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {/* Hidden file input for metadata upload */}
                          {!interview.has_metadata && (
                            <input
                              type="file"
                              accept=".zip"
                              className="hidden"
                              ref={(el) => { fileInputRefs.current[interview.id] = el; }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleMetadataUpload(interview.id, interview.file_name, file);
                                }
                                e.target.value = '';
                              }}
                            />
                          )}
                          {renderActionDropdown(interview)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="px-4 py-3 border-t">
                  <AuditPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalCount={sortedInterviews.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={(newValue) => {
                      setItemsPerPage(newValue);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Failed Interview Modal */}
      <FailedInterviewModal
        open={showFailedModal}
        onOpenChange={setShowFailedModal}
        interview={selectedInterview}
        onUploadProgress={(p) => {
          if (p) {
            setActiveUpload({ interviewId: selectedInterview?.id || "failed", ...p });
          }
        }}
      />

      {/* View Issue Dialog */}
      <ViewIssueDialog
        open={showIssueDialog}
        onOpenChange={setShowIssueDialog}
        interview={selectedIssueInterview}
        onResolve={handleResolveIssue}
        isResolving={resolveIssueMutation.isPending}
      />

      {/* Mark as Resolved Dialog */}
      {markResolvedInterview && (
        <MarkResolvedDialog
          open={showMarkResolvedDialog}
          onOpenChange={setShowMarkResolvedDialog}
          auditId={markResolvedInterview.id}
          fileName={markResolvedInterview.file_name}
        />
      )}

      {/* Resolved Comments Modal */}
      {resolvedCommentsInterview && (
        <ResolvedCommentsModal
          open={showResolvedCommentsModal}
          onOpenChange={setShowResolvedCommentsModal}
          auditId={resolvedCommentsInterview.id}
          fileName={resolvedCommentsInterview.file_name}
          resolvedAt={resolvedCommentsInterview.artifact_correction_resolved_at}
          resolvedBy={resolvedCommentsInterview.artifact_correction_resolved_by}
        />
      )}

      {/* Floating Upload Progress Panel */}
      {activeUpload && (
        <FloatingUploadProgress
          fileName={activeUpload.fileName}
          interviewName={activeUpload.interviewName}
          fileSize={activeUpload.fileSize}
          progress={activeUpload.progress}
          status={activeUpload.status}
          errorMessage={activeUpload.errorMessage}
          onClose={() => setActiveUpload(null)}
        />
      )}

      {/* Send to Burn Dialog */}
      {burnInterview && (
        <SendToBurnDialog
          open={showBurnDialog}
          onOpenChange={setShowBurnDialog}
          auditId={burnInterview.id}
          fileName={burnInterview.file_name}
        />
      )}

      {/* Edit Filename Dialog */}
      {editFilenameInterview && (
        <AlertDialog open={showEditFilename} onOpenChange={setShowEditFilename}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Edit Filename</AlertDialogTitle>
              <AlertDialogDescription>
                Change the filename for this interview. Current: {editFilenameInterview.file_name}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Label htmlFor="new-filename">New Filename</Label>
              <Input
                id="new-filename"
                value={newFilename}
                onChange={(e) => setNewFilename(e.target.value)}
                placeholder="Enter new filename"
                className="mt-2"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isEditingFilename}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isEditingFilename || !newFilename.trim() || newFilename.trim() === editFilenameInterview.file_name}
                onClick={async () => {
                  setIsEditingFilename(true);
                  try {
                    const { error } = await supabase
                      .from("audits")
                      .update({ file_name: newFilename.trim() })
                      .eq("id", editFilenameInterview.id);
                    if (error) throw error;
                    toast({ title: "Filename Updated", description: `Renamed to ${newFilename.trim()}` });
                    setShowEditFilename(false);
                    queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
                  } catch (error) {
                    toast({ title: "Error", description: "Failed to update filename", variant: "destructive" });
                  } finally {
                    setIsEditingFilename(false);
                  }
                }}
              >
                {isEditingFilename ? "Saving..." : "Save"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};

export default InterviewTracking;
