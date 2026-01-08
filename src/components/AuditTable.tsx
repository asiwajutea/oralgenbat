import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock, Upload, Trash2, Info, Eye, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";

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
  is_re_audit: boolean;
  re_audit_count: number;
  original_status: "Pending" | "Audit Passed" | "Audit Failed" | "Awaiting Review" | null;
  locked_by: string | null;
  locked_at: string | null;
}

interface AuditTableProps {
  audits: Audit[];
  onRefresh?: () => void;
  onReaudit?: (audit: Audit) => void;
  showReauditAction?: boolean;
  hideReviewButton?: boolean;
}

// Component to display countdown timer in badge
const LockCountdownBadge = ({ lockedAt }: { lockedAt: string }) => {
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    const lockExpiry = new Date(lockedAt).getTime() + 60 * 60 * 1000;
    return Math.max(0, Math.floor((lockExpiry - Date.now()) / 1000));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const lockExpiry = new Date(lockedAt).getTime() + 60 * 60 * 1000;
      const remaining = Math.max(0, Math.floor((lockExpiry - Date.now()) / 1000));
      setRemainingSeconds(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedAt]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Badge className="flex items-center gap-1 bg-blue-100 text-blue-700 hover:bg-blue-100/90">
      <Lock className="h-3 w-3" />
      In Progress ({remainingSeconds > 0 ? formatTime(remainingSeconds) : "EXPIRED"})
    </Badge>
  );
};

const getStatusBadge = (status: Audit["status"], isReAudit: boolean = false, isInProgress: boolean = false, lockedAt: string | null = null) => {
  if (isInProgress && lockedAt) {
    return <LockCountdownBadge lockedAt={lockedAt} />;
  }

  if (status === "Awaiting Review" && isReAudit) {
    return (
      <Badge className="flex items-center gap-1 bg-red-100 text-red-700 hover:bg-red-100/90">
        <AlertTriangle className="h-3 w-3" />
        Re-Audit Required
      </Badge>
    );
  }

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
          BAC Audit Failed
        </Badge>
      );
    case "Audit Passed":
      return (
        <Badge className="flex items-center gap-1 bg-success text-success-foreground hover:bg-success/90">
          <CheckCircle2 className="h-3 w-3" />
          BAC Audit Passed
        </Badge>
      );
    case "Pending":
      return (
        <Badge className="flex items-center gap-1 bg-warning text-warning-foreground hover:bg-warning/90">
          <Clock className="h-3 w-3" />
          Awaiting Review
        </Badge>
      );
  }
};

