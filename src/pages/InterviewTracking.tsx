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
}

const InterviewTracking = () => {
  const { user, userRole, profile } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("last_modified");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePersistentPageSize("interview-tracking", 20);
  
  const [filters, setFilters] = useState({
    fieldManager: "",
    status: "",
    startDate: "",
    endDate: "",
    metadataStatus: "",
    contractor: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [advFilter, setAdvFilter] = useState<AdvancedFilterState>(emptyAdvancedFilter);

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
  const [reassignInterview, setReassignInterview] = useState<TrackingInterview | null>(null);
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

  const assignedFieldManagers = isAdmin ? adminAssignedFMs : isSubContractor ? subContractorAssignedFMs : [];

  const { data: teamAssignments = [] } = useQuery({
    queryKey: ["team-assignments-tracking", user?.id, assignedFieldManagers, isSuperAdmin],
    queryFn: async () => {
      if (!user?.id) return [];
      let query = supabase
        .from("team_assignments")
        .select("interviewer_code, field_manager_id")
        .eq("status", "approved");
      
      if (isSuperAdmin) {
        // Fetch all approved assignments
      } else if (isFieldManager) {
        query = query.eq("field_manager_id", user.id);
      } else if ((isAdmin || isSubContractor) && assignedFieldManagers.length > 0) {
        const fmIds = assignedFieldManagers.map((fm: any) => fm.field_manager_id);
        query = query.in("field_manager_id", fmIds);
      } else {
        return [];
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Main interviews query - OPTIMIZED with direct join relation to remove heavy secondary query loop
  const { data: interviews = [], isLoading } = useQuery({
    queryKey: ["tracking-interviews", userRole, effectiveContractorId, teamAssignments],
    queryFn: async () => {
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
            ),
            interview_assignments (
              id,
              team_id, 
              entry_status,
              is_flagged_for_issue,
              issue_comment,
              flagged_by,
              flagged_at,
              issue_resolved_at,
              issue_resolved_by,
              resolve_comment,
              data_entry_teams (
                name
              )
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

      const auditsWithMeta = allAudits.filter((audit) => {
        const meta = audit.interview_metadata?.[0] || null;
        if (!meta) return true;
        if (isSuperAdmin) return true;
        if (isContractor || isSubContractor) {
          return meta.contractor_id === effectiveContractorId;
        }
        if (isAdmin || isFieldManager) {
          if (!teamAssignments || teamAssignments.length === 0) return false;
          const allowedCodes = new Set(teamAssignments.map((t: any) => t.interviewer_code));
          return allowedCodes.has(meta.interviewer_code);
        }
        return false;
      });

      // Direct properties access mapping - changes O(N^2) slow lookup to super fast O(1) matching
      return auditsWithMeta.map((audit) => {
        const assignment = audit.interview_assignments?.[0] || null;
        const meta = audit.interview_metadata?.[0] || null;
        return {
          id: audit.id,
          file_name: audit.file_name,
          file_url: audit.file_url,
          status: audit.status || "Awaiting Review",
          reviewed_at: audit.reviewed_at,
          review_comment: audit.review_comment,
          action_plan: audit.action_plan,
          artifact_correction: audit.artifact_correction,
          artifact_correction_resolved_at: audit.artifact_correction_resolved_at,
          artifact_correction_resolved_by: audit.artifact_correction_resolved_by,
          passed_with_failures: audit.passed_with_failures || false,
          pass_override_reason: audit.pass_override_reason,
          pass_override_action_plan: audit.pass_override_action_plan,
          last_modified: audit.last_modified || audit.uploaded_at,
          has_metadata: !!meta,
          has_pdf: !!audit.file_url,
          field_manager: meta?.field_manager || null,
          total_names: meta?.total_names || 0,
          interviewee_name: meta?.interviewee_name || null,
          interview_date: meta?.interview_date || null,
          team_assigned: !!assignment,
          team_name: assignment?.data_entry_teams?.name || null,
          entry_status: assignment?.entry_status || null,
          is_flagged_for_issue: assignment?.is_flagged_for_issue || false,
          issue_comment: assignment?.issue_comment || null,
          flagged_by: assignment?.flagged_by || null,
          flagged_at: assignment?.flagged_at || null,
          issue_resolved_at: assignment?.issue_resolved_at || null,
          issue_resolved_by: assignment?.issue_resolved_by || null,
          resolve_comment: assignment?.resolve_comment || null,
          assignment_id: assignment?.id || null,
          has_resolution_comments: !!assignment?.resolve_comment,
          unread_comment_count: 0,
        };
      });
    },
  });

  const { data: burnHistoryMap } = useBurnHistory();

  // Derive the set of currently-burned audit IDs from the burn history map.
  // useBurnHistory returns a React Query result whose `data` is a Map<string, BurnHistoryEntry>,
  // which can be undefined while the query is loading.
  const burnedAuditIds = useMemo(() => {
    const set = new Set<string>();
    if (burnHistoryMap) {
      for (const [auditId, entry] of burnHistoryMap.entries()) {
        if (entry.currently_burned) set.add(auditId);
      }
    }
    return set;
  }, [burnHistoryMap]);

  const nonBurnedInterviews = useMemo(() => {
    if (burnedAuditIds.size === 0) return interviews;
    return interviews.filter((i) => !burnedAuditIds.has(i.id));
  }, [interviews, burnedAuditIds]);

  // Step 1: Base filtration & Sort logic for total records
  const filteredInterviews = useMemo(() => {
    return nonBurnedInterviews.filter(interview => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesFile = interview.file_name.toLowerCase().includes(query);
        const matchesInterviewee = interview.interviewee_name?.toLowerCase().includes(query) || false;
        if (!matchesFile && !matchesInterviewee) return false;
      }
      if (filters.fieldManager && interview.field_manager !== filters.fieldManager) return false;
      
      if (filters.status) {
        if (filters.status === "With Issues") {
          if (!interview.is_flagged_for_issue || interview.issue_resolved_at) return false;
        } else if (filters.status === "Failed - Unresolved") {
          if (interview.status !== "Audit Failed" || interview.artifact_correction_resolved_at) return false;
        } else if (filters.status === "Failed - Resolved") {
          if (interview.status !== "Audit Failed" || !interview.artifact_correction_resolved_at) return false;
        } else if (interview.status !== filters.status) {
          return false;
        }
      }
      if (filters.startDate && interview.interview_date && interview.interview_date < filters.startDate) return false;
      if (filters.endDate && interview.interview_date && interview.interview_date > filters.endDate) return false;
      if (filters.metadataStatus) {
        if (filters.metadataStatus === "with_metadata" && !interview.has_metadata) return false;
        if (filters.metadataStatus === "without_metadata" && interview.has_metadata) return false;
      }
      if (isAdvancedFilterActive(advFilter)) {
        const proxy = {
          ...interview,
          audit_id: interview.id,
          review_comment: interview.review_comment,
          action_plan: interview.action_plan
        };
        if (!matchesAdvancedFilter(proxy as any, advFilter, burnHistoryMap)) return false;
      }
      return true;
    });
  }, [nonBurnedInterviews, searchQuery, filters, advFilter, burnHistoryMap]);

  const sortedInterviews = useMemo(() => {
    return [...filteredInterviews].sort((a, b) => {
      let aVal = a[sortField as keyof TrackingInterview];
      let bVal = b[sortField as keyof TrackingInterview];
      if (sortField === "interview_date" || sortField === "last_modified") {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }
      if (typeof aVal === "string") {
        return sortOrder === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      if (typeof aVal === "number") {
        return sortOrder === "asc" ? aVal - (bVal as number) : (bVal as number) - aVal;
      }
      return 0;
    });
  }, [filteredInterviews, sortField, sortOrder]);

  // Step 2: Slice current pagination block BEFORE fetching unread counts
  const paginatedInterviewsBeforeUnread = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedInterviews.slice(start, start + itemsPerPage);
  }, [sortedInterviews, currentPage, itemsPerPage]);

  // Step 3: Extract IDs only for the visual workspace (TRUE Lazy Loading)
  const currentPageAuditIds = useMemo(() => {
    return paginatedInterviewsBeforeUnread.map(i => i.id);
  }, [paginatedInterviewsBeforeUnread]);

  // Only queries unread comment counts for rows inside view grid
  const { data: unreadCommentCounts = {} } = useQuery({
    queryKey: ["unread-comment-counts-lazy", currentPageAuditIds, user?.id],
    queryFn: async () => {
      if (!currentPageAuditIds.length || !user?.id) return {};
      const { data: comments, error: commentsError } = await supabase
        .from("audit_comments")
        .select("id, audit_id")
        .in("audit_id", currentPageAuditIds);
      if (commentsError) throw commentsError;
      if (!comments || comments.length === 0) return {};
      const commentIds = comments.map(c => c.id);
      
      const { data: allReads, error: readsError } = await supabase
        .from("audit_comment_reads")
        .select("comment_id")
        .eq("user_id", user.id)
        .in("comment_id", commentIds);
      if (readsError) throw readsError;
      
      const readSet = new Set(allReads.map((r: any) => r.comment_id));
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

  // Step 4: Merge lazy loaded counter stats for visible workspace rows
  const paginatedInterviews = useMemo(() => {
    return paginatedInterviewsBeforeUnread.map(i => ({
      ...i,
      unread_comment_count: unreadCommentCounts[i.id] || 0,
    }));
  }, [paginatedInterviewsBeforeUnread, unreadCommentCounts]);

  const nameStats = useMemo(() => {
    const sum = (list: any[]) => list.reduce((acc, curr) => acc + (curr.total_names || 0), 0);
    const passed = nonBurnedInterviews.filter(i => i.status === "Audit Passed");
    const failed = nonBurnedInterviews.filter(i => i.status === "Audit Failed");
    const pending = nonBurnedInterviews.filter(i => i.status === "Awaiting Review");
    
    const filteredPassed = filteredInterviews.filter(i => i.status === "Audit Passed");
    const filteredFailed = filteredInterviews.filter(i => i.status === "Audit Failed");
    const filteredUnresolved = filteredInterviews.filter(i => i.is_flagged_for_issue && !i.issue_resolved_at);
    const filteredNoMeta = filteredInterviews.filter(i => !i.has_metadata);
    
    return {
      total: sum(nonBurnedInterviews),
      passed: sum(passed),
      failed: sum(failed),
      pending: sum(pending),
      filtered: sum(filteredInterviews),
      filteredPassed: sum(filteredPassed),
      filteredFailed: sum(filteredFailed),
      filteredUnresolved: sum(filteredUnresolved),
      filteredNoMeta: sum(filteredNoMeta),
      filteredPassedCount: filteredPassed.length,
      filteredFailedCount: failed.length,
    };
  }, [nonBurnedInterviews, filteredInterviews]);

  const filterOptions = useMemo(() => {
    const managers = new Set<string>();
    const statuses = new Set<string>();
    interviews.forEach(i => {
      if (i.field_manager) managers.add(i.field_manager);
      if (i.status) statuses.add(i.status);
    });
    return {
      fieldManagers: Array.from(managers).sort(),
      statuses: Array.from(statuses).sort(),
    };
  }, [interviews]);

  const { data: canonicalFms = [] } = useQuery({
    queryKey: ["canonical-field-managers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "field_manager");
      if (error) throw error;
      return data || [];
    },
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleEditFilenameClick = (interview: TrackingInterview, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditFilenameInterview(interview);
    setNewFilename(interview.file_name);
    setShowEditFilename(true);
  };

  const saveFilename = async () => {
    if (!editFilenameInterview || !newFilename.trim()) return;
    setIsEditingFilename(true);
    try {
      const { error } = await supabase
        .from("audits")
        .update({ file_name: newFilename.trim() })
        .eq("id", editFilenameInterview.id);
      if (error) throw error;
      toast({ title: "Success", description: "Filename updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
      setShowEditFilename(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update filename", variant: "destructive" });
    } finally {
      setIsEditingFilename(false);
    }
  };

  const handleExportPDF = async () => {
    if (sortedInterviews.length === 0) return;
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      let pageNum = 1;
      const margin = 14;
      const maxLineWidth = 180;
      
      const addPageHeader = (isFirstPage = false) => {
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        if (isFirstPage) {
          doc.text("Interview Tracking Audit Log", margin, 16);
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.text(`Generated on: ${format(new Date(), "PPP p")}`, margin, 23);
          doc.line(margin, 26, 200 - margin, 26);
        } else {
          doc.setFontSize(10);
          doc.text("Interview Tracking Audit Log (Continued)", margin, 12);
          doc.line(margin, 15, 200 - margin, 15);
        }
      };

      addPageHeader(true);
      let y = 32;

      sortedInterviews.forEach((interview) => {
        const isFailed = interview.status === "Audit Failed";
        const reviewComment = interview.review_comment;
        const actionPlanText = interview.action_plan;
        const overrideReason = interview.pass_override_reason;
        const overrideAction = interview.pass_override_action_plan;

        const reasonLines = isFailed && reviewComment ? doc.splitTextToSize(`Failure Reason: ${reviewComment}`, maxLineWidth) as string[] : [];
        const planLines = isFailed && actionPlanText ? doc.splitTextToSize(`Action Plan: ${actionPlanText}`, maxLineWidth) as string[] : [];
        const overrideReasonLines = overrideReason ? doc.splitTextToSize(`Override Reason: ${overrideReason}`, maxLineWidth) as string[] : [];
        const overrideActionLines = overrideAction ? doc.splitTextToSize(`Override Action Plan: ${overrideAction}`, maxLineWidth) as string[] : [];

        let extraLines = reasonLines.length + planLines.length + overrideReasonLines.length + overrideActionLines.length;
        let blockHeight = 22 + (extraLines * 4);

        if (y + blockHeight > 285) {
          doc.addPage();
          pageNum++;
          addPageHeader(false);
          y = 22;
        }

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(interview.file_name, margin, y);
        y += 5.5;

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(`Status: ${interview.status} | Field Manager: ${interview.field_manager || "-"} | Names: ${interview.total_names || "-"}`, margin, y);
        y += 4.5;
        doc.text(`Interviewee: ${interview.interviewee_name || "-"} | Date: ${interview.interview_date || "-"} | PDF: ${interview.has_pdf ? "Yes" : "No"} | Meta: ${interview.has_metadata ? "Yes" : "No"}`, margin, y);
        y += 6;

        const drawLines = (lines: string[]) => {
          lines.forEach((line) => {
            if (y > 285) {
              doc.addPage();
              pageNum++;
              addPageHeader(false);
              y = 22;
            }
            doc.text(line, margin, y);
            y += 4;
          });
        };

        if (reasonLines.length) { drawLines(reasonLines); y += 1; }
        if (planLines.length) { drawLines(planLines); y += 1; }
        if (overrideReasonLines.length) { drawLines(overrideReasonLines); y += 1; }
        if (overrideActionLines.length) { drawLines(overrideActionLines); y += 1; }
        if (extraLines > 0) y += 2;
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
    setAdvFilter(emptyAdvancedFilter);
  };

  const hasActiveFilters = Object.values(filters).some(v => v) || searchQuery || isAdvancedFilterActive(advFilter);

  const statusFilterOptions = useMemo(() => {
    const options = [...filterOptions.statuses];
    if (!options.includes("With Issues")) options.push("With Issues");
    if (!options.includes("Failed - Unresolved")) options.push("Failed - Unresolved");
    if (!options.includes("Failed - Resolved")) options.push("Failed - Resolved");
    return options.sort((a, b) => (a ?? '').localeCompare(b ?? ''));
  }, [filterOptions.statuses]);

  const canResolveIssue = isFieldManager || isAdmin || isSuperAdmin || isSubContractor;

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
      return (
        <Badge variant="outline" className="text-muted-foreground"> Not Assigned </Badge>
      );
    }
    if (interview.is_flagged_for_issue && !interview.issue_resolved_at) {
      return (
        <Badge className="gap-1 bg-red-500 text-white border-red-600">
          <AlertTriangle className="h-3 w-3" /> {interview.team_name || "Flagged"}
        </Badge>
      );
    }
    if (interview.entry_status === 'data_entry_complete') {
      return (
        <Badge className="gap-1 bg-green-500 text-white border-green-600">
          <Users className="h-3 w-3" /> {interview.team_name || "Assigned"}
        </Badge>
      );
    }
    return (
      <Badge className="gap-1 bg-yellow-400 text-yellow-900 border-yellow-500">
        <Users className="h-3 w-3" /> {interview.team_name || "Assigned"}
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
              <TooltipContent side="top" className="max-w-xs">
                Passed with Failure Overrides
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    }

    return badge;
  };

  const renderActionDropdown = (interview: TrackingInterview) => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => handleEditFilenameClick(interview, e)}>
            <Pencil className="mr-2 h-4 w-4" /> Rename File
          </DropdownMenuItem>
          {(isSuperAdmin || isAdmin || isSubContractor) && (
            <DropdownMenuItem onClick={() => { setReassignInterview(interview); setShowReassignDialog(true); }}>
              <Users className="mr-2 h-4 w-4" /> Reassign FM
            </DropdownMenuItem>
          )}
          {isSuperAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setBurnInterview(interview); setShowBurnDialog(true); }}>
                <Flame className="mr-2 h-4 w-4" /> Burn Item
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Interview Tracking</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              {isSuperAdmin ? "View all interviews" : (isAdmin || isSubContractor) ? "View interviews from your assigned field managers" : "View your interviews"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleExportPDF} disabled={isExporting || sortedInterviews.length === 0} className="w-full sm:w-auto h-9 text-sm gap-2">
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export PDF
            </Button>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="relative overflow-hidden">
            <CardContent className="p-4 sm:p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Total Audited</p>
                <p className="text-lg sm:text-2xl font-bold">
                  {nonBurnedInterviews.length}
                  {hasActiveFilters && <span className="text-sm font-semibold text-muted-foreground"> ({filteredInterviews.length})</span>}
                </p>
                <p className="text-xs font-semibold text-primary">{nameStats.total.toLocaleString()} names</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg text-primary"><FileText className="h-4 w-4 sm:h-5 sm:w-5" /></div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <CardContent className="p-4 sm:p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Passed</p>
                <p className="text-lg sm:text-2xl font-bold text-success">
                  {interviews.filter(i => i.status === "Audit Passed").length}
                  {hasActiveFilters && <span className="text-sm font-semibold text-muted-foreground"> ({nameStats.filteredPassedCount})</span>}
                </p>
                <p className="text-xs font-semibold text-success">{nameStats.passed.toLocaleString()} names</p>
              </div>
              <div className="p-2 bg-success/10 rounded-lg text-success"><CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" /></div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <CardContent className="p-4 sm:p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Failed</p>
                <p className="text-lg sm:text-2xl font-bold text-destructive">
                  {interviews.filter(i => i.status === "Audit Failed").length}
                  {hasActiveFilters && <span className="text-sm font-semibold text-muted-foreground"> ({nameStats.filteredFailedCount})</span>}
                </p>
                <p className="text-xs font-semibold text-destructive">{nameStats.failed.toLocaleString()} names</p>
              </div>
              <div className="p-2 bg-destructive/10 rounded-lg text-destructive"><XCircle className="h-4 w-4 sm:h-5 sm:w-5" /></div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <CardContent className="p-4 sm:p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Awaiting Review</p>
                <p className="text-lg sm:text-2xl font-bold text-warning">
                  {interviews.filter(i => i.status === "Awaiting Review").length}
                </p>
                <p className="text-xs font-semibold text-warning">{nameStats.pending.toLocaleString()} names</p>
              </div>
              <div className="p-2 bg-warning/10 rounded-lg text-warning"><Calendar className="h-4 w-4 sm:h-5 sm:w-5" /></div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Toolbar */}
        <Card className="border-muted/60 shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search file name or interviewee..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-10" />
              </div>
              <div className="flex items-center gap-2">
                <Button variant={showFilters ? "secondary" : "outline"} onClick={() => setShowFilters(!showFilters)} className="h-10 gap-2 text-sm font-medium">
                  <Filter className="h-4 w-4" /> Filters
                  {hasActiveFilters && <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">!</Badge>}
                </Button>
                {hasActiveFilters && (
                  <Button variant="ghost" onClick={clearFilters} className="h-10 text-muted-foreground hover:text-foreground text-sm gap-1.5 px-3">
                    <X className="h-4 w-4" /> Clear
                  </Button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-2 border-t border-muted/40 animate-in fade-in-50 duration-200">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                  <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {statusFilterOptions.map(s => <SelectItem key={s} value={s!}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Field Manager</Label>
                  <Select value={filters.fieldManager} onValueChange={(v) => setFilters({ ...filters, fieldManager: v === "all" ? "" : v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Managers" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Managers</SelectItem>
                      {filterOptions.fieldManagers.map(m => <SelectItem key={m} value={m!}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Metadata Presence</Label>
                  <Select value={filters.metadataStatus} onValueChange={(v) => setFilters({ ...filters, metadataStatus: v === "all" ? "" : v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Blocks" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Blocks</SelectItem>
                      <SelectItem value="with_metadata">With Metadata</SelectItem>
                      <SelectItem value="without_metadata">Without Metadata</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Start Date</Label>
                  <Input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} className="h-9 text-sm" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">End Date</Label>
                  <Input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} className="h-9 text-sm" />
                </div>
              </div>
            )}

            <AdvancedFiltersPanel filters={advFilter} onChange={setAdvFilter} />
          </CardContent>
        </Card>

        {/* Desktop View Workspace Grid */}
        {!isMobile && (
          <Card className="border-muted/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40 font-medium">
                  <TableRow>
                    <TableHead className="w-[30%] cursor-pointer select-none" onClick={() => handleSort("file_name")}>
                      <div className="flex items-center gap-1">File Name <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="w-[12%] cursor-pointer select-none" onClick={() => handleSort("status")}>
                      <div className="flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="w-[15%] cursor-pointer select-none" onClick={() => handleSort("field_manager")}>
                      <div className="flex items-center gap-1">Field Manager <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="w-[10%] text-center cursor-pointer select-none" onClick={() => handleSort("total_names")}>
                      <div className="flex items-center justify-center gap-1">Names <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="w-[13%] cursor-pointer select-none" onClick={() => handleSort("interview_date")}>
                      <div className="flex items-center gap-1">Interview Date <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="w-[15%]">Workflow Status</TableHead>
                    <TableHead className="w-[5%] text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading workspace interviews...</TableCell></TableRow>
                  ) : paginatedInterviews.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No tracking entries match your filters.</TableCell></TableRow>
                  ) : (
                    paginatedInterviews.map((interview) => (
                      <TableRow key={interview.id} className={cn("hover:bg-muted/30 cursor-pointer transition-colors", interview.status === "Audit Failed" && "bg-destructive/5 hover:bg-destructive/10")} onClick={() => { if (interview.status === "Audit Failed") { setSelectedInterview(interview); setShowFailedModal(true); } }}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 max-w-sm">
                            <BurnHistoryIcon entry={burnHistoryMap?.get(interview.id)} />
                            <span className="truncate block" title={interview.file_name}>{interview.file_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(interview.status, interview.artifact_correction, interview)}</TableCell>
                        <TableCell className="text-muted-foreground truncate">{interview.field_manager || "-"}</TableCell>
                        <TableCell className="text-center font-semibold">{interview.total_names || 0}</TableCell>
                        <TableCell className="text-muted-foreground">{interview.interview_date ? format(new Date(interview.interview_date), "MMM d, yyyy") : "-"}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            {getTeamBadge(interview)}
                            {interview.is_flagged_for_issue && !interview.issue_resolved_at && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-destructive hover:bg-destructive/10 gap-1" onClick={() => handleViewIssue(interview)}>
                                <AlertTriangle className="h-3 w-3" /> Issue
                              </Button>
                            )}
                            {interview.issue_resolved_at && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-success hover:bg-success/10 gap-1" onClick={() => handleViewResolutionComments(interview)}>
                                <MessageCircle className="h-3 w-3" /> Resolved
                              </Button>
                            )}
                            {interview.unread_comment_count > 0 && (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-700 animate-pulse h-5 px-1.5 gap-1" onClick={() => handleMarkResolved(interview)}>
                                <MessageCircle className="h-3 w-3" /> {interview.unread_comment_count}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>{renderActionDropdown(interview)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {/* Mobile Grid/Accordion Component Rendering */}
        {isMobile && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading entries...</div>
            ) : paginatedInterviews.length === 0 ? (
              <div className="p-6 text-center bg-card rounded-xl border text-muted-foreground">No tracking entries found matching filters.</div>
            ) : (
              paginatedInterviews.map((interview) => (
                <Card key={interview.id} className={cn("overflow-hidden border-muted/70 shadow-sm", interview.status === "Audit Failed" && "border-destructive/30 bg-destructive/5")} onClick={() => { if (interview.status === "Audit Failed") { setSelectedInterview(interview); setShowFailedModal(true); } }}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <BurnHistoryIcon entry={burnHistoryMap?.get(interview.id)} />
                        <p className="font-semibold text-sm truncate" title={interview.file_name}>{interview.file_name}</p>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>{renderActionDropdown(interview)}</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {getStatusBadge(interview.status, interview.artifact_correction, interview)}
                      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
                        {getTeamBadge(interview)}
                        {interview.is_flagged_for_issue && !interview.issue_resolved_at && (
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-1.5 text-destructive" onClick={() => handleViewIssue(interview)}>Issue</Button>
                        )}
                        {interview.issue_resolved_at && (
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-1.5 text-success" onClick={() => handleViewResolutionComments(interview)}>View</Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-muted/50 text-xs text-muted-foreground">
                      <div>Field Manager: <span className="font-medium text-foreground block truncate">{interview.field_manager || "-"}</span></div>
                      <div>Names Counter: <span className="font-medium text-foreground block">{interview.total_names || 0}</span></div>
                      <div>Interviewee: <span className="font-medium text-foreground block truncate">{interview.interviewee_name || "-"}</span></div>
                      <div>Modified Date: <span className="font-medium text-foreground block">{interview.last_modified ? format(new Date(interview.last_modified), "MMM d, yyyy") : "-"}</span></div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Global Audit Workspace Pagination Component */}
        {!isLoading && filteredInterviews.length > 0 && (
          <AuditPagination currentPage={currentPage} totalItems={filteredInterviews.length} itemsPerPage={itemsPerPage} onPageChange={(page) => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onItemsPerPageChange={(size) => { setItemsPerPage(size); setCurrentPage(1); }} />
        )}
      </div>

      {/* Shared Modals and Dialog Popups */}
      {showFailedModal && selectedInterview && (
        <FailedInterviewModal open={showFailedModal} onOpenChange={setShowFailedModal} interview={selectedInterview} />
      )}

      {showIssueDialog && selectedIssueInterview && (
        <ViewIssueDialog open={showIssueDialog} onOpenChange={setShowIssueDialog} issueComment={selectedIssueInterview.issue_comment || "No details provided"} flaggedBy={selectedIssueInterview.flagged_by || "System"} flaggedAt={selectedIssueInterview.flagged_at || ""} canResolve={canResolveIssue} isResolving={resolveIssueMutation.isPending} onResolve={async (comment) => { if (selectedIssueInterview.assignment_id) { await handleResolveIssue(selectedIssueInterview.assignment_id, comment); setShowIssueDialog(false); setSelectedIssueInterview(null); } }} />
      )}

      {showResolvedCommentsModal && resolvedCommentsInterview && (
        <ResolvedCommentsModal open={showResolvedCommentsModal} onOpenChange={(v) => { setShowResolvedCommentsModal(v); if (!v) setResolvedCommentsInterview(null); }} auditId={resolvedCommentsInterview.id} assignmentId={resolvedCommentsInterview.assignment_id} />
      )}

      {showBurnDialog && burnInterview && (
        <SendToBurnDialog open={showBurnDialog} onOpenChange={(v) => { setShowBurnDialog(v); if (!v) setBurnInterview(null); }} auditId={burnInterview.id} fileName={burnInterview.file_name} />
      )}

      {showEditFilename && editFilenameInterview && (
        <AlertDialog open={showEditFilename} onOpenChange={setShowEditFilename}>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Rename File Entry</AlertDialogTitle>
              <AlertDialogDescription>Enter a new name for the tracking audit ledger record.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <Input value={newFilename} onChange={(e) => setNewFilename(e.target.value)} placeholder="File name" className="w-full" disabled={isEditingFilename} onKeyDown={(e) => { if (e.key === 'Enter') saveFilename(); }} />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isEditingFilename}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); saveFilename(); }} disabled={isEditingFilename || !newFilename.trim() || newFilename.trim() === editFilenameInterview.file_name}>
                {isEditingFilename ? "Saving..." : "Save"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {showReassignDialog && reassignInterview && (
        <ReassignFMDialog open={showReassignDialog} onOpenChange={(v) => { setShowReassignDialog(v); if (!v) setReassignInterview(null); }} auditId={reassignInterview.id} fileName={reassignInterview.file_name} currentFmId={(() => { const teamFmId = teamAssignments.find((t: any) => t.interviewer_code === (reassignInterview as any).interviewer_code)?.field_manager_id; return teamFmId || null; })()} currentFmName={(() => { const teamFmId = teamAssignments.find((t: any) => t.interviewer_code === (reassignInterview as any).interviewer_code)?.field_manager_id; return teamFmId ? canonicalFms.find(fm => fm.id === teamFmId)?.full_name || null : null; })()} contractorId={(reassignInterview as any).contractor_id || null} />
      )}
    </div>
  );
};

export default InterviewTracking;
