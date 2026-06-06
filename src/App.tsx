import { lazy, Suspense } from "react";
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
import { FloatingChatProvider } from "@/components/chat/FloatingChatProvider";
import { FloatingChats } from "@/components/chat/MiniChatWindow";
import { ChatToastListener } from "@/components/chat/ChatToastListener";
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
import FraudAnalyticsRoute from "@/components/FraudAnalyticsRoute";
import Layout from "@/components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import { PageLoader } from "@/components/PageLoader";

// Route-level code splitting: each page is loaded on demand so the initial
// bundle only contains the app shell + the route the user actually visits.
const Index = lazy(() => import("./pages/Index"));
const Home = lazy(() => import("./pages/Home"));
const ReviewInterview = lazy(() => import("./pages/ReviewInterview"));
const Auth = lazy(() => import("./pages/Auth"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AnalyticsDashboard = lazy(() => import("./pages/AnalyticsDashboard"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const TeamManagement = lazy(() => import("./pages/TeamManagement"));
const TeamApprovals = lazy(() => import("./pages/TeamApprovals"));
const FieldManagerDashboard = lazy(() => import("./pages/FieldManagerDashboard"));
const ContractorDashboard = lazy(() => import("./pages/ContractorDashboard"));
const AgentFraudAnalysis = lazy(() => import("./pages/AgentFraudAnalysis"));
const ReviewHistory = lazy(() => import("./pages/ReviewHistory"));
const AdminReviewHistory = lazy(() => import("./pages/AdminReviewHistory"));
const LockedInterviews = lazy(() => import("./pages/LockedInterviews"));
const TeamAssignments = lazy(() => import("./pages/TeamAssignments"));
const DataEntryPortal = lazy(() => import("./pages/DataEntryPortal"));
const FlaggedIssuesHistory = lazy(() => import("./pages/FlaggedIssuesHistory"));
const InterviewTracking = lazy(() => import("./pages/InterviewTracking"));
const ZipDiagnostics = lazy(() => import("./pages/ZipDiagnostics"));
const Achievements = lazy(() => import("./pages/Achievements"));
const SubContractorTeamManagement = lazy(() => import("./pages/SubContractorTeamManagement"));
const RoleAnalyticsDashboard = lazy(() => import("./pages/RoleAnalyticsDashboard"));
const SmsLogs = lazy(() => import("./pages/SmsLogs"));
const PaymentTracking = lazy(() => import("./pages/PaymentTracking"));
const FraudAnalyticsDashboard = lazy(() => import("./pages/FraudAnalyticsDashboard"));
const NoticeBoard = lazy(() => import("./pages/NoticeBoard"));
const AccountSuspended = lazy(() => import("./pages/AccountSuspended"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const DuplicateInterviews = lazy(() => import("./pages/DuplicateInterviews"));
const BurnQueue = lazy(() => import("./pages/BurnQueue"));
const UploadTrackingDashboard = lazy(() => import("./pages/UploadTrackingDashboard"));
const ErrorConsole = lazy(() => import("./pages/ErrorConsole"));
const AISettings = lazy(() => import("./pages/AISettings"));
const UserActivity = lazy(() => import("./pages/UserActivity"));
const Inbox = lazy(() => import("./pages/Inbox"));
const ChatPolicies = lazy(() => import("./pages/ChatPolicies"));
const UploadControls = lazy(() => import("./pages/UploadControls"));
const UploadCenter = lazy(() => import("./pages/UploadCenter"));
const PenaltyAdmin = lazy(() => import("./pages/PenaltyAdmin"));
const MyPenalties = lazy(() => import("./pages/MyPenalties"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
        <ErrorBoundary>
        <OfflineIndicator />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <PresenceProvider>
            <FloatingChatProvider>
            <ChatToastListener />
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
            <Route path="/pending-approval" element={<PendingApproval />} />
            <Route path="/account-suspended" element={<AccountSuspended />} />
            <Route path="/reset-password" element={<ResetPassword />} />
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
              path="/admin/sms-logs"
              element={
                <FullAdminRoute>
                  <Layout>
                    <SmsLogs />
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
              path="/payment-tracking"
              element={
                <ProtectedRoute>
                  <TrackingRoute>
                    <Layout>
                      <PaymentTracking />
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
              path="/notices"
              element={
                <ProtectedRoute>
                  <Layout>
                    <NoticeBoard />
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
            <Route
              path="/fraud-analytics"
              element={
                <ProtectedRoute>
                  <FraudAnalyticsRoute>
                    <Layout>
                      <FraudAnalyticsDashboard />
                    </Layout>
                  </FraudAnalyticsRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/duplicates"
              element={
                <FullAdminRoute>
                  <Layout>
                    <DuplicateInterviews />
                  </Layout>
                </FullAdminRoute>
              }
            />
            <Route
              path="/burn-queue"
              element={
                <ProtectedRoute>
                  <TrackingRoute>
                    <Layout>
                      <BurnQueue />
                    </Layout>
                  </TrackingRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/upload-tracking"
              element={
                <ProtectedRoute>
                  <Layout>
                    <UploadTrackingDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route
              path="/admin/error-console"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ErrorConsole />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/ai-settings"
              element={
                <ProtectedRoute>
                  <Layout>
                    <AISettings />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/activity"
              element={
                <ProtectedRoute>
                  <Layout>
                    <UserActivity />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/activity/:userId"
              element={
                <ProtectedRoute>
                  <Layout>
                    <UserActivity />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inbox"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Inbox />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/chat-policies"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ChatPolicies />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/upload-controls"
              element={
                <FullAdminRoute>
                  <Layout>
                    <UploadControls />
                  </Layout>
                </FullAdminRoute>
              }
            />
            <Route
              path="/upload-center"
              element={
                <ProtectedRoute>
                  <Layout>
                    <UploadCenter />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/penalties"
              element={
                <ProtectedRoute>
                  <Layout>
                    <PenaltyAdmin />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-penalties"
              element={
                <ProtectedRoute>
                  <Layout>
                    <MyPenalties />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
            </Suspense>
            <FloatingChats />
            </FloatingChatProvider>
            </PresenceProvider>
            <PWAInstallPrompt />
          </AuthProvider>
        </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
