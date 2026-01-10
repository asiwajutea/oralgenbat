import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  AlertTriangle,
  CheckCircle2,
  Trash2,
  FileArchive,
  Loader2,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const ZipDiagnostics = () => {
  const queryClient = useQueryClient();
  const [selectedAudit, setSelectedAudit] = useState<ZipDiagnosticResult | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  // Bulk selection state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Scan all audits with ZIP files
  const { data: diagnosticResults = [], isLoading, refetch } = useQuery({
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
      
      const auditIds = audits.map(a => a.id);
      
      // Get metadata for these audits
      const { data: metadata } = await supabase
        .from("interview_metadata")
        .select("audit_id")
        .in("audit_id", auditIds);
      
      // Get photo counts
      const { data: photos } = await supabase
        .from("interview_photos")
        .select("audit_id")
        .in("audit_id", auditIds);
      
      const metadataSet = new Set(metadata?.map(m => m.audit_id) || []);
      const photoCountMap = new Map<string, number>();
      photos?.forEach(p => {
        const count = photoCountMap.get(p.audit_id) || 0;
        photoCountMap.set(p.audit_id, count + 1);
      });
      
      // Analyze each audit
      const results: ZipDiagnosticResult[] = audits.map(audit => {
        const hasMetadata = metadataSet.has(audit.id);
        const photoCount = photoCountMap.get(audit.id) || 0;
        const hasPhotos = photoCount > 0;
        
        // Determine status
        let status: "valid" | "corrupted" | "missing_data";
        if (hasMetadata && hasPhotos) {
          status = "valid";
        } else if (!hasMetadata && !hasPhotos) {
          status = "corrupted"; // ZIP was uploaded but nothing was extracted
        } else {
          status = "missing_data"; // Partial data
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
          const paths = photos.map(p => p.storage_path);
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
            const paths = photos.map(p => p.storage_path);
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
        await supabase
          .from("audits")
          .update({ mobile_zip_url: null, mobile_zip_uploaded_at: null })
          .eq("id", item.id);
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

  const corruptedCount = diagnosticResults.filter(r => r.status === "corrupted").length;
  const missingDataCount = diagnosticResults.filter(r => r.status === "missing_data").length;
  const validCount = diagnosticResults.filter(r => r.status === "valid").length;

  // Pagination
  const totalPages = Math.ceil(diagnosticResults.length / itemsPerPage);
  const paginatedResults = diagnosticResults.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Bulk selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const selectableItems = paginatedResults.filter(r => r.status !== "valid").map(r => r.id);
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

  const selectableInPage = paginatedResults.filter(r => r.status !== "valid");
  const allSelectableSelected = selectableInPage.length > 0 && selectableInPage.every(r => selectedItems.has(r.id));
  const someSelected = selectableInPage.some(r => selectedItems.has(r.id));

  const handleBulkDelete = () => {
    const itemsToDelete = diagnosticResults.filter(r => selectedItems.has(r.id));
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">ZIP File Diagnostics</h1>
            <p className="text-muted-foreground mt-1">
              Scan and identify corrupted ZIP files that need re-uploading
            </p>
          </div>
          <Button onClick={() => refetch()} disabled={isLoading} className="gap-2">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh Scan
          </Button>
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

        {/* Bulk Actions Bar */}
        {selectedItems.size > 0 && (
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
            <span className="text-sm font-medium">{selectedItems.size} item(s) selected</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedItems(new Set())}
              >
                Clear Selection
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDeleteDialog(true)}
                className="gap-2"
              >
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
              ZIPs marked as "Corrupted" have no extracted data and should be re-uploaded. "Missing Data" may have partial extraction issues.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : diagnosticResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileArchive className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No ZIP files found</p>
                <p className="text-sm text-muted-foreground">
                  No interviews have ZIP files uploaded
                </p>
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
                        <TableHead>Interview ID</TableHead>
                        <TableHead>Uploaded At</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Has Metadata</TableHead>
                        <TableHead>Photos</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedResults.map((result, index) => (
                        <TableRow key={result.id} className={result.status === "corrupted" ? "bg-red-50 dark:bg-red-950/20" : ""}>
                          <TableCell>
                            {result.status !== "valid" && (
                              <Checkbox
                                checked={selectedItems.has(result.id)}
                                onCheckedChange={(checked) => handleSelectItem(result.id, checked as boolean)}
                                aria-label={`Select ${result.file_name}`}
                              />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {(currentPage - 1) * itemsPerPage + index + 1}
                          </TableCell>
                          <TableCell className="font-medium">{result.file_name}</TableCell>
                          <TableCell>
                            {result.mobile_zip_uploaded_at 
                              ? format(new Date(result.mobile_zip_uploaded_at), "PPp")
                              : "-"
                            }
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
                                className="gap-1"
                              >
                                <Trash2 className="h-3 w-3" />
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
                <AuditPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalCount={diagnosticResults.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={handlePageChange}
                  onItemsPerPageChange={handleItemsPerPageChange}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Single Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Corrupted ZIP File?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the ZIP file for "{selectedAudit?.file_name}" and all associated data (photos, metadata). The interview will need a fresh ZIP upload.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedAudit && deleteZipMutation.mutate(selectedAudit)}
              disabled={deleteZipMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteZipMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete ZIP
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedItems.size} ZIP File(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete {selectedItems.size} corrupted/problematic ZIP file(s) and all their associated data (photos, metadata). These interviews will need fresh ZIP uploads.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete {selectedItems.size} Files
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ZipDiagnostics;