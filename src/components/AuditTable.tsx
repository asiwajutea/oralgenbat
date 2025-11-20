import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock, Upload, Trash2, Info, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

interface Audit {
  id: string;
  file_name: string;
  file_url: string;
  status: "Pending" | "Audit Passed" | "Audit Failed" | "Awaiting Review";
  uploaded_at: string;
  last_modified: string;
  mobile_zip_url: string | null;
  mobile_zip_uploaded_at: string | null;
  reviewed_by: string | null;
}

interface AuditTableProps {
  audits: Audit[];
  onRefresh: () => void;
}

const getStatusBadge = (status: Audit["status"]) => {
  switch (status) {
    case "Awaiting Review":
      return (
        <Badge className="flex items-center gap-1 bg-orange-100 text-orange-700 hover:bg-orange-100/90">
          <Clock className="h-3 w-3" />
          Awaiting Review
        </Badge>
      );
    case "Audit Failed":
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          VAC Audit Failed
        </Badge>
      );
    case "Audit Passed":
      return (
        <Badge className="flex items-center gap-1 bg-success text-success-foreground hover:bg-success/90">
          <CheckCircle2 className="h-3 w-3" />
          VAC Audit Passed
        </Badge>
      );
    case "Pending":
      return (
        <Badge className="flex items-center gap-1 bg-warning text-warning-foreground hover:bg-warning/90">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
  }
};

export const AuditTable = ({ audits, onRefresh }: AuditTableProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleMobileZipUpload = async (auditId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const fileExt = file.name.split('.').pop();
        const filePath = `${auditId}/${Date.now()}.${fileExt}`;
        
        const { data, error } = await supabase.storage
          .from('mobile-zips')
          .upload(filePath, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('mobile-zips')
          .getPublicUrl(filePath);

        await supabase
          .from('audits')
          .update({
            mobile_zip_url: publicUrl,
            mobile_zip_uploaded_at: new Date().toISOString(),
          })
          .eq('id', auditId);

        onRefresh();
        toast({
          title: "Success",
          description: "Mobile materials uploaded successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to upload mobile materials",
          variant: "destructive",
        });
      }
    };
    input.click();
  };

  const handlePdfReplace = async (auditId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const fileExt = file.name.split('.').pop();
        const filePath = `${Date.now()}.${fileExt}`;
        
        const { data, error } = await supabase.storage
          .from('audit-pdfs')
          .upload(filePath, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('audit-pdfs')
          .getPublicUrl(filePath);

        await supabase
          .from('audits')
          .update({
            file_url: publicUrl,
            file_name: file.name,
          })
          .eq('id', auditId);

        onRefresh();
        toast({
          title: "Success",
          description: "PDF replaced successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to replace PDF",
          variant: "destructive",
        });
      }
    };
    input.click();
  };

  const handleDelete = async (auditId: string) => {
    if (!confirm("Are you sure you want to delete this interview? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from('audits')
        .delete()
        .eq('id', auditId);

      if (error) throw error;

      onRefresh();
      toast({
        title: "Success",
        description: "Interview deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete interview",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Interview ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Modified</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {audits.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No audits found. Upload PDFs to get started.
              </TableCell>
            </TableRow>
          ) : (
            audits.map((audit) => {
              const isExpanded = expandedRows.has(audit.id);
              return (
                <>
                  <TableRow 
                    key={audit.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleRow(audit.id)}
                  >
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(audit.id);
                        }}
                        className="h-6 w-6 p-0"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {audit.file_name}
                    </TableCell>
                    <TableCell>{getStatusBadge(audit.status)}</TableCell>
                    <TableCell>
                      {format(new Date(audit.last_modified), "dd MMM yyyy")}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={4} className="bg-muted/10 p-0">
                        <div className="p-3">
                          {/* Compact Action Bar */}
                          <div className="flex items-center justify-end gap-1.5 mb-2">
                            <Button 
                              className="bg-cyan-600 hover:bg-cyan-700 h-8 text-xs px-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              REVIEW
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(audit.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>

                          {/* Compact Details Grid */}
                          <div className="space-y-2">
                            {/* Mobile Materials Row */}
                            <div className="flex items-center justify-between py-1.5">
                              <span className="text-xs font-medium text-muted-foreground">
                                Mobile Materials
                              </span>
                              <div className="flex items-center gap-2">
                                {audit.mobile_zip_url ? (
                                  <>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                                      <span>Uploaded</span>
                                    </div>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-7 w-7"
                                      onClick={(e) => e.stopPropagation()}
                                      asChild
                                    >
                                      <a href={audit.mobile_zip_url} target="_blank" rel="noopener noreferrer">
                                        <Eye className="h-3.5 w-3.5" />
                                      </a>
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs px-2"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMobileZipUpload(audit.id);
                                      }}
                                    >
                                      <Upload className="h-3 w-3 mr-1" />
                                      REPLACE
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs px-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMobileZipUpload(audit.id);
                                    }}
                                  >
                                    <Upload className="h-3 w-3 mr-1" />
                                    ATTACH
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* PDF Scan Row */}
                            <div className="flex items-center justify-between py-1.5">
                              <span className="text-xs font-medium text-muted-foreground">
                                PDF Scan
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(audit.uploaded_at), "dd MMM yyyy")}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePdfReplace(audit.id);
                                  }}
                                >
                                  <Upload className="h-3 w-3 mr-1" />
                                  REPLACE
                                </Button>
                              </div>
                            </div>

                            {/* Reviewed By Row */}
                            <div className="flex items-center justify-between py-1.5">
                              <span className="text-xs font-medium text-muted-foreground">
                                Reviewed By
                              </span>
                              <div className="flex items-center gap-1.5">
                                {audit.reviewed_by ? (
                                  <>
                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    <span className="text-xs">{audit.reviewed_by}</span>
                                  </>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};