export const AuditTable = ({ audits, onRefresh, onReaudit, showReauditAction, hideReviewButton = false }: AuditTableProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [uploadingAudits, setUploadingAudits] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { session, userRole } = useAuth();
  const currentUserId = session?.user?.id;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const canUpload = userRole !== 'auditor'; // Auditors cannot upload files

  // Get audit IDs for metadata status query
  const auditIds = useMemo(() => audits.map(a => a.id), [audits]);

  // Query to check which audits have metadata uploaded
  const { data: metadataMap } = useQuery({
    queryKey: ["audit-metadata-status", auditIds],
    queryFn: async () => {
      if (auditIds.length === 0) return new Set<string>();
      const { data } = await supabase
        .from("interview_metadata")
        .select("audit_id")
        .in("audit_id", auditIds);
      return new Set(data?.map(m => m.audit_id) || []);
    },
    enabled: auditIds.length > 0,
  });

  // Helper to check if an audit is locked by someone else
  const isLockedByOther = (audit: Audit) => {
    return audit.locked_by && 
           audit.locked_at && 
           audit.locked_at > oneHourAgo && 
           audit.locked_by !== currentUserId;
  };

  // Helper to check if an audit is in progress (locked by anyone)
  const isInProgress = (audit: Audit) => {
    return audit.locked_by && audit.locked_at && audit.locked_at > oneHourAgo;
  };

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const uploadFileWithProgress = async (
    file: File,
    filePath: string,
    auditId: string
  ): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      try {
        const { data: uploadData, error: urlError } = await supabase.storage
          .from("mobile-zips")
          .createSignedUploadUrl(filePath);

        if (urlError) throw urlError;

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(prev => ({ ...prev, [auditId]: percent }));
          }
        });

        xhr.addEventListener("load", async () => {
          if (xhr.status === 200) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const { data: { publicUrl } } = supabase.storage
              .from("mobile-zips")
              .getPublicUrl(filePath);

            resolve(publicUrl);
          } else {
            reject(new Error("Upload failed"));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Upload failed")));

        xhr.open("PUT", uploadData.signedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      } catch (error) {
        reject(error);
      }
    });
  };

  const handleMobileZipUpload = async (auditId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const { data: audit, error: fetchError } = await supabase
          .from('audits')
          .select('file_name')
          .eq('id', auditId)
          .single();

        if (fetchError) throw fetchError;

        if (!file.name.toLowerCase().endsWith('.zip')) {
          toast({
            title: "Invalid file type",
            description: "Please select a ZIP file",
            variant: "destructive",
          });
          return;
        }

        const zipFileName = file.name.replace(/\.zip$/i, '');
        const expectedFileName = audit.file_name;

        if (zipFileName.toLowerCase() !== expectedFileName.toLowerCase()) {
          toast({
            title: "Filename mismatch",
            description: `The ZIP file must be named "${expectedFileName}.zip" to match the interview ID. Your file is named "${file.name}"`,
            variant: "destructive",
          });
          return;
        }

        setUploadingAudits(prev => new Set(prev).add(auditId));
        setUploadProgress(prev => ({ ...prev, [auditId]: 0 }));

        const filePath = `${auditId}/${file.name}`;
        
        // Check if file already exists and delete it for replacement
        console.log('Checking for existing file at:', filePath);
        const { data: existingFiles } = await supabase.storage
          .from("mobile-zips")
          .list(auditId);

        const fileExists = existingFiles?.some(f => f.name === file.name);

        if (fileExists) {
          console.log('Existing file found, deleting for replacement...');
          
          // Delete existing file from storage
          const { error: deleteError } = await supabase.storage
            .from("mobile-zips")
            .remove([filePath]);
            
          if (deleteError) {
            console.warn("Could not delete existing file:", deleteError);
            throw new Error("Failed to delete existing file. Please try again.");
          }

          // Clean up any partial data from previous processing
          console.log('Cleaning up previous metadata and photos...');
          await supabase.from('interview_photos').delete().eq('audit_id', auditId);
          await supabase.from('interview_metadata').delete().eq('audit_id', auditId);
          
          toast({
            title: "Replacing existing file",
            description: "Previous file and data have been removed",
          });
          
          // Wait briefly for storage to fully process the deletion
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const publicUrl = await uploadFileWithProgress(file, filePath, auditId);

        await supabase
          .from('audits')
          .update({
            mobile_zip_url: publicUrl,
            mobile_zip_uploaded_at: new Date().toISOString(),
          })
          .eq('id', auditId);

        toast({
          title: "Processing",
          description: "Mobile materials uploaded. Processing ZIP file...",
        });

        const { error: processError } = await supabase.functions.invoke(
          'process-mobile-zip',
          {
            body: {
              auditId,
              mobileZipUrl: publicUrl,
            },
          }
        );

        if (processError) {
          console.error("Error processing ZIP:", processError);
          toast({
            title: "Warning",
            description: `ZIP uploaded but processing failed for "${audit.file_name}.zip". Please try again.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Success",
            description: "Mobile materials processed successfully",
          });
        }

        onRefresh();
      } catch (error) {
        console.error("Upload error:", error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to upload mobile materials",
          variant: "destructive",
        });
      } finally {
        setUploadingAudits(prev => {
          const newSet = new Set(prev);
          newSet.delete(auditId);
          return newSet;
        });
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[auditId];
          return newProgress;
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
            file_name: file.name.replace(/\.pdf$/i, ''),
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
                      <div className="flex items-center gap-1.5">
                        {audit.file_name}
                        {metadataMap?.has(audit.id) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>PDF and metadata uploaded</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(audit.status, audit.is_re_audit, isInProgress(audit), audit.locked_at)}</TableCell>
                    <TableCell>
                      {format(new Date(audit.last_modified), "dd MMM yyyy")}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="animate-accordion-down">
                      <TableCell colSpan={4} className="bg-muted/10 p-0">
                        <div className="p-4 transition-all duration-600">
                          {/* Header with title and actions */}
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold">Interview Details</h3>
                            <div className="flex items-center gap-2">
                              {audit.status === "Audit Failed" ? (
                                <>
                                  <Button 
                                    className="bg-blue-600 hover:bg-blue-700 h-9 text-sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/review/${audit.id}`);
                                    }}
                                  >
                                    VIEW REPORT
                                  </Button>
                                  {showReauditAction && onReaudit && (
                                    <Button 
                                      className="bg-orange-600 hover:bg-orange-700 h-9 text-sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onReaudit(audit);
                                      }}
                                    >
                                      SEND FOR RE-AUDIT
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <>
                                  {!hideReviewButton && (
                                    <Button 
                                      className="bg-cyan-600 hover:bg-cyan-700 h-9 text-sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/review/${audit.id}`);
                                      }}
                                      disabled={audit.status === "Audit Passed" || isLockedByOther(audit)}
                                    >
                                      {isLockedByOther(audit) ? "IN REVIEW" : "REVIEW INTERVIEW"}
                                    </Button>
                                  )}
                                </>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-9 w-9"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(audit.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>

                          {/* Grid layout for details */}
                          <div className="space-y-3">
                            {/* Row 1: Mobile Zip File */}
                            <div className="grid grid-cols-[180px_140px_100px_50px_120px_auto] gap-3 items-center py-2 border-b">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium">Mobile Zip File</span>
                                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                              
                              <div className="flex flex-col gap-2">
                                {canUpload ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 justify-start"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMobileZipUpload(audit.id);
                                    }}
                                    disabled={uploadingAudits.has(audit.id)}
                                  >
                                    <Upload className="h-3.5 w-3.5 mr-2" />
                                    {audit.mobile_zip_url ? 'REPLACE' : 'ATTACH'}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                                
                                {uploadingAudits.has(audit.id) && (
                                  <div className="space-y-1">
                                    <Progress value={uploadProgress[audit.id] || 0} className="h-2" />
                                    <span className="text-xs text-muted-foreground">
                                      Uploading: {uploadProgress[audit.id] || 0}%
                                    </span>
                                  </div>
                                )}
                              </div>
                              
                              {audit.mobile_zip_url ? (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    <span className="text-sm">Uploaded</span>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8"
                                    onClick={(e) => e.stopPropagation()}
                                    asChild
                                  >
                                    <a href={audit.mobile_zip_url} target="_blank" rel="noopener noreferrer">
                                      <Eye className="h-4 w-4" />
                                    </a>
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <div></div>
                                  <div></div>
                                </>
                              )}
                              
                              <span className="text-sm font-medium">Reviewed By</span>
                              
                              <div className="flex items-center gap-1.5">
                                {audit.reviewed_by ? (
                                  <>
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    <span className="text-sm">{audit.reviewed_by}</span>
                                  </>
                                ) : (
                                  <span className="text-sm text-muted-foreground">-</span>
                                )}
                              </div>
                            </div>

                            {/* Row 2: PDF Scan */}
                            <div className="grid grid-cols-[180px_140px_100px_50px_120px_auto] gap-3 items-center py-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium">PDF Scan</span>
                                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                              
                              {canUpload ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 justify-start"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePdfReplace(audit.id);
                                  }}
                                >
                                  <Upload className="h-3.5 w-3.5 mr-2" />
                                  REPLACE PDF
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                              
                              <div></div>
                              <div></div>
                              
                              <span className="text-sm font-medium">Uploaded At</span>
                              
                              <span className="text-sm text-muted-foreground">
                                {format(new Date(audit.uploaded_at), "dd MMM yyyy, hh:mm a")}
                              </span>
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
