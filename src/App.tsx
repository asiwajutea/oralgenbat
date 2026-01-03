import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import { FieldManagerRoute } from "@/components/FieldManagerRoute";
import { ContractorRoute } from "@/components/ContractorRoute";
import { ApproverRoute } from "@/components/ApproverRoute";
import Layout from "@/components/Layout";
import Index from "./pages/Index";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/pending-approval" element={<PendingApproval />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Index />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/review/:auditId"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ReviewInterview />
                  </Layout>
                </ProtectedRoute>
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
                <AdminRoute>
                  <Layout>
                    <AdminReviewHistory />
                  </Layout>
                </AdminRoute>
              }
            />
            <Route
              path="/admin/locked-interviews"
              element={
                <AdminRoute>
                  <LockedInterviews />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/team-assignments"
              element={
                <AdminRoute>
                  <Layout>
                    <TeamAssignments />
                  </Layout>
                </AdminRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
