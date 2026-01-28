import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  Trash2,
  FileArchive,
  Loader2,
  RefreshCw,
  Filter,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { AuditPagination } from "@/components/AuditPagination";
import { OfflineTablePlaceholder } from "@/components/OfflineTablePlaceholder";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

interface ZipDiagnosticResult {
  id: string;
  file_name: string;
  mobile_zip_url: string;
  mobile_zip_uploaded_at: string | null;
  has_metadata: boolean;
  has_photos: boolean;
  photo_count: number;
  status: "valid" | "corrupted" | "missing_data";
}

type SortField = "file_name" | "mobile_zip_uploaded_at" | "status" | "photo_count";
type SortOrder = "asc" | "desc";

const ZipDiagnostics = () => {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [selectedAudit, setSelectedAudit] = useState<ZipDiagnosticResult | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Bulk selection state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [metadataFilter, setMetadataFilter] = useState<string>("");
  const [photosFilter, setPhotosFilter] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Sort state
  const [sortField, setSortField] = useState<SortField>("mobile_zip_uploaded_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Scan all audits with ZIP files
  const {
    data: diagnosticResults = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["zip-diagnostics"],
    queryFn: async () => {
      // Get all audits with ZIP files
      const { data: audits, error: auditsError } = await supabase
        .from("audits")
        .select("id, file_name, mobile_zip_url, mobile_zip_uploaded_at")
        .not("mobile_zip_url", "is", null)
        .order("mobile_zip_uploaded_at", { ascending: false });

      if (auditsError) throw auditsError;
      if (!audits || audits.length === 0) return [];

      const auditIds = audits.map((a) => a.id);

      // Get metadata for these audits
      const { data: metadata } = await supabase.from("interview_metadata").select("audit_id").in("audit_id", auditIds);

      // Get photo counts
      const { data: photos } = await supabase.from("interview_photos").select("audit_id").in("audit_id", auditIds);

      const metadataSet = new Set(metadata?.map((m) => m.audit_id) || []);
      const photoCountMap = new Map<string, number>();
      photos?.forEach((p) => {
        const count = photoCountMap.get(p.audit_id) || 0;
        photoCountMap.set(p.audit_id, count + 1);
      });

      // Analyze each audit
      const results: ZipDiagnosticResult[] = audits.map((audit) => {
        const hasMetadata = metadataSet.has(audit.id);
        const photoCount = photoCountMap.get(audit.id) || 0;
        const hasPhotos = photoCount > 0;

        // Determine status
        // A ZIP is valid if metadata was extracted (photos are optional)
        // Corrupted means nothing was extracted at all
        // Missing data means has photos but no metadata (rare edge case)
        let status: "valid" | "corrupted" | "missing_data";
        if (hasMetadata) {
          // If we have metadata, the ZIP was parsed successfully
          // Photos are optional - their absence doesn't mean corruption
          status = "valid";
        } else if (!hasMetadata && !hasPhotos) {
          // Nothing was extracted - ZIP processing failed
          status = "corrupted";
        } else {
          // Edge case: has photos but no metadata
          status = "missing_data";
        }

        return {
          id: audit.id,
          file_name: audit.file_name,
          mobile_zip_url: audit.mobile_zip_url,
          mobile_zip_uploaded_at: audit.mobile_zip_uploaded_at,
          has_metadata: hasMetadata,
          has_photos: hasPhotos,
          photo_count: photoCount,
          status,
        };
      });

      return results;
    },
  });

  // Filter and sort logic
  const filteredResults = useMemo(() => {
    return diagnosticResults.filter((result) => {
      // Search filter
      if (searchQuery && !result.file_name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Status filter
      if (statusFilter && result.status !== statusFilter) return false;
      // Metadata filter
      if (metadataFilter === "with" && !result.has_metadata) return false;
      if (metadataFilter === "without" && result.has_metadata) return false;
      // Photos filter
      if (photosFilter === "with" && !result.has_photos) return false;
      if (photosFilter === "without" && result.has_photos) return false;
      // Date range
      if (startDate && result.mobile_zip_uploaded_at) {
        const uploadDate = result.mobile_zip_uploaded_at.split("T")[0];
        if (uploadDate < startDate) return false;
      }
      if (endDate && result.mobile_zip_uploaded_at) {
        const uploadDate = result.mobile_zip_uploaded_at.split("T")[0];
        if (uploadDate > endDate) return false;
      }
      return true;
    });
  }, [diagnosticResults, searchQuery, statusFilter, metadataFilter, photosFilter, startDate, endDate]);

  const sortedResults = useMemo(() => {
    return [...filteredResults].sort((a, b) => {
      let aVal: string | number | null = a[sortField];
      let bVal: string | number | null = b[sortField];

      if (aVal === null) aVal = "";
      if (bVal === null) bVal = "";

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortOrder === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
  }, [filteredResults, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("");
    setMetadataFilter("");
    setPhotosFilter("");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const hasActiveFilters = searchQuery || statusFilter || metadataFilter || photosFilter || startDate || endDate;

  // Delete corrupted ZIP mutation
  const deleteZipMutation = useMutation({
    mutationFn: async (audit: ZipDiagnosticResult) => {
      // Delete photos if any
      if (audit.has_photos) {
        const { data: photos } = await supabase
          .from("interview_photos")
          .select("storage_path")
          .eq("audit_id", audit.id);

        if (photos && photos.length > 0) {
          const paths = photos.map((p) => p.storage_path);
          await supabase.storage.from("interview-photos").remove(paths);
          await supabase.from("interview_photos").delete().eq("audit_id", audit.id);
        }
      }

      // Delete metadata if any
      if (audit.has_metadata) {
        await supabase.from("interview_metadata").delete().eq("audit_id", audit.id);
      }

      // Delete ZIP from storage
      const zipPath = audit.mobile_zip_url.split("/mobile-zips/")[1];
      if (zipPath) {
        await supabase.storage.from("mobile-zips").remove([decodeURIComponent(zipPath)]);
      }

      // Clear ZIP URL from audit
      const { error } = await supabase
        .from("audits")
        .update({ mobile_zip_url: null, mobile_zip_uploaded_at: null })
        .eq("id", audit.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Corrupted ZIP file deleted successfully");
      setShowDeleteDialog(false);
      setSelectedAudit(null);
      queryClient.invalidateQueries({ queryKey: ["zip-diagnostics"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete ZIP file");
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (items: ZipDiagnosticResult[]) => {
      for (const item of items) {
        // Delete photos if any
        if (item.has_photos) {
          const { data: photos } = await supabase
            .from("interview_photos")
            .select("storage_path")
            .eq("audit_id", item.id);

          if (photos && photos.length > 0) {
            const paths = photos.map((p) => p.storage_path);
            await supabase.storage.from("interview-photos").remove(paths);
            await supabase.from("interview_photos").delete().eq("audit_id", item.id);
          }
        }

        // Delete metadata if any
        if (item.has_metadata) {
          await supabase.from("interview_metadata").delete().eq("audit_id", item.id);
        }

        // Delete ZIP from storage
        const zipPath = item.mobile_zip_url.split("/mobile-zips/")[1];
        if (zipPath) {
          await supabase.storage.from("mobile-zips").remove([decodeURIComponent(zipPath)]);
        }

        // Clear ZIP URL from audit
        await supabase.from("audits").update({ mobile_zip_url: null, mobile_zip_uploaded_at: null }).eq("id", item.id);
      }
    },
    onSuccess: () => {
      toast.success(`Deleted ${selectedItems.size} corrupted files`);
      setShowBulkDeleteDialog(false);
      setSelectedItems(new Set());
      queryClient.invalidateQueries({ queryKey: ["zip-diagnostics"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete files");
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "valid":
        return <Badge className="bg-green-100 text-green-700">Valid</Badge>;
      case "corrupted":
        return <Badge className="bg-red-100 text-red-700">Corrupted</Badge>;
      case "missing_data":
        return <Badge className="bg-yellow-100 text-yellow-700">Missing Data</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const corruptedCount = diagnosticResults.filter((r) => r.status === "corrupted").length;
  const missingDataCount = diagnosticResults.filter((r) => r.status === "missing_data").length;
  const validCount = diagnosticResults.filter((r) => r.status === "valid").length;

  // Pagination using sorted/filtered results
  const totalPages = Math.ceil(sortedResults.length / itemsPerPage);
  const paginatedResults = sortedResults.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Bulk selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const selectableItems = paginatedResults.filter((r) => r.status !== "valid").map((r) => r.id);
      setSelectedItems(new Set(selectableItems));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedItems(newSelected);
  };

  const selectableInPage = paginatedResults.filter((r) => r.status !== "valid");
  const allSelectableSelected = selectableInPage.length > 0 && selectableInPage.every((r) => selectedItems.has(r.id));

  const handleBulkDelete = () => {
    const itemsToDelete = diagnosticResults.filter((r) => selectedItems.has(r.id));
    bulkDeleteMutation.mutate(itemsToDelete);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedItems(new Set()); // Clear selection when changing pages
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
    setSelectedItems(new Set());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">ZIP File Diagnostics</h1>
            <p className="text-muted-foreground mt-1">Scan and identify corrupted ZIP files that need re-uploading</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1">
                  Active
                </Badge>
              )}
            </Button>
            <Button onClick={() => refetch()} disabled={isLoading} className="gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh Scan
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileArchive className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total ZIPs</p>
                <p className="text-2xl font-bold">{diagnosticResults.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valid</p>
                <p className="text-2xl font-bold">{validCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Corrupted</p>
                <p className="text-2xl font-bold">{corruptedCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Missing Data</p>
                <p className="text-2xl font-bold">{missingDataCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Filters</CardTitle>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-4 w-4" />
                Clear All
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {/* Search */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Search</Label>
                  <Input
                    placeholder="Interview ID..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                {/* Status */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Status</Label>
                  <Select
                    value={statusFilter || "all"}
                    onValueChange={(v) => {
                      setStatusFilter(v === "all" ? "" : v);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="corrupted">Corrupted</SelectItem>
                      <SelectItem value="missing_data">Missing Data</SelectItem>
                      <SelectItem value="valid">Valid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Metadata */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Metadata</Label>
                  <Select
                    value={metadataFilter || "all"}
                    onValueChange={(v) => {
                      setMetadataFilter(v === "all" ? "" : v);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="with">Has Metadata</SelectItem>
                      <SelectItem value="without">No Metadata</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Photos */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Photos</Label>
                  <Select
                    value={photosFilter || "all"}
                    onValueChange={(v) => {
                      setPhotosFilter(v === "all" ? "" : v);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="with">Has Photos</SelectItem>
                      <SelectItem value="without">No Photos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Date Range */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bulk Actions Bar */}
        {selectedItems.size > 0 && (
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
            <span className="text-sm font-medium">{selectedItems.size} item(s) selected</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedItems(new Set())}>
                Clear Selection
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setShowBulkDeleteDialog(true)} className="gap-2">
                <Trash2 className="h-4 w-4" />
                Delete Selected
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Diagnostic Results</CardTitle>
            <CardDescription>
              {hasActiveFilters
                ? `Showing ${sortedResults.length} of ${diagnosticResults.length} ZIPs (filtered)`
                : `ZIPs marked as "Corrupted" have no extracted data and should be re-uploaded. "Missing Data" may have partial extraction issues.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isOnline ? (
              <OfflineTablePlaceholder />
            ) : isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : sortedResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileArchive className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">
                  {hasActiveFilters ? "No results match filters" : "No ZIP files found"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {hasActiveFilters ? "Try adjusting your filter criteria" : "No interviews have ZIP files uploaded"}
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters} className="mt-4">
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={allSelectableSelected}
                            onCheckedChange={handleSelectAll}
                            aria-label="Select all"
                            disabled={selectableInPage.length === 0}
                          />
                        </TableHead>
                        <TableHead className="w-12">SN</TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("file_name")}>
                          <div className="flex items-center gap-1">
                            Interview ID
                            {getSortIcon("file_name")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleSort("mobile_zip_uploaded_at")}
                        >
                          <div className="flex items-center gap-1">
                            Uploaded At
                            {getSortIcon("mobile_zip_uploaded_at")}
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("status")}>
                          <div className="flex items-center gap-1">
                            Status
                            {getSortIcon("status")}
                          </div>
                        </TableHead>
                        <TableHead>Has Metadata</TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleSort("photo_count")}
                        >
                          <div className="flex items-center gap-1">
                            Photos
                            {getSortIcon("photo_count")}
                          </div>
                        </TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedResults.map((result, index) => (
                        <TableRow
                          key={result.id}
                          className={result.status === "corrupted" ? "bg-red-50 dark:bg-red-950/20" : ""}
                        >
                          <TableCell>
                            {result.status !== "valid" && (
                              <Checkbox
                                checked={selectedItems.has(result.id)}
                                onCheckedChange={(checked) => handleSelectItem(result.id, checked as boolean)}
                                aria-label={`Select ${result.file_name}`}
                              />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                          <TableCell className="font-medium">{result.file_name}</TableCell>
                          <TableCell>
                            {result.mobile_zip_uploaded_at
                              ? format(new Date(result.mobile_zip_uploaded_at), "PPp")
                              : "-"}
                          </TableCell>
                          <TableCell>{getStatusBadge(result.status)}</TableCell>
                          <TableCell>
                            {result.has_metadata ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                            )}
                          </TableCell>
                          <TableCell>
                            {result.has_photos ? (
                              <span className="text-green-600">{result.photo_count}</span>
                            ) : (
                              <span className="text-red-600">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {result.status !== "valid" && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setSelectedAudit(result);
                                  setShowDeleteDialog(true);
                                }}
                                disabled={deleteZipMutation.isPending}
                                className="gap-1"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="mt-4">
                  <AuditPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalCount={sortedResults.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={handlePageChange}
                    onItemsPerPageChange={handleItemsPerPageChange}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Single Delete Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Corrupted ZIP?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the corrupted ZIP file for <strong>{selectedAudit?.file_name}</strong> along with any
                partial data. The interview record will remain but you'll need to re-upload the mobile data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedAudit && deleteZipMutation.mutate(selectedAudit)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteZipMutation.isPending}
              >
                {deleteZipMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Dialog */}
        <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedItems.size} Corrupted ZIPs?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the selected corrupted ZIP files and their partial data. Interview records will remain
                but mobile data will need to be re-uploaded.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={bulkDeleteMutation.isPending}
              >
                {bulkDeleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Delete {selectedItems.size} Files
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default ZipDiagnostics;
