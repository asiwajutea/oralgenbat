import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditTable } from "@/components/AuditTable";
import { FilterSidebar } from "@/components/FilterSidebar";
import { Button } from "@/components/ui/button";
import { Users, FileCheck, AlertCircle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { ReAuditDialog } from "@/components/review/ReAuditDialog";

const FieldManagerDashboard = () => {
  const { session } = useAuth();
  const [filters, setFilters] = useState({});
  const [selectedAudit, setSelectedAudit] = useState<any>(null);
  const [reauditDialogOpen, setReauditDialogOpen] = useState(false);

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
  };

  const handleReaudit = (audit: any) => {
    setSelectedAudit(audit);
    setReauditDialogOpen(true);
  };

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
          <div className="container mx-auto p-6 space-y-6">
            <div>
              <h1 className="text-3xl font-bold">Field Manager Dashboard</h1>
              <p className="text-muted-foreground">
                Monitor your team's interview audits ({teamMembers.length} interviewer{teamMembers.length !== 1 ? 's' : ''})
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

            {/* Audits Table */}
            <Card>
              <CardHeader>
                <CardTitle>Team Interviews</CardTitle>
                <CardDescription>
                  All interviews conducted by your team members
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingAudits ? (
                  <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <AuditTable
                    audits={audits || []}
                    onReaudit={handleReaudit}
                    showReauditAction
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
