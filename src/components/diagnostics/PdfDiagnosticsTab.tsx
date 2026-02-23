import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface PdfDiagnosticResult {
  id: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
  status: "healthy" | "corrupt" | "missing";
  file_size: number | null;
  content_type: string | null;
}

const PdfDiagnosticsTab = () => {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState<PdfDiagnosticResult | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  const {
    data: results = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["pdf-diagnostics"],
    queryFn: async () => {
      const { data: audits, error } = await supabase
        .from("audits")
        .select("id, file_name, file_url, uploaded_at")
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      if (!audits || audits.length === 0) return [];

      // Check each PDF URL with HEAD requests in batches
      const BATCH_SIZE = 20;
      const diagnosticResults: PdfDiagnosticResult[] = [];

      for (let i = 0; i < audits.length; i += BATCH_SIZE) {
        const batch = audits.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (audit) => {
            try {
              const response = await fetch(audit.file_url, { method: "HEAD" });
              if (!response.ok) {
                return {
                  ...audit,
                  status: "missing" as const,
                  file_size: null,
                  content_type: null,
                };
              }
              const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
              const contentType = response.headers.get("content-type");
              const isCorrupt =
                contentLength < 1024 ||
                (contentType && !contentType.includes("pdf") && !contentType.includes("octet-stream"));

              return {
                ...audit,
                status: isCorrupt ? ("corrupt" as const) : ("healthy" as const),
                file_size: contentLength,
                content_type: contentType,
              };
            } catch {
              return {
                ...audit,
                status: "missing" as const,
                file_size: null,
                content_type: null,
              };
            }
          })
        );
        diagnosticResults.push(...batchResults);
      }

      return diagnosticResults;
    },
  });

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (searchQuery && !r.file_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });
  }, [results, searchQuery, statusFilter]);

  const healthyCount = results.filter((r) => r.status === "healthy").length;
  const corruptCount = results.filter((r) => r.status === "corrupt").length;
  const missingCount = results.filter((r) => r.status === "missing").length;

  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
  const paginatedResults = filteredResults.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const deleteMutation = useMutation({
    mutationFn: async (auditId: string) => {
      // Get the file path from URL
      const audit = results.find((r) => r.id === auditId);
      if (audit) {
        const pdfPath = audit.file_url.split("/audit-pdfs/")[1];
        if (pdfPath) {
          await supabase.storage.from("audit-pdfs").remove([decodeURIComponent(pdfPath)]);
        }
      }
      // Clear the file_url (set to empty placeholder)
      const { error } = await supabase
        .from("audits")
        .update({ file_url: "" })
        .eq("id", auditId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Corrupt PDF deleted");
      setShowDeleteDialog(false);
      setSelectedAudit(null);
      queryClient.invalidateQueries({ queryKey: ["pdf-diagnostics"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        const audit = results.find((r) => r.id === id);
        if (audit) {
          const pdfPath = audit.file_url.split("/audit-pdfs/")[1];
          if (pdfPath) {
            await supabase.storage.from("audit-pdfs").remove([decodeURIComponent(pdfPath)]);
          }
        }
        await supabase.from("audits").update({ file_url: "" }).eq("id", id);
      }
    },
    onSuccess: () => {
      toast.success(`Deleted ${selectedItems.size} corrupt PDFs`);
      setShowBulkDeleteDialog(false);
      setSelectedItems(new Set());
      queryClient.invalidateQueries({ queryKey: ["pdf-diagnostics"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleReplace = async (auditId: string, file: File) => {
    setReplacingId(auditId);
    try {
      const filePath = `${auditId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("audit-pdfs")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("audit-pdfs").getPublicUrl(filePath);

      const { error } = await supabase
        .from("audits")
        .update({ file_url: publicUrl })
        .eq("id", auditId);
      if (error) throw error;

      toast.success("PDF replaced successfully");
      queryClient.invalidateQueries({ queryKey: ["pdf-diagnostics"] });
    } catch (err: any) {
      toast.error("Failed to replace PDF: " + err.message);
    } finally {
      setReplacingId(null);
    }
  };

  const selectableInPage = paginatedResults.filter((r) => r.status !== "healthy");
  const allSelectableSelected = selectableInPage.length > 0 && selectableInPage.every((r) => selectedItems.has(r.id));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy":
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">Healthy</Badge>;
      case "corrupt":
        return <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">Corrupt</Badge>;
      case "missing":
        return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">Missing</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const formatSize = (bytes: number | null) => {
    if (bytes === null) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total PDFs</p>
              <p className="text-2xl font-bold">{results.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Healthy</p>
              <p className="text-2xl font-bold">{healthyCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-950 rounded-lg">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Corrupt</p>
              <p className="text-2xl font-bold">{corruptCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-950 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Missing</p>
              <p className="text-2xl font-bold">{missingCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <Label className="text-sm">Search</Label>
          <Input
            placeholder="Search interview..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <div className="space-y-1.5 w-[180px]">
          <Label className="text-sm">Status</Label>
          <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setCurrentPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="corrupt">Corrupt</SelectItem>
              <SelectItem value="missing">Missing</SelectItem>
              <SelectItem value="healthy">Healthy</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => refetch()} disabled={isLoading} className="gap-2">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Rescan
        </Button>
      </div>

      {/* Bulk actions */}
      {selectedItems.size > 0 && (
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
          <span className="text-sm font-medium">{selectedItems.size} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedItems(new Set())}>Clear</Button>
            <Button variant="destructive" size="sm" onClick={() => setShowBulkDeleteDialog(true)} className="gap-2">
              <Trash2 className="h-4 w-4" /> Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>PDF Diagnostic Results</CardTitle>
          <CardDescription>
            PDFs under 1KB or with wrong content type are flagged as corrupt. Missing means the file URL returned a 404.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isOnline ? (
            <OfflineTablePlaceholder />
          ) : isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No PDFs found</p>
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
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedItems(new Set(selectableInPage.map((r) => r.id)));
                            } else {
                              setSelectedItems(new Set());
                            }
                          }}
                          disabled={selectableInPage.length === 0}
                        />
                      </TableHead>
                      <TableHead className="w-12">SN</TableHead>
                      <TableHead>Interview ID</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedResults.map((result, index) => (
                      <TableRow
                        key={result.id}
                        className={result.status === "corrupt" ? "bg-red-50 dark:bg-red-950/20" : result.status === "missing" ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
                      >
                        <TableCell>
                          {result.status !== "healthy" && (
                            <Checkbox
                              checked={selectedItems.has(result.id)}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedItems);
                                if (checked) next.add(result.id); else next.delete(result.id);
                                setSelectedItems(next);
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                        <TableCell className="font-medium">{result.file_name}</TableCell>
                        <TableCell>{format(new Date(result.uploaded_at), "PPp")}</TableCell>
                        <TableCell>{getStatusBadge(result.status)}</TableCell>
                        <TableCell>{formatSize(result.file_size)}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{result.content_type || "-"}</TableCell>
                        <TableCell className="text-right">
                          {result.status !== "healthy" && (
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                disabled={replacingId === result.id}
                                onClick={() => {
                                  const input = document.createElement("input");
                                  input.type = "file";
                                  input.accept = ".pdf";
                                  input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0];
                                    if (file) handleReplace(result.id, file);
                                  };
                                  input.click();
                                }}
                              >
                                {replacingId === result.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                Replace
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="gap-1"
                                onClick={() => { setSelectedAudit(result); setShowDeleteDialog(true); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4">
                <AuditPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalCount={filteredResults.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={(p) => { setCurrentPage(p); setSelectedItems(new Set()); }}
                  onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); setSelectedItems(new Set()); }}
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
            <AlertDialogTitle>Delete Corrupt PDF?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the PDF file for <strong>{selectedAudit?.file_name}</strong>. The interview record will remain but you'll need to re-upload the PDF.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedAudit && deleteMutation.mutate(selectedAudit.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedItems.size} PDFs?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the selected corrupt/missing PDF files. Interview records will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedItems))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete {selectedItems.size} Files
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PdfDiagnosticsTab;
