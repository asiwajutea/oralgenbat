import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { PresenceProvider } from "@/components/PresenceProvider";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import FullAdminRoute from "@/components/FullAdminRoute";
import NonSubContractorRoute from "@/components/NonSubContractorRoute";
import { FieldManagerRoute } from "@/components/FieldManagerRoute";
import { ContractorRoute } from "@/components/ContractorRoute";
import { ApproverRoute } from "@/components/ApproverRoute";
import { DataEntryRoute } from "@/components/DataEntryRoute";
import { TrackingRoute } from "@/components/TrackingRoute";
import { SubContractorRoute } from "@/components/SubContractorRoute";
import Layout from "@/components/Layout";
import Index from "./pages/Index";
import Home from "./pages/Home";
import ReviewInterview from "./pages/ReviewInterview";
import Auth from "./pages/Auth";
import PendingApproval from "./pages/PendingApproval";
import AdminDashboard from "./pages/AdminDashboard";
import AnalyticsDashboard from "./pages/AnalyticsDashboard";
import UserProfile from "./pages/UserProfile";
import TeamManagement from "./pages/TeamManagement";
import TeamApprovals from "./pages/TeamApprovals";
import FieldManagerDashboard from "./pages/FieldManagerDashboard";
import ContractorDashboard from "./pages/ContractorDashboard";
import AgentFraudAnalysis from "./pages/AgentFraudAnalysis";
import ReviewHistory from "./pages/ReviewHistory";
import AdminReviewHistory from "./pages/AdminReviewHistory";
import LockedInterviews from "./pages/LockedInterviews";
import TeamAssignments from "./pages/TeamAssignments";
import DataEntryPortal from "./pages/DataEntryPortal";
import FlaggedIssuesHistory from "./pages/FlaggedIssuesHistory";
import InterviewTracking from "./pages/InterviewTracking";
import ZipDiagnostics from "./pages/ZipDiagnostics";
import Achievements from "./pages/Achievements";
import SubContractorTeamManagement from "./pages/SubContractorTeamManagement";
import RoleAnalyticsDashboard from "./pages/RoleAnalyticsDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false, // Don't refetch when component mounts
      staleTime: Infinity, // Data never goes stale - only manual refresh
      refetchInterval: false, // Disable periodic refetching
      gcTime: 1000 * 60 * 30, // Keep data in cache for 30 minutes
      retry: 1, // Reduce retries to avoid perceived reloads
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <OfflineIndicator />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <PresenceProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
            <Route path="/pending-approval" element={<PendingApproval />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Home />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/interviews"
              element={
                <NonSubContractorRoute>
                  <Layout>
                    <Index />
                  </Layout>
                </NonSubContractorRoute>
              }
            />
            <Route
              path="/review/:auditId"
              element={
                <NonSubContractorRoute>
                  <Layout>
                    <ReviewInterview />
                  </Layout>
                </NonSubContractorRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Layout>
                    <AdminDashboard />
                  </Layout>
                </AdminRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <AdminRoute>
                  <AnalyticsDashboard />
                </AdminRoute>
              }
            />
            <Route
              path="/analytics/agent-fraud/:interviewerCode"
              element={
                <AdminRoute>
                  <AgentFraudAnalysis />
                </AdminRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Layout>
                    <UserProfile />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/team-management"
              element={
                <ProtectedRoute>
                  <FieldManagerRoute>
                    <TeamManagement />
                  </FieldManagerRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/field-manager-dashboard"
              element={
                <ProtectedRoute>
                  <FieldManagerRoute>
                    <FieldManagerDashboard />
                  </FieldManagerRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/contractor-dashboard"
              element={
                <ProtectedRoute>
                  <ContractorRoute>
                    <ContractorDashboard />
                  </ContractorRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/team-approvals"
              element={
                <ProtectedRoute>
                  <ApproverRoute>
                    <TeamApprovals />
                  </ApproverRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/review-history"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ReviewHistory />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/review-history"
              element={
                <FullAdminRoute>
                  <Layout>
                    <AdminReviewHistory />
                  </Layout>
                </FullAdminRoute>
              }
            />
            <Route
              path="/admin/locked-interviews"
              element={
                <FullAdminRoute>
                  <LockedInterviews />
                </FullAdminRoute>
              }
            />
            <Route
              path="/admin/team-assignments"
              element={
                <FullAdminRoute>
                  <Layout>
                    <TeamAssignments />
                  </Layout>
                </FullAdminRoute>
              }
            />
            <Route
              path="/admin/zip-diagnostics"
              element={
                <FullAdminRoute>
                  <Layout>
                    <ZipDiagnostics />
                  </Layout>
                </FullAdminRoute>
              }
            />
            <Route
              path="/data-entry"
              element={
                <DataEntryRoute>
                  <Layout>
                    <DataEntryPortal />
                  </Layout>
                </DataEntryRoute>
              }
            />
            <Route
              path="/data-entry/flagged-issues"
              element={
                <DataEntryRoute>
                  <Layout>
                    <FlaggedIssuesHistory />
                  </Layout>
                </DataEntryRoute>
              }
            />
            <Route
              path="/interview-tracking"
              element={
                <ProtectedRoute>
                  <TrackingRoute>
                    <Layout>
                      <InterviewTracking />
                    </Layout>
                  </TrackingRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/subcontractor-team-management"
              element={
                <ProtectedRoute>
                  <SubContractorRoute>
                    <SubContractorTeamManagement />
                  </SubContractorRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/achievements"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Achievements />
              </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-analytics"
              element={
                <ProtectedRoute>
                  <Layout>
                    <RoleAnalyticsDashboard />
              </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-analytics/agent/:interviewerCode"
              element={
                <ProtectedRoute>
                  <Layout>
                    <AgentFraudAnalysis />
                  </Layout>
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
            </PresenceProvider>
            <PWAInstallPrompt />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
