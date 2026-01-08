import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  FileText,
  Users,
  TrendingUp,
  ArrowRight
} from "lucide-react";
import { format, subHours } from "date-fns";
import { AdminStatsCard } from "@/components/AdminStatsCard";
import { AuditorStatsCard } from "@/components/AuditorStatsCard";
import { toast } from "sonner";

const Home = () => {
  const navigate = useNavigate();
  const { userRole, profile, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  
  const canUpload = userRole !== 'auditor';
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isAuditor = userRole === 'auditor';
  const isFieldManager = userRole === 'field_manager';
  const isContractor = userRole === 'contractor';

  // Get user's team interviewer codes for field managers
  const { data: teamInterviewerCodes = [] } = useQuery({
    queryKey: ["user-team-codes", user?.id],
    queryFn: async () => {
      if (!user?.id || !isFieldManager) return [];
      
      const { data, error } = await supabase
        .from("team_assignments")
        .select("interviewer_code")
        .eq("field_manager_id", user.id)
        .eq("status", "approved");
      
      if (error) throw error;
      return data?.map(t => t.interviewer_code) || [];
    },
    enabled: isFieldManager && !!user?.id,
  });
  
  // Get interviews approved in last 24 hours - USER SPECIFIC
  const { data: recentlyApproved = [] } = useQuery({
    queryKey: ["recently-approved-interviews", userRole, profile?.full_name, profile?.contractor_id, teamInterviewerCodes],
    queryFn: async () => {
      const twentyFourHoursAgo = subHours(new Date(), 24).toISOString();
      
      let query = supabase
        .from("audits")
        .select("id, file_name, reviewed_at, reviewed_by")
        .eq("status", "Audit Passed")
        .gte("reviewed_at", twentyFourHoursAgo)
        .order("reviewed_at", { ascending: false })
        .limit(10);
      
      // For auditors, show only their own approved interviews
      if (isAuditor && profile?.full_name) {
        query = query.eq("reviewed_by", profile.full_name);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      let results = data || [];
      
      // For field managers, filter by their team's interviewer codes
      if (isFieldManager && teamInterviewerCodes.length > 0) {
        results = results.filter(interview => {
          const parts = interview.file_name.split('_');
          if (parts.length >= 2) {
            const interviewerCode = parts[1];
            return teamInterviewerCodes.includes(interviewerCode);
          }
          return false;
        });
      }
      
      // For contractors, filter by contractor ID in file_name
      if (isContractor && profile?.contractor_id) {
        results = results.filter(interview => 
          interview.file_name.startsWith(profile.contractor_id)
        );
      }
      
      return results;
    },
  });
  
  // Get interviews in progress (locked) - ONLY SHOW USER'S OWN
  const { data: inProgressInterviews = [] } = useQuery({
    queryKey: ["in-progress-interviews", user?.id, userRole, isAdmin],
    queryFn: async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      let query = supabase
        .from("audits")
        .select("id, file_name, locked_at, locked_by, profiles!audits_locked_by_fkey(full_name)")
        .not("locked_by", "is", null)
        .gte("locked_at", oneHourAgo)
        .order("locked_at", { ascending: false })
        .limit(10);
      
      // For non-admins, only show their own locked interviews
      if (!isAdmin && user?.id) {
        query = query.eq("locked_by", user.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
  
  // Get interviews sent for re-audit - USER SPECIFIC
  const { data: reAuditInterviews = [] } = useQuery({
    queryKey: ["re-audit-interviews-home", userRole, profile?.full_name, profile?.contractor_id, teamInterviewerCodes],
    queryFn: async () => {
      let query = supabase
        .from("audits")
        .select("id, file_name, reviewed_by, last_modified, re_audit_count")
        .eq("is_re_audit", true)
        .eq("status", "Awaiting Review")
        .order("last_modified", { ascending: false })
        .limit(10);
      
      // For auditors, only show re-audits they originally reviewed
      if (isAuditor && profile?.full_name) {
        query = query.eq("reviewed_by", profile.full_name);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      let results = data || [];
      
      // For field managers, filter by their team's interviewer codes
      if (isFieldManager && teamInterviewerCodes.length > 0) {
        results = results.filter(interview => {
          const parts = interview.file_name.split('_');
          if (parts.length >= 2) {
            const interviewerCode = parts[1];
            return teamInterviewerCodes.includes(interviewerCode);
          }
          return false;
        });
      }
      
      // For contractors, filter by contractor ID in file_name
      if (isContractor && profile?.contractor_id) {
        results = results.filter(interview => 
          interview.file_name.startsWith(profile.contractor_id)
        );
      }
      
      return results;
    },
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter an interview ID to search");
      return;
    }
    navigate(`/interviews?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container py-8 space-y-8">
        {/* Welcome Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!</h1>
            <p className="text-muted-foreground mt-1">Here's what's happening with your interviews today.</p>
          </div>
        </div>

        {/* Hero Section with Add Interview + Search */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Add Interview Card */}
          {canUpload && (
            <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20 hover:shadow-lg transition-shadow">
              <CardContent className="p-6 flex flex-col justify-center items-center text-center min-h-[200px]">
                <div className="p-4 bg-primary/10 rounded-full mb-4">
                  <Plus className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Add New Interview</h3>
                <p className="text-muted-foreground text-sm mb-4">Upload PDF scans and mobile materials for auditing</p>
                <Button onClick={() => navigate("/interviews")} className="gap-2">
                  <Plus className="h-4 w-4" />
                  ADD INTERVIEW
                </Button>
              </CardContent>
            </Card>
          )}
          
          {/* Search Card */}
          <Card className={`hover:shadow-lg transition-shadow ${!canUpload ? 'md:col-span-2' : ''}`}>
            <CardContent className="p-6 flex flex-col justify-center min-h-[200px]">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-muted rounded-full">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Find an Interview</h3>
                  <p className="text-muted-foreground text-sm">Search by Interview ID</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Input
                  placeholder="Enter Interview ID (e.g., NG71_704_20251013)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="flex-1"
                />
                <Button onClick={handleSearch} className="gap-2">
                  <Search className="h-4 w-4" />
                  SEARCH
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Cards */}
        <AdminStatsCard />
        <AuditorStatsCard />

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Interviews Approved in Last 24 Hours */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <CardTitle className="text-lg">
                    {isAuditor ? "My Approved (24h)" : "Approved in Last 24 Hours"}
                  </CardTitle>
                </div>
                <Badge variant="secondary" className="bg-green-100 text-green-700">
                  {recentlyApproved.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {recentlyApproved.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">
                  No interviews approved in the last 24 hours
                </p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {recentlyApproved.map((interview) => (
                    <div 
                      key={interview.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => navigate(`/review/${interview.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{interview.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            by {interview.reviewed_by || "Unknown"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {interview.reviewed_at && format(new Date(interview.reviewed_at), "h:mm a")}
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column - In Progress & Re-Audits */}
          <div className="space-y-6">
            {/* Transcriptions In Progress */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-lg">
                      {isAdmin ? "All In Progress" : "My In Progress"}
                    </CardTitle>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    {inProgressInterviews.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {inProgressInterviews.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    No interviews currently in progress
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[150px] overflow-y-auto">
                    {inProgressInterviews.map((interview: any) => (
                      <div 
                        key={interview.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                          <span className="font-medium text-sm">{interview.file_name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {interview.profiles?.full_name || "Unknown"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sent for Re-Audit */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                    <CardTitle className="text-lg">
                      {isAuditor ? "My Re-Audits" : "Sent for Re-Audit"}
                    </CardTitle>
                  </div>
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                    {reAuditInterviews.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {reAuditInterviews.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    No interviews pending re-audit
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[150px] overflow-y-auto">
                    {reAuditInterviews.map((interview) => (
                      <div 
                        key={interview.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => navigate(`/review/${interview.id}`)}
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          <span className="font-medium text-sm">{interview.file_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            #{interview.re_audit_count}
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Actions for Admins */}
        {isAdmin && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => navigate("/interviews")} className="gap-2">
                  <FileText className="h-4 w-4" />
                  View All Interviews
                </Button>
                <Button variant="outline" onClick={() => navigate("/analytics")} className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Analytics Dashboard
                </Button>
                <Button variant="outline" onClick={() => navigate("/admin")} className="gap-2">
                  <Users className="h-4 w-4" />
                  Manage Users
                </Button>
                <Button variant="outline" onClick={() => navigate("/admin/team-assignments")} className="gap-2">
                  <Users className="h-4 w-4" />
                  Team Assignments
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Home;