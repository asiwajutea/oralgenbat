import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditPagination } from "@/components/AuditPagination";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { OfflineTablePlaceholder } from "@/components/OfflineTablePlaceholder";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { format } from "date-fns";
import { History, Search, Clock, User, ExternalLink, CheckCircle2, XCircle, Calendar, Users, ClipboardList, Download, FileText, Smartphone, X, ArrowUpDown, ArrowUp, ArrowDown, Flag, MessageCircle, CheckCircle, Loader2, FileArchive } from "lucide-react";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { MarkResolvedDialog } from "@/components/tracking/MarkResolvedDialog";
import { ResolvedCommentsModal } from "@/components/tracking/ResolvedCommentsModal";

type SortField = "file_name" | "reviewed_by" | "status" | "reviewed_at" | "review_duration_seconds" | "re_audit_count";
type SortDirection = "asc" | "desc";

interface ReviewedAudit {
  id: string;
  file_name: string;
  status: string;
  reviewed_at: string;
  reviewed_by: string | null;
  review_comment: string | null;
  action_plan: string | null;
  is_re_audit: boolean;
  re_audit_count: number;
  review_duration_seconds: number | null;
  artifact_correction: string[] | null;
  artifact_correction_resolved_at: string | null;
  artifact_correction_resolved_by: string | null;
}

interface AssignmentInfo {
  audit_id: string;
  team_name: string;
  typing_status: string;
}

const STORAGE_KEYS = {
  currentPage: "adminReviewHistory_currentPage",
  itemsPerPage: "adminReviewHistory_itemsPerPage",
  statusFilter: "adminReviewHistory_statusFilter",
  reviewerFilter: "adminReviewHistory_reviewerFilter",
  searchTerm: "adminReviewHistory_searchTerm",
  sortField: "adminReviewHistory_sortField",
  sortDirection: "adminReviewHistory_sortDirection",
};

