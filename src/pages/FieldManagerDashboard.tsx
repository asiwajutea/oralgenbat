import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditTable } from "@/components/AuditTable";
import { FilterSidebar } from "@/components/FilterSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Users, FileCheck, AlertCircle, CheckCircle, XCircle, Loader2, FileText, Archive, RefreshCw, Search, Eye } from "lucide-react";
import { ReAuditDialog } from "@/components/review/ReAuditDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "Audit Passed":
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">Passed</Badge>;
    case "Audit Failed":
      return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-xs">Failed</Badge>;
    case "Awaiting Review":
      return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-xs">Awaiting</Badge>;
    case "Pending":
      return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">Pending</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
};

const FieldManagerDashboard = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState({});
  const [selectedAudit, setSelectedAudit] = useState<any>(null);
  const [reauditDialogOpen, setReauditDialogOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState("");

  // Fetch approved team members
  const { data: teamMembers, isLoading: loadingTeam } = useQuery({
    queryKey: ["field-manager-team", session?.user.id],
    queryFn: async () => {
      if (!session?.user.id) return [];

      const { data, error } = await supabase
        .from("team_assignments")
        .select("interviewer_code")
        .eq("field_manager_id", session.user.id)
        .eq("status", "approved");

      if (error) throw error;
      return data.map((t) => t.interviewer_code);
    },
    enabled: !!session?.user.id,
  });

  // Fetch audits for team members
  const { data: audits, isLoading: loadingAudits, refetch } = useQuery({
    queryKey: ["field-manager-audits", teamMembers, filters],
    queryFn: async () => {
      if (!teamMembers || teamMembers.length === 0) return [];

      let query = supabase
        .from("audits")
        .select(`
          *,
          interview_metadata!inner (
            interviewer_code,
            interviewer_name,
            contractor_id,
            field_manager
          )
        `)
        .in("interview_metadata.interviewer_code", teamMembers)
        .order("uploaded_at", { ascending: false });

      // Apply filters
      if ((filters as any).status && (filters as any).status !== "all") {
        query = query.eq("status", (filters as any).status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!teamMembers && teamMembers.length > 0,
  });

  // Calculate statistics
  const stats = {
    total: audits?.length || 0,
    awaiting: audits?.filter((a) => a.status === "Awaiting Review").length || 0,
    reaudit: audits?.filter((a) => a.is_re_audit && a.status === "Awaiting Review").length || 0,
    passed: audits?.filter((a) => a.status === "Audit Passed").length || 0,
    failed: audits?.filter((a) => a.status === "Audit Failed").length || 0,
    missingArtifacts: audits?.filter((a) => !a.file_url || !a.mobile_zip_url).length || 0,
  };

  const handleReaudit = (audit: any) => {
    setSelectedAudit(audit);
    setReauditDialogOpen(true);
  };

  // Filter audits for mobile search
  const filteredAudits = audits?.filter((a) => {
    if (!mobileSearch) return true;
    const search = mobileSearch.toLowerCase();
    return (
      a.file_name?.toLowerCase().includes(search) ||
      (a.interview_metadata as any)?.interviewer_code?.toLowerCase().includes(search) ||
      (a.interview_metadata as any)?.interviewer_name?.toLowerCase().includes(search)
    );
  }) || [];

  if (loadingTeam) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!teamMembers || teamMembers.length === 0) {
    return (
      <Layout>
        <div className="container mx-auto p-6">
          <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
            <Users className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">No Team Members</h2>
            <p className="text-muted-foreground text-center mb-6">
              You don't have any approved team members yet.<br />
              Request interviewers from the Team Management page.
            </p>
            <Button onClick={() => window.location.href = "/team-management"}>
              Go to Team Management
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex min-h-screen w-full">
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Field Manager Dashboard</h1>
              <p className="text-sm md:text-base text-muted-foreground">
                Monitor your team's interview audits ({teamMembers.length} interviewer{teamMembers.length !== 1 ? 's' : ''})
              </p>
            </div>

            {/* Mobile: Compact horizontal scroll stats */}
            <div className="flex gap-2 overflow-x-auto pb-2 md:hidden -mx-2 px-2">
              <div className="flex-shrink-0 flex items-center gap-1.5 bg-card border rounded-lg px-3 py-2">
                <FileCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{stats.total}</span>
                <span className="text-xs text-muted-foreground">Total</span>
              </div>
              <div className="flex-shrink-0 flex items-center gap-1.5 bg-card border rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-medium">{stats.awaiting}</span>
                <span className="text-xs text-muted-foreground">Awaiting</span>
              </div>
              <div className="flex-shrink-0 flex items-center gap-1.5 bg-card border rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium">{stats.reaudit}</span>
                <span className="text-xs text-muted-foreground">Re-Audit</span>
              </div>
              <div className="flex-shrink-0 flex items-center gap-1.5 bg-card border rounded-lg px-3 py-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">{stats.passed}</span>
                <span className="text-xs text-muted-foreground">Passed</span>
              </div>
              <div className="flex-shrink-0 flex items-center gap-1.5 bg-card border rounded-lg px-3 py-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium">{stats.failed}</span>
                <span className="text-xs text-muted-foreground">Failed</span>
              </div>
              <div className="flex-shrink-0 flex items-center gap-1.5 bg-card border rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">{stats.missingArtifacts}</span>
                <span className="text-xs text-muted-foreground">Missing</span>
              </div>
            </div>

            {/* Desktop: Full grid layout */}
            <div className="hidden md:grid gap-4 md:grid-cols-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Interviews</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5 text-primary" />
                    <span className="text-2xl font-bold">{stats.total}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Awaiting Review</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-orange-500" />
                    <span className="text-2xl font-bold">{stats.awaiting}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Re-Audits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    <span className="text-2xl font-bold">{stats.reaudit}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Passed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="text-2xl font-bold">{stats.passed}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="text-2xl font-bold">{stats.failed}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Missing Artifacts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    <span className="text-2xl font-bold">{stats.missingArtifacts}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Audits Table / Mobile Accordion */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg md:text-xl">Team Interviews</CardTitle>
                <CardDescription>
                  All interviews conducted by your team members
                </CardDescription>
                {/* Mobile search */}
                {isMobile && (
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by file name or interviewer..."
                      value={mobileSearch}
                      onChange={(e) => setMobileSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {loadingAudits ? (
                  <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : isMobile ? (
                  /* Mobile Accordion View */
                  filteredAudits.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No interviews found</p>
                  ) : (
                    <Accordion type="single" collapsible className="space-y-2">
                      {filteredAudits.map((audit) => {
                        const metadata = audit.interview_metadata as any;
                        return (
                          <AccordionItem
                            key={audit.id}
                            value={audit.id}
                            className="border rounded-lg px-3"
                          >
                            <AccordionTrigger className="hover:no-underline py-3">
                              <div className="flex flex-col items-start gap-1 text-left flex-1 min-w-0 mr-2">
                                <span className="text-sm font-medium truncate w-full">
                                  {audit.file_name?.replace('.pdf', '')}
                                </span>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {getStatusBadge(audit.status)}
                                  {audit.is_re_audit && (
                                    <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-500">
                                      <RefreshCw className="h-3 w-3 mr-1" />
                                      Re-Audit #{audit.re_audit_count}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pb-3">
                              <div className="space-y-3">
                                {/* Details */}
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <p className="text-muted-foreground text-xs">Interviewer</p>
                                    <p className="font-medium">
                                      {metadata?.interviewer_code}
                                      {metadata?.interviewer_name && (
                                        <span className="text-muted-foreground"> ({metadata.interviewer_name})</span>
                                      )}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground text-xs">Status</p>
                                    <p className="font-medium">{audit.status}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground text-xs">Uploaded</p>
                                    <p className="font-medium">{format(new Date(audit.uploaded_at), 'MMM dd, yyyy')}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground text-xs">Last Modified</p>
                                    <p className="font-medium">{format(new Date(audit.last_modified || audit.uploaded_at), 'MMM dd, yyyy')}</p>
                                  </div>
                                  {audit.reviewed_by && (
                                    <div className="col-span-2">
                                      <p className="text-muted-foreground text-xs">Reviewed By</p>
                                      <p className="font-medium">{audit.reviewed_by}</p>
                                    </div>
                                  )}
                                  {audit.review_comment && (
                                    <div className="col-span-2">
                                      <p className="text-muted-foreground text-xs">Review Comment</p>
                                      <p className="font-medium text-sm">{audit.review_comment}</p>
                                    </div>
                                  )}
                                </div>

                                {/* Artifacts */}
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Artifacts:</span>
                                  {audit.file_url && (
                                    <Badge variant="outline" className="text-xs">
                                      <FileText className="h-3 w-3 mr-1" />PDF
                                    </Badge>
                                  )}
                                  {audit.mobile_zip_url && (
                                    <Badge variant="outline" className="text-xs">
                                      <Archive className="h-3 w-3 mr-1" />ZIP
                                    </Badge>
                                  )}
                                  {!audit.file_url && !audit.mobile_zip_url && (
                                    <span className="text-xs text-muted-foreground">None</span>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2 pt-1">
                                  {audit.file_url && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1"
                                      onClick={() => navigate(`/review/${audit.id}`)}
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      View
                                    </Button>
                                  )}
                                  {(audit.status === "Audit Failed" || audit.status === "Audit Passed") && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1"
                                      onClick={() => handleReaudit(audit)}
                                    >
                                      <RefreshCw className="h-4 w-4 mr-1" />
                                      Re-Audit
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  )
                ) : (
                  <AuditTable
                    audits={audits || []}
                    onReaudit={handleReaudit}
                    showReauditAction
                    hideReviewButton
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sticky Filter Sidebar */}
        <div className="hidden lg:block sticky top-0 h-screen">
          <FilterSidebar onFilterChange={setFilters} />
        </div>
      </div>

      {/* Re-Audit Dialog */}
      {selectedAudit && (
        <ReAuditDialog
          open={reauditDialogOpen}
          onOpenChange={setReauditDialogOpen}
          auditId={selectedAudit.id}
          currentFileName={selectedAudit.file_name}
          onSuccess={() => refetch()}
        />
      )}
    </Layout>
  );
};

export default FieldManagerDashboard;
