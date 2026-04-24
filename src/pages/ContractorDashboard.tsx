import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditTable } from "@/components/AuditTable";
import { FilterSidebar } from "@/components/FilterSidebar";
import { FileCheck, AlertCircle, CheckCircle, XCircle, Loader2, Building2 } from "lucide-react";
import { ReAuditDialog } from "@/components/review/ReAuditDialog";

const ContractorDashboard = () => {
  const { profile } = useAuth();
  const [filters, setFilters] = useState({});
  const [selectedAudit, setSelectedAudit] = useState<any>(null);
  const [reauditDialogOpen, setReauditDialogOpen] = useState(false);

  // Use active_contractor_id if set, otherwise fall back to contractor_id
  const effectiveContractorId = profile?.active_contractor_id || profile?.contractor_id;

  // Fetch audits for contractor
  const { data: audits, isLoading, refetch } = useQuery({
    queryKey: ["contractor-audits", effectiveContractorId, filters],
    queryFn: async () => {
      if (!effectiveContractorId) return [];

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
        .eq("interview_metadata.contractor_id", effectiveContractorId)
        .order("uploaded_at", { ascending: false });

      // Apply filters
      if ((filters as any).status && (filters as any).status !== "all") {
        query = query.eq("status", (filters as any).status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveContractorId,
  });

  // Fetch burned audit IDs to exclude from lists/stats
  const { data: burnedAuditIds = [] } = useQuery({
    queryKey: ["burned-audit-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("burn_queue")
        .select("audit_id")
        .is("restored_at", null);
      return (data || []).map((b: any) => b.audit_id);
    },
    staleTime: 60_000,
  });
  const burnedSet = useMemo(() => new Set(burnedAuditIds), [burnedAuditIds]);
  const visibleAudits = useMemo(
    () => (audits || []).filter((a: any) => !burnedSet.has(a.id)),
    [audits, burnedSet]
  );

  // Calculate statistics
  const stats = {
    total: visibleAudits.length,
    awaiting: visibleAudits.filter((a) => a.status === "Awaiting Review").length,
    reaudit: visibleAudits.filter((a) => a.is_re_audit && a.status === "Awaiting Review").length,
    passed: visibleAudits.filter((a) => a.status === "Audit Passed").length,
    failed: visibleAudits.filter((a) => a.status === "Audit Failed").length,
  };

  // Get field manager breakdown
  const fieldManagerStats = visibleAudits.reduce((acc: any, audit: any) => {
    const fm = audit.interview_metadata?.field_manager || "Unknown";
    if (!acc[fm]) {
      acc[fm] = { total: 0, passed: 0, failed: 0 };
    }
    acc[fm].total++;
    if (audit.status === "Audit Passed") acc[fm].passed++;
    if (audit.status === "Audit Failed") acc[fm].failed++;
    return acc;
  }, {});

  const handleReaudit = (audit: any) => {
    setSelectedAudit(audit);
    setReauditDialogOpen(true);
  };

  if (!effectiveContractorId) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">No Contractor ID</h2>
            <p className="text-muted-foreground">
              Your profile doesn't have a contractor ID assigned.
            </p>
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
          <div className="container mx-auto p-6 space-y-6">
            <div>
              <h1 className="text-3xl font-bold">Contractor Dashboard</h1>
              <p className="text-muted-foreground">
                Monitor all interviews for contractor: <span className="font-semibold">{effectiveContractorId}</span>
              </p>
            </div>

            {/* Statistics Cards */}
            <div className="grid gap-4 md:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Interviews
                  </CardTitle>
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
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Awaiting Review
                  </CardTitle>
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
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Re-Audits
                  </CardTitle>
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
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Passed
                  </CardTitle>
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
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Failed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="text-2xl font-bold">{stats.failed}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Field Manager Overview */}
            {fieldManagerStats && Object.keys(fieldManagerStats).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Field Manager Performance</CardTitle>
                  <CardDescription>
                    Performance breakdown by field manager
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(fieldManagerStats).map(([fm, stats]: [string, any]) => (
                      <div key={fm} className="flex items-center justify-between p-3 border rounded-lg">
                        <span className="font-medium">{fm}</span>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">
                            Total: <span className="font-semibold">{stats.total}</span>
                          </span>
                          <span className="text-green-600">
                            Passed: <span className="font-semibold">{stats.passed}</span>
                          </span>
                          <span className="text-red-600">
                            Failed: <span className="font-semibold">{stats.failed}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Audits Table */}
            <Card>
              <CardHeader>
                <CardTitle>All Interviews</CardTitle>
                <CardDescription>
                  Interviews from all interviewers under your contractor
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
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

export default ContractorDashboard;