const AdminReviewHistory = () => {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  
  // Resolution dialog state
  const [showMarkResolvedDialog, setShowMarkResolvedDialog] = useState(false);
  const [showResolvedCommentsModal, setShowResolvedCommentsModal] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState<ReviewedAudit | null>(null);
  const [currentPage, setCurrentPage] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.currentPage);
    return saved ? parseInt(saved, 10) : 1;
  });
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.itemsPerPage);
    return saved ? parseInt(saved, 10) : 25;
  });
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.statusFilter) || "all";
  });
  const [reviewerFilter, setReviewerFilter] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.reviewerFilter) || "all";
  });
  const [searchTerm, setSearchTerm] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.searchTerm) || "";
  });
  const [searchInput, setSearchInput] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.searchTerm) || "";
  });
  const [sortField, setSortField] = useState<SortField>(() => {
    return (localStorage.getItem(STORAGE_KEYS.sortField) as SortField) || "reviewed_at";
  });
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    return (localStorage.getItem(STORAGE_KEYS.sortDirection) as SortDirection) || "desc";
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingPDFs, setIsDownloadingPDFs] = useState(false);

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.currentPage, currentPage.toString());
  }, [currentPage]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.itemsPerPage, itemsPerPage.toString());
  }, [itemsPerPage]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.statusFilter, statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.reviewerFilter, reviewerFilter);
  }, [reviewerFilter]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.searchTerm, searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sortField, sortField);
  }, [sortField]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sortDirection, sortDirection);
  }, [sortDirection]);

  const clearAllFilters = () => {
    setStatusFilter("all");
    setReviewerFilter("all");
    setSearchTerm("");
    setCurrentPage(1);
    setSortField("reviewed_at");
    setSortDirection("desc");
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setCurrentPage(1);
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const hasActiveFilters = statusFilter !== "all" || reviewerFilter !== "all" || searchTerm !== "";

  // Fetch unique reviewers for filter dropdown
  const { data: reviewers } = useQuery({
    queryKey: ["all-reviewers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audits")
        .select("reviewed_by")
        .not("reviewed_by", "is", null)
        .order("reviewed_by");

      if (error) throw error;

      const uniqueReviewers = [...new Set(data.map((a) => a.reviewed_by))].filter(Boolean);
      return uniqueReviewers as string[];
    },
  });

  // Fetch summary stats with total names
  const { data: stats } = useQuery({
    queryKey: ["admin-review-stats"],
    queryFn: async () => {
      // Get all reviewed audits with metadata
      const { data: allReviewed } = await supabase
        .from("audits")
        .select("status, reviewed_at, interview_metadata(total_names)")
        .not("reviewed_at", "is", null);

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      let totalReviews = 0;
      let totalNames = 0;
      let passedReviews = 0;
      let passedNames = 0;
      let failedReviews = 0;
      let failedNames = 0;
      let monthlyReviews = 0;
      let monthlyNames = 0;

      allReviewed?.forEach((audit) => {
        const meta = audit.interview_metadata as { total_names: number | null }[] | null;
        const names = meta?.[0]?.total_names || 0;

        totalReviews++;
        totalNames += names;

        if (audit.status === "Audit Passed") {
          passedReviews++;
          passedNames += names;
        } else if (audit.status === "Audit Failed") {
          failedReviews++;
          failedNames += names;
        }

        if (audit.reviewed_at && new Date(audit.reviewed_at) >= startOfMonth) {
          monthlyReviews++;
          monthlyNames += names;
        }
      });

      return {
        total: totalReviews,
        passed: passedReviews,
        failed: failedReviews,
        monthly: monthlyReviews,
        totalNames,
        passedNames,
        failedNames,
        monthlyNames,
      };
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-review-history", currentPage, itemsPerPage, statusFilter, reviewerFilter, searchTerm, sortField, sortDirection],
    queryFn: async () => {
      let query = supabase
        .from("audits")
        .select("id, file_name, status, reviewed_at, reviewed_by, review_comment, action_plan, is_re_audit, re_audit_count, review_duration_seconds, artifact_correction, artifact_correction_resolved_at, artifact_correction_resolved_by", { count: "exact" })
        .not("reviewed_at", "is", null)
        .order(sortField, { ascending: sortDirection === "asc" });

      if (statusFilter !== "all") {
        if (statusFilter === "failed_pdf") {
          query = query.eq("status", "Audit Failed").contains("artifact_correction", ["scanned_pdf"]);
        } else if (statusFilter === "failed_metadata") {
          query = query.eq("status", "Audit Failed").contains("artifact_correction", ["mobile_metadata"]);
        } else if (statusFilter === "failed_both") {
          query = query.eq("status", "Audit Failed").contains("artifact_correction", ["scanned_pdf", "mobile_metadata"]);
        } else if (statusFilter === "failed_resolved") {
          query = query.eq("status", "Audit Failed").not("artifact_correction_resolved_at", "is", null);
        } else if (statusFilter === "failed_unresolved") {
          query = query.eq("status", "Audit Failed").is("artifact_correction_resolved_at", null);
        } else {
          query = query.eq("status", statusFilter as "Audit Passed" | "Audit Failed");
        }
      }

      if (reviewerFilter !== "all") {
        query = query.eq("reviewed_by", reviewerFilter);
      }

      if (searchTerm) {
        query = query.ilike("file_name", `%${searchTerm}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      const { data: audits, count, error } = await query.range(from, to);

      if (error) throw error;

      return {
        audits: (audits || []) as ReviewedAudit[],
        totalCount: count || 0,
      };
    },
  });

  // Fetch assignment info for passed audits
  const passedAuditIds = data?.audits.filter(a => a.status === "Audit Passed").map(a => a.id) || [];
  const { data: assignments = [] } = useQuery({
    queryKey: ["review-history-assignments", passedAuditIds],
    queryFn: async () => {
      if (passedAuditIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from("interview_assignments")
        .select(`
          audit_id,
          typing_status,
          data_entry_teams (name)
        `)
        .in("audit_id", passedAuditIds);
      
      if (error) throw error;
      
      return data?.map(a => ({
        audit_id: a.audit_id,
        team_name: (a.data_entry_teams as { name: string })?.name || 'Unknown',
        typing_status: a.typing_status || 'typing_in_progress',
      })) || [];
    },
    enabled: passedAuditIds.length > 0,
  });

  const assignmentMap = new Map<string, AssignmentInfo>(assignments.map(a => [a.audit_id, a]));

  const getAssignmentBadge = (audit: ReviewedAudit) => {
    if (audit.status !== "Audit Passed") return null;
    
    const assignment = assignmentMap.get(audit.id);
    if (!assignment) {
      return (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          Unassigned
        </Badge>
      );
    }
    
    return (
      <Badge 
        variant="outline" 
        className={`text-xs gap-1 ${
          assignment.typing_status === 'typing_completed' 
            ? 'bg-green-50 text-green-700 border-green-200' 
            : 'bg-blue-50 text-blue-700 border-blue-200'
        }`}
      >
        <ClipboardList className="h-3 w-3" />
        {assignment.team_name}
      </Badge>
    );
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const totalPages = Math.ceil((data?.totalCount || 0) / itemsPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const getArtifactLabel = (artifact: string) => {
    switch (artifact) {
      case 'scanned_pdf':
        return 'Scanned PDF';
      case 'mobile_metadata':
        return 'Mobile Metadata';
      default:
        return artifact;
    }
  };

  const getArtifactIndicator = (artifacts: string[] | null) => {
    if (!artifacts || artifacts.length === 0) return null;
    
    const hasPdf = artifacts.includes('scanned_pdf');
    const hasMetadata = artifacts.includes('mobile_metadata');
    
    if (hasPdf && hasMetadata) {
      return { letter: 'B', label: 'Both PDF and Metadata need correction' };
    } else if (hasPdf) {
      return { letter: 'P', label: 'PDF needs correction' };
    } else if (hasMetadata) {
      return { letter: 'M', label: 'Metadata needs correction' };
    }
    return null;
  };

  // Helper function to apply status filter to export queries
  const applyStatusFilter = (query: any, filter: string) => {
    if (filter === "failed_pdf") {
      return query.eq("status", "Audit Failed").contains("artifact_correction", ["scanned_pdf"]);
    } else if (filter === "failed_metadata") {
      return query.eq("status", "Audit Failed").contains("artifact_correction", ["mobile_metadata"]);
    } else if (filter === "failed_both") {
      return query.eq("status", "Audit Failed").contains("artifact_correction", ["scanned_pdf", "mobile_metadata"]);
    } else {
      return query.eq("status", filter as "Audit Passed" | "Audit Failed");
    }
  };

  // Export functions
  const exportToCSV = async () => {
    setIsExporting(true);
    try {
      // Fetch all filtered data for export
      let query = supabase
        .from("audits")
        .select("id, file_name, status, reviewed_at, reviewed_by, review_comment, action_plan, is_re_audit, re_audit_count, review_duration_seconds, artifact_correction")
        .not("reviewed_at", "is", null)
        .order("reviewed_at", { ascending: false });

      if (statusFilter !== "all") query = applyStatusFilter(query, statusFilter);
      if (reviewerFilter !== "all") query = query.eq("reviewed_by", reviewerFilter);
      if (searchTerm) query = query.ilike("file_name", `%${searchTerm}%`);

      const { data: allAudits } = await query;
      if (!allAudits?.length) return;

      const headers = ["Interview ID", "Reviewer", "Status", "Review Date", "Duration", "Re-audit Count", "Artifacts to Correct", "Review Feedback", "Action Plan"];
      const rows = allAudits.map(a => [
        a.file_name,
        a.reviewed_by || "-",
        a.status === "Audit Passed" ? "Passed" : "Failed",
        a.reviewed_at ? format(new Date(a.reviewed_at), "PPp") : "-",
        formatDuration(a.review_duration_seconds),
        a.re_audit_count || 0,
        a.artifact_correction?.map(getArtifactLabel).join(", ") || "-",
        // Only include feedback for failed interviews
        a.status === "Audit Failed" ? (a.review_comment || "-") : "-",
        a.status === "Audit Failed" ? (a.action_plan || "-") : "-"
      ]);

      const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `review-history-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      let query = supabase
        .from("audits")
        .select("id, file_name, status, reviewed_at, reviewed_by, review_comment, action_plan, is_re_audit, re_audit_count, review_duration_seconds, artifact_correction")
        .not("reviewed_at", "is", null)
        .order("reviewed_at", { ascending: false });

      if (statusFilter !== "all") query = applyStatusFilter(query, statusFilter);
      if (reviewerFilter !== "all") query = query.eq("reviewed_by", reviewerFilter);
      if (searchTerm) query = query.ilike("file_name", `%${searchTerm}%`);

      const { data: allAudits } = await query;
      if (!allAudits?.length) return;

      const headers = ["Interview ID", "Reviewer", "Status", "Review Date", "Duration", "Re-audit Count", "Artifacts to Correct", "Review Feedback", "Action Plan"];
      const rows = allAudits.map(a => [
        a.file_name,
        a.reviewed_by || "-",
        a.status === "Audit Passed" ? "Passed" : "Failed",
        a.reviewed_at ? format(new Date(a.reviewed_at), "PPp") : "-",
        formatDuration(a.review_duration_seconds),
        a.re_audit_count || 0,
        a.artifact_correction?.map(getArtifactLabel).join(", ") || "-",
        // Only include feedback for failed interviews
        a.status === "Audit Failed" ? (a.review_comment || "-") : "-",
        a.status === "Audit Failed" ? (a.action_plan || "-") : "-"
      ]);

      const csv = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");
      const blob = new Blob([csv], { type: "application/vnd.ms-excel" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `review-history-${format(new Date(), "yyyy-MM-dd")}.xls`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  // Checklist feedback statements mapping
  const CHECKLIST_FEEDBACK_STATEMENTS: Record<number, string> = {
    1: "The interview failed because it was not recorded on the FSI Standard Interview Collection Form or an incorrect form was submitted. Please ensure the interview is properly documented using the approved FSI Standard Interview Collection Form and resubmit for review.",
    2: "The interview failed because the Authorization Form is incomplete, missing a signature and/or date, or a required witness signature is absent where \"X\" was used. Please obtain all required signatures and dates and resubmit the completed Authorization Form.",
    3: "The interview failed because the Field Manager Checklist was not fully completed and/or signed. Please ensure all required checklist items are checked and the form is properly signed before resubmission.",
    4: "The interview failed because the interviewee's name and/or age on the collection form header and Authorization Form do not match the information recorded in the mobile app. Please correct the discrepancies so all records are consistent and resubmit for review.",
    5: "The interview failed because the total number of names recorded on the form header does not match the total number of names written on the collection form or the Mobile App data. Please reconcile the counts and update the documentation accordingly.",
    6: "The interview failed because the earliest ancestor's name on the collection form does not match the information entered in the mobile app. Please review and correct the ancestor details so both records align.",
    7: "The interview failed because one or more individuals listed on the collection form are missing a unique RIN, relationship code, and/or gender, or the information is duplicated or incorrect. Please ensure all required identifiers are accurately completed for every individual.",
    8: "The interview failed because the dates and/or places of birth for the interviewee, spouse, or children are missing or incomplete. Please provide complete birth information for all required individuals and resubmit the interview.",
    9: "The interview failed because the folder name recorded on the collection form header does not match the interview date and/or interview ID. Please correct the folder naming to reflect the accurate interview details.",
    10: "The interview failed because the pages are not numbered correctly or are out of sequence. Please renumber the pages in the correct order and ensure the full document is complete before resubmission.",
    11: "The interview failed because one or more photos uploaded in the mobile app are unclear, incomplete, irrelevant, or improperly captured. Please retake and upload clear, complete, and relevant photos as required.",
    12: "The interview failed because the Authorization Form image is incomplete, unclear, or partially obscured, making it unreadable. Please upload a clear image showing the full Authorization Form.",
    13: "The interview failed because the audio recordings are unclear, incomplete, or inaudible, making it difficult to hear the Field Agent and/or interviewee. Please ensure all required audio recordings are clear and fully audible before resubmission.",
  };

  // Parse review_comment to extract failed question IDs and their additional comments
  const parseChecklistFeedback = (reviewComment: string): Array<{questionId: number; additionalComment?: string}> => {
    const failures: Array<{questionId: number; additionalComment?: string}> = [];
    
    // Match patterns like "- Q1:", "- Q2:", etc. and capture the comment if present
    const lines = reviewComment.split('\n');
    let currentQuestionId: number | null = null;
    
    for (const line of lines) {
      const questionMatch = line.match(/^-\s*Q(\d+):/);
      if (questionMatch) {
        // Save any previously found question
        if (currentQuestionId !== null) {
          failures.push({ questionId: currentQuestionId });
        }
        currentQuestionId = parseInt(questionMatch[1]);
      } else if (currentQuestionId !== null) {
        // Check for Comment line
        const commentMatch = line.match(/^\s*Comment:\s*(.+)/i);
        if (commentMatch && commentMatch[1].trim()) {
          failures.push({ questionId: currentQuestionId, additionalComment: commentMatch[1].trim() });
          currentQuestionId = null;
        }
      }
    }
    
    // Don't forget the last question if no comment followed
    if (currentQuestionId !== null) {
      failures.push({ questionId: currentQuestionId });
    }
    
    return failures;
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      // Fetch audits with metadata including interviewee details
      let query = supabase
        .from("audits")
        .select(`
          id, file_name, status, reviewed_at, reviewed_by, review_comment, action_plan, 
          is_re_audit, re_audit_count, review_duration_seconds, artifact_correction,
          interview_metadata(contractor_id, interviewee_name, total_names, interviewee_age, first_ancestor)
        `)
        .not("reviewed_at", "is", null)
        .order("file_name", { ascending: true });

      if (statusFilter !== "all") query = applyStatusFilter(query, statusFilter);
      if (reviewerFilter !== "all") query = query.eq("reviewed_by", reviewerFilter);
      if (searchTerm) query = query.ilike("file_name", `%${searchTerm}%`);

      const { data: allAudits } = await query;
      if (!allAudits?.length) return;

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      const maxLineWidth = pageWidth - margin * 2;
      let pageNum = 1;
      
      // Helper function to add header to each page
      const addPageHeader = (isFirstPage: boolean = false) => {
        // Draw header bar
        doc.setFillColor(31, 41, 55); // Dark gray/slate
        doc.rect(0, 0, pageWidth, isFirstPage ? 25 : 15, 'F');
        
        if (isFirstPage) {
          // Logo placeholder (circle with letters)
          doc.setFillColor(59, 130, 246); // Blue
          doc.circle(margin + 8, 12.5, 8, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("BAC", margin + 8, 14, { align: 'center' });
          
          // Title
          doc.setFontSize(16);
          doc.text("Backend Audit Center", margin + 22, 15);
        } else {
          // Smaller header for subsequent pages
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("Backend Audit Center - Review History Report", margin, 10);
          doc.text(`Page ${pageNum}`, pageWidth - margin, 10, { align: 'right' });
        }
        
        // Reset text color
        doc.setTextColor(0, 0, 0);
      };
      
      // Add first page header
      addPageHeader(true);
      
      // Get unique contractor IDs from audits
      const contractorIds = [...new Set(allAudits.map(a => {
        const metadata = a.interview_metadata;
        if (Array.isArray(metadata) && metadata.length > 0) {
          return metadata[0]?.contractor_id || 'Unknown';
        }
        return 'Unknown';
      }).filter(id => id !== 'Unknown'))];
      
      // Report subtitle and metadata
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Review History Report", margin, 35);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${format(new Date(), "PPp")}`, margin, 42);
      doc.text(`Total Records: ${allAudits.length}`, margin + 70, 42);
      if (contractorIds.length > 0) {
        doc.text(`Contractor(s): ${contractorIds.slice(0, 3).join(', ')}${contractorIds.length > 3 ? '...' : ''}`, margin + 130, 42);
      }

      let y = 52;
      doc.setFontSize(9);
      
      allAudits.forEach((a, i) => {
        // Get metadata info
        const metadata = Array.isArray(a.interview_metadata) && a.interview_metadata.length > 0 
          ? a.interview_metadata[0] 
          : null;
        const intervieweeName = metadata?.interviewee_name || 'Unknown';
        const totalNames = metadata?.total_names || 0;
        const intervieweeAge = metadata?.interviewee_age || '-';
        const firstAncestor = metadata?.first_ancestor || 'Unknown';
        
        // Parse feedback for failed audits
        let feedbackItems: Array<{questionId: number; additionalComment?: string}> = [];
        if (a.status === "Audit Failed" && a.review_comment) {
          feedbackItems = parseChecklistFeedback(a.review_comment);
        }
        
        // Calculate space needed for this entry
        let entryHeight = 22; // Base height for title + status + date + metadata line
        if (a.artifact_correction?.length) entryHeight += 4;
        
        // Calculate feedback space
        feedbackItems.forEach(item => {
          const statement = CHECKLIST_FEEDBACK_STATEMENTS[item.questionId] || '';
          const statementLines = doc.splitTextToSize(statement, maxLineWidth);
          entryHeight += statementLines.length * 3.5 + 2;
          if (item.additionalComment) {
            const commentLines = doc.splitTextToSize(`Additional Comment: ${item.additionalComment}`, maxLineWidth);
            entryHeight += commentLines.length * 3.5;
          }
        });
        
        // Action plan space
        if (a.status === "Audit Failed" && a.action_plan && a.action_plan.trim()) {
          const actionPlanLines = doc.splitTextToSize(`Action Plan: ${a.action_plan}`, maxLineWidth);
          entryHeight += actionPlanLines.length * 3.5 + 2;
        }
        
        // Check if we need a new page before starting entry
        if (y + entryHeight > 285) {
          doc.addPage();
          pageNum++;
          addPageHeader(false);
          y = 22;
        }
        
        // Render entry
        doc.setFont("helvetica", "bold");
        doc.text(`${i + 1}. ${a.file_name}`, margin, y);
        doc.setFont("helvetica", "normal");
        y += 4.5;
        
        doc.text(`Status: ${a.status === "Audit Passed" ? "Passed" : "Failed"} | Reviewer: ${a.reviewed_by || "-"} | Duration: ${formatDuration(a.review_duration_seconds)}`, margin, y);
        y += 4.5;
        
        doc.text(`Date: ${a.reviewed_at ? format(new Date(a.reviewed_at), "PPp") : "-"}`, margin, y);
        y += 4.5;
        
        // Add interviewee metadata
        doc.text(`Interviewee: ${intervieweeName} | Age: ${intervieweeAge} | Total Names: ${totalNames} | First Ancestor: ${firstAncestor}`, margin, y);
        y += 4.5;
        
        if (a.artifact_correction?.length) {
          doc.text(`Artifacts: ${a.artifact_correction.map(getArtifactLabel).join(", ")}`, margin, y);
          y += 4;
        }
        
        // Render feedback statements for failed audits
        if (feedbackItems.length > 0) {
          y += 2;
          doc.setFont("helvetica", "bold");
          doc.text("Feedback:", margin, y);
          doc.setFont("helvetica", "normal");
          y += 4;
          
          feedbackItems.forEach((item) => {
            const statement = CHECKLIST_FEEDBACK_STATEMENTS[item.questionId];
            if (statement) {
              const statementLines = doc.splitTextToSize(statement, maxLineWidth);
              statementLines.forEach((line: string) => {
                if (y > 285) {
                  doc.addPage();
                  pageNum++;
                  addPageHeader(false);
                  y = 22;
                }
                doc.text(line, margin, y);
                y += 3.5;
              });
              
              // Add additional comment if present (in red)
              if (item.additionalComment) {
                const commentLines = doc.splitTextToSize(`Additional Comment: ${item.additionalComment}`, maxLineWidth);
                commentLines.forEach((line: string) => {
                  if (y > 285) {
                    doc.addPage();
                    pageNum++;
                    addPageHeader(false);
                    y = 22;
                  }
                  doc.setFont("helvetica", "italic");
                  doc.setTextColor(220, 38, 38); // Red color
                  doc.text(line, margin, y);
                  doc.setTextColor(0, 0, 0); // Reset to black
                  doc.setFont("helvetica", "normal");
                  y += 3.5;
                });
              }
              
              y += 2; // Space between feedback items
            }
          });
        }
        
        // Render action plan if present
        if (a.status === "Audit Failed" && a.action_plan && a.action_plan.trim()) {
          y += 2;
          const actionPlanLines = doc.splitTextToSize(`Action Plan: ${a.action_plan}`, maxLineWidth);
          actionPlanLines.forEach((line: string) => {
            if (y > 285) {
              doc.addPage();
              pageNum++;
              addPageHeader(false);
              y = 22;
            }
            doc.text(line, margin, y);
            y += 3.5;
          });
        }
        
        y += 4; // Space between entries
      });

      doc.save(`review-history-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  // Bulk PDF download for filtered results
  const downloadFilteredPDFs = async () => {
    setIsDownloadingPDFs(true);
    try {
      let query = supabase
        .from("audits")
        .select("file_name, file_url")
        .not("reviewed_at", "is", null)
        .not("file_url", "is", null);

      if (statusFilter !== "all") query = applyStatusFilter(query, statusFilter);
      if (reviewerFilter !== "all") query = query.eq("reviewed_by", reviewerFilter);
      if (searchTerm) query = query.ilike("file_name", `%${searchTerm}%`);

      const { data: audits, error } = await query;
      if (error) throw error;
      if (!audits?.length) return;

      const zip = new JSZip();
      let downloadedCount = 0;

      for (const audit of audits) {
        if (!audit.file_url) continue;
        try {
          const response = await fetch(audit.file_url);
          if (response.ok) {
            const blob = await response.blob();
            zip.file(`${audit.file_name}.pdf`, blob);
            downloadedCount++;
          }
        } catch {
          console.warn(`Failed to download PDF for ${audit.file_name}`);
        }
      }

      if (downloadedCount === 0) return;

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pdfs-${statusFilter}-${format(new Date(), "yyyy-MM-dd")}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloadingPDFs(false);
    }
  };

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
    <>
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <History className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">All Review History</h1>
          <p className="text-sm text-muted-foreground">
            Complete audit review history across all reviewers
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Reviews</p>
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{(stats?.totalNames || 0).toLocaleString()} names</span>
                </div>
              </div>
              <History className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Passed</p>
                <p className="text-2xl font-bold text-green-600">{stats?.passed || 0}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{(stats?.passedNames || 0).toLocaleString()} names</span>
                </div>
              </div>
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">{stats?.failed || 0}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{(stats?.failedNames || 0).toLocaleString()} names</span>
                </div>
              </div>
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">{stats?.monthly || 0}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{(stats?.monthlyNames || 0).toLocaleString()} names</span>
                </div>
              </div>
              <Calendar className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        {data?.totalCount !== undefined && (
          <Badge variant="secondary" className="px-3 py-1.5 text-sm font-medium">
            {data.totalCount.toLocaleString()} {data.totalCount === 1 ? "result" : "results"}
          </Badge>
        )}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by interview ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Audit Passed">Passed</SelectItem>
            <SelectItem value="Audit Failed">Failed</SelectItem>
            <SelectItem value="failed_pdf">Failed - PDF Issue</SelectItem>
            <SelectItem value="failed_metadata">Failed - Metadata Issue</SelectItem>
            <SelectItem value="failed_both">Failed - Both Issues</SelectItem>
            <SelectItem value="failed_resolved">Failed - Resolved</SelectItem>
            <SelectItem value="failed_unresolved">Failed - Unresolved</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={reviewerFilter}
          onValueChange={(value) => {
            setReviewerFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Reviewer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reviewers</SelectItem>
            {reviewers?.map((reviewer) => (
              <SelectItem key={reviewer} value={reviewer}>
                {reviewer}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {hasActiveFilters && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={clearAllFilters}
            className="text-muted-foreground gap-1"
          >
            <X className="h-4 w-4" />
            Clear Filters
          </Button>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={isExporting} className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={exportToCSV}>Export as CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={exportToExcel}>Export as Excel</DropdownMenuItem>
            <DropdownMenuItem onClick={exportToPDF}>Export as PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* Bulk PDF Download Button - visible when filter is active */}
        {statusFilter !== "all" && (
          <Button 
            variant="outline" 
            onClick={downloadFilteredPDFs} 
            disabled={isDownloadingPDFs}
            className="gap-2"
          >
            {isDownloadingPDFs ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileArchive className="h-4 w-4" />
            )}
            {isDownloadingPDFs ? "Downloading..." : "Download PDFs"}
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {data?.audits.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No reviews found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">SN</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("file_name")}
                    >
                      <div className="flex items-center">
                        Interview ID
                        {getSortIcon("file_name")}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("reviewed_by")}
                    >
                      <div className="flex items-center">
                        Reviewer
                        {getSortIcon("reviewed_by")}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("status")}
                    >
                      <div className="flex items-center">
                        Status
                        {getSortIcon("status")}
                      </div>
                    </TableHead>
                    <TableHead>Assignment</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("reviewed_at")}
                    >
                      <div className="flex items-center">
                        Review Date
                        {getSortIcon("reviewed_at")}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("review_duration_seconds")}
                    >
                      <div className="flex items-center">
                        Duration
                        {getSortIcon("review_duration_seconds")}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("re_audit_count")}
                    >
                      <div className="flex items-center">
                        Re-audit
                        {getSortIcon("re_audit_count")}
                      </div>
                    </TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {data?.audits.map((audit, index) => (
                    <TableRow
                      key={audit.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => window.open(`/review/${audit.id}`, '_blank')}
                    >
                      <TableCell className="font-medium">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </TableCell>
                      <TableCell className="font-medium font-mono text-sm">
                        {audit.file_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {audit.reviewed_by || "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={audit.status === "Audit Passed" ? "default" : "destructive"}>
                            {audit.status === "Audit Passed" ? "Passed" : "Failed"}
                          </Badge>
                          
                          {audit.status === "Audit Failed" && (() => {
                            const indicator = getArtifactIndicator(audit.artifact_correction);
                            if (!indicator) return null;
                            
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span 
                                      className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-orange-100 text-orange-700 border border-orange-300 cursor-help"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {indicator.letter}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent 
                                    side="top" 
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <p className="text-xs">{indicator.label}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })()}

                          {/* Resolved indicator */}
                          {audit.artifact_correction_resolved_at && (
                            <Badge 
                              variant="outline" 
                              className="text-[10px] px-1.5 py-0 h-5 bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAudit(audit);
                                setShowResolvedCommentsModal(true);
                              }}
                            >
                              <CheckCircle className="h-3 w-3 mr-0.5" />
                              Resolved
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getAssignmentBadge(audit) || <span className="text-muted-foreground text-sm">-</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {audit.reviewed_at && format(new Date(audit.reviewed_at), "PPp")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDuration(audit.review_duration_seconds)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {audit.is_re_audit ? (
                          <Badge variant="outline" className="text-xs">
                            #{audit.re_audit_count}
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <AuditPagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={data?.totalCount || 0}
        itemsPerPage={itemsPerPage}
        onPageChange={handlePageChange}
        onItemsPerPageChange={handleItemsPerPageChange}
      />
    </div>

      {/* Mark Resolved Dialog */}
      {selectedAudit && (
        <MarkResolvedDialog
          open={showMarkResolvedDialog}
          onOpenChange={(open) => {
            setShowMarkResolvedDialog(open);
            if (!open) queryClient.invalidateQueries({ queryKey: ["admin-review-history"] });
          }}
          auditId={selectedAudit.id}
          fileName={selectedAudit.file_name}
        />
      )}

      {/* Resolved Comments Modal */}
      {selectedAudit && (
        <ResolvedCommentsModal
          open={showResolvedCommentsModal}
          onOpenChange={setShowResolvedCommentsModal}
          auditId={selectedAudit.id}
          fileName={selectedAudit.file_name}
          resolvedAt={selectedAudit.artifact_correction_resolved_at}
          resolvedBy={selectedAudit.artifact_correction_resolved_by}
        />
      )}
    </>
  );
};

export default AdminReviewHistory;
