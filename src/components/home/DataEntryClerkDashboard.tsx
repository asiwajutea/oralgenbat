import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  FileText,
  ArrowRight,
  PlayCircle,
  Search,
  CheckCircle2,
  Users,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  BarChart3
} from "lucide-react";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

const DataEntryClerkDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingIssuesOpen, setPendingIssuesOpen] = useState(false);

  // Stats for different time periods
  const { data: stats } = useQuery({
    queryKey: ["clerk-dashboard-stats", user?.id],
    queryFn: async () => {
      if (!user?.id) return { today: 0, week: 0, month: 0, totalNames: 0 };
      
      const todayStart = startOfDay(new Date()).toISOString();
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
      const monthStart = startOfMonth(new Date()).toISOString();
      
      // Get all completions
      const { data: allCompletions } = await supabase
        .from("interview_assignments")
        .select("id, audit_id, entry_completed_at")
        .eq("entry_completed_by", user.id)
        .eq("entry_status", "data_entry_complete");
      
      if (!allCompletions) return { today: 0, week: 0, month: 0, totalNames: 0 };
      
      const today = allCompletions.filter(c => c.entry_completed_at && c.entry_completed_at >= todayStart).length;
      const week = allCompletions.filter(c => c.entry_completed_at && c.entry_completed_at >= weekStart).length;
      const month = allCompletions.filter(c => c.entry_completed_at && c.entry_completed_at >= monthStart).length;
      
      // Get total names
      const auditIds = allCompletions.map(c => c.audit_id);
      let totalNames = 0;
      if (auditIds.length > 0) {
        const { data: metadata } = await supabase
          .from("interview_metadata")
          .select("total_names")
          .in("audit_id", auditIds);
        totalNames = metadata?.reduce((sum, m) => sum + (m.total_names || 0), 0) || 0;
      }
      
      return { today, week, month, totalNames };
    },
    enabled: !!user?.id,
  });

  // Pending flagged issues
  const { data: pendingIssues = [] } = useQuery({
    queryKey: ["clerk-pending-issues", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("interview_assignments")
        .select(`
          id,
          audit_id,
          issue_comment,
          flagged_at,
          issue_resolved_at,
          resolve_comment,
          entry_status,
          audits(file_name)
        `)
        .eq("flagged_by", user.id)
        .eq("is_flagged_for_issue", true)
        .order("flagged_at", { ascending: false })
        .limit(5);
      
      if (error) throw error;
      
      // Filter to show unresolved OR resolved that haven't been marked complete
      return (data || []).filter((issue: any) => 
        !issue.issue_resolved_at || 
        (issue.issue_resolved_at && issue.entry_status !== "data_entry_complete")
      );
    },
    enabled: !!user?.id,
  });

  // Recent completions
  const { data: recentCompletions = [] } = useQuery({
    queryKey: ["clerk-recent-completions", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("interview_assignments")
        .select(`
          id,
          entry_completed_at,
          audit_id,
          audits(file_name)
        `)
        .eq("entry_completed_by", user.id)
        .eq("entry_status", "data_entry_complete")
        .order("entry_completed_at", { ascending: false })
        .limit(5);
      
      if (error) throw error;
      
      // Get names count
      if (data && data.length > 0) {
        const auditIds = data.map(d => d.audit_id);
        const { data: metadataList } = await supabase
          .from("interview_metadata")
          .select("audit_id, total_names")
          .in("audit_id", auditIds);
        
        const metadataMap = new Map(metadataList?.map(m => [m.audit_id, m.total_names]) || []);
        
        return data.map(d => ({
          ...d,
          total_names: metadataMap.get(d.audit_id) || 0
        }));
      }
      
      return data || [];
    },
    enabled: !!user?.id,
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter an interview ID");
      return;
    }
    navigate(`/data-entry?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Start Card */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <PlayCircle className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Data Entry Portal</h3>
                <p className="text-muted-foreground">
                  Search and complete interview data entry
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/my-analytics")} className="gap-2">
                <BarChart3 className="h-4 w-4" />
                My Analytics
              </Button>
              <Button onClick={() => navigate("/data-entry")} size="lg" className="gap-2">
                Open Portal
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" />
            Quick Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter interview ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button onClick={handleSearch}>
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.today || 0}</p>
                <p className="text-xs text-muted-foreground">Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.week || 0}</p>
                <p className="text-xs text-muted-foreground">This Week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.month || 0}</p>
                <p className="text-xs text-muted-foreground">This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Users className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalNames?.toLocaleString() || 0}</p>
                <p className="text-xs text-muted-foreground">Total Names</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Issues */}
        <Card>
          <Collapsible open={pendingIssuesOpen} onOpenChange={setPendingIssuesOpen}>
            <CardHeader className="pb-3">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <CardTitle className="text-lg">Your Flagged Issues</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{pendingIssues.length}</Badge>
                    {pendingIssuesOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                {pendingIssues.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    No pending flagged issues
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pendingIssues.map((issue: any) => (
                      <div 
                        key={issue.id}
                        className="p-3 rounded-lg bg-muted/50 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm">{issue.audits?.file_name}</span>
                          {issue.issue_resolved_at ? (
                            <Badge className="bg-blue-100 text-blue-700 text-xs">Resolved</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">Pending</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {issue.issue_comment}
                        </p>
                        {issue.resolve_comment && (
                          <p className="text-xs text-blue-600 italic">
                            Response: {issue.resolve_comment}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Recent Completions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <CardTitle className="text-lg">Recent Completions</CardTitle>
              </div>
              <Badge variant="outline">{recentCompletions.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {recentCompletions.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                No completed interviews yet
              </p>
            ) : (
              <div className="space-y-2">
                {recentCompletions.map((completion: any) => (
                  <div 
                    key={completion.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium text-sm truncate">
                        {completion.audits?.file_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{completion.total_names} names</span>
                      <span>•</span>
                      <span>
                        {completion.entry_completed_at && format(new Date(completion.entry_completed_at), "MMM d")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DataEntryClerkDashboard;
