
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart3, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  TrendingUp, 
  Users,
  AlertTriangle,
  RefreshCw,
  Percent
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { 
  useRoleScope, 
  useRoleSummaryStats, 
  useRoleWeeklyTrends,
  useRoleScopedAgents,
  useRoleCriticalAgents
} from "@/hooks/useRoleAnalytics";
import { RoleFraudAlerts } from "@/components/analytics/RoleFraudAlerts";
import { RolePerformanceTable } from "@/components/analytics/RolePerformanceTable";
import { RoleTrendChart } from "@/components/analytics/RoleTrendChart";
import { Navigate } from "react-router-dom";

const SummaryCard = ({ 
  title, 
  value, 
  icon: Icon, 
  description,
  variant = 'default'
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType;
  description?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) => {
  const variantStyles = {
    default: 'bg-card',
    success: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
    warning: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800',
    danger: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
  };

  const iconStyles = {
    default: 'text-muted-foreground',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-red-600',
  };

  return (
    <Card className={variantStyles[variant]}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconStyles[variant]}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
};

const RoleLabel = ({ scopeType }: { scopeType: string }) => {
  const labels: Record<string, { label: string; color: string }> = {
    super_admin: { label: 'Super Admin', color: 'bg-purple-500' },
    admin: { label: 'Admin', color: 'bg-blue-500' },
    contractor: { label: 'Contractor', color: 'bg-green-500' },
    sub_contractor: { label: 'Sub-Contractor', color: 'bg-teal-500' },
    field_manager: { label: 'Field Manager', color: 'bg-orange-500' },
    auditor: { label: 'Auditor', color: 'bg-indigo-500' },
    qa_manager: { label: 'QA Manager', color: 'bg-pink-500' },
    data_entry: { label: 'Data Entry', color: 'bg-gray-500' },
  };

  const config = labels[scopeType] || labels.data_entry;

  return (
    <Badge className={`${config.color} text-white`}>
      {config.label}
    </Badge>
  );
};

const RoleAnalyticsDashboard = () => {
  const { profile } = useAuth();
  
  const { data: scope, isLoading: scopeLoading } = useRoleScope();
  const { data: stats, isLoading: statsLoading } = useRoleSummaryStats(scope);
  const { data: trends = [], isLoading: trendsLoading } = useRoleWeeklyTrends(scope);
  const { data: agents = [], isLoading: agentsLoading } = useRoleScopedAgents(scope);
  const criticalAgents = useRoleCriticalAgents(scope);

  // Redirect super_admin to full analytics dashboard
  if (scope?.scopeType === 'super_admin') {
    return <Navigate to="/analytics" replace />;
  }

  const isLoading = scopeLoading || statsLoading;
  const showFraudSection = scope?.scopeType && !['auditor', 'qa_manager', 'data_entry'].includes(scope.scopeType);
  const showAgentTable = scope?.scopeType && !['auditor', 'qa_manager', 'data_entry'].includes(scope.scopeType);

  const getScopeDescription = () => {
    if (!scope) return '';
    switch (scope.scopeType) {
      case 'field_manager':
        return `Viewing analytics for ${scope.teamCodes.length} team member${scope.teamCodes.length !== 1 ? 's' : ''}`;
      case 'contractor':
      case 'sub_contractor':
        return `Viewing analytics for ${scope.teamCodes.length} agents across ${scope.fieldManagerIds.length} field manager${scope.fieldManagerIds.length !== 1 ? 's' : ''}`;
      case 'admin':
        return `Viewing analytics for assigned field managers and their teams`;
      case 'auditor':
        return 'Viewing your personal review statistics';
      case 'qa_manager':
        return 'Viewing quality metrics and trends';
      case 'data_entry':
        return 'Viewing your data entry performance';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BarChart3 className="h-6 w-6" />
                My Analytics
              </h1>
              {scope && <RoleLabel scopeType={scope.scopeType} />}
            </div>
            <p className="text-muted-foreground text-sm">
              {getScopeDescription()}
            </p>
          </div>
          {profile?.active_contractor_id && (
            <Badge variant="outline" className="self-start">
              Contractor: {profile.active_contractor_id}
            </Badge>
          )}
        </div>

        {/* Summary Stats */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              title="Total Interviews"
              value={stats?.totalInterviews || 0}
              icon={Users}
              description="In your scope"
            />
            <SummaryCard
              title="Pass Rate"
              value={`${(stats?.passRate || 0).toFixed(1)}%`}
              icon={Percent}
              variant={stats?.passRate && stats.passRate >= 85 ? 'success' : stats?.passRate && stats.passRate >= 70 ? 'warning' : 'danger'}
              description="Of reviewed interviews"
            />
            <SummaryCard
              title="Pending Review"
              value={stats?.pendingCount || 0}
              icon={Clock}
              variant={(stats?.pendingCount || 0) > 10 ? 'warning' : 'default'}
              description="Awaiting audit"
            />
            <SummaryCard
              title="Re-Audit Rate"
              value={`${(stats?.reAuditRate || 0).toFixed(1)}%`}
              icon={RefreshCw}
              variant={stats?.reAuditRate && stats.reAuditRate > 10 ? 'danger' : stats?.reAuditRate && stats.reAuditRate > 5 ? 'warning' : 'default'}
              description="Requiring re-review"
            />
          </div>
        )}

        {/* Additional Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard
            title="Passed"
            value={stats?.passedCount || 0}
            icon={CheckCircle2}
            variant="success"
          />
          <SummaryCard
            title="Failed"
            value={stats?.failedCount || 0}
            icon={XCircle}
            variant="danger"
          />
          <SummaryCard
            title="Re-Audits"
            value={stats?.reAuditCount || 0}
            icon={AlertTriangle}
            variant={(stats?.reAuditCount || 0) > 5 ? 'warning' : 'default'}
          />
        </div>

        {/* Fraud Alerts - Only for roles that can see them */}
        {showFraudSection && (
          <RoleFraudAlerts
            criticalAgents={criticalAgents}
            isLoading={agentsLoading}
            title={scope?.scopeType === 'field_manager' ? 'Team Fraud Alerts' : 'Critical Fraud Alerts'}
          />
        )}

        {/* Charts Section */}
        <div className="grid md:grid-cols-2 gap-6">
          <RoleTrendChart
            trends={trends}
            isLoading={trendsLoading}
            title="Weekly Pass Rate Trend"
            showPassRate={true}
          />
          <RoleTrendChart
            trends={trends}
            isLoading={trendsLoading}
            title="Weekly Volume"
            showPassRate={false}
          />
        </div>

        {/* Agent Performance Table */}
        {showAgentTable && (
          <RolePerformanceTable
            agents={agents}
            isLoading={agentsLoading}
            title={scope?.scopeType === 'field_manager' ? 'Team Members' : 'Agent Performance'}
            showFraudColumn={true}
          />
        )}

        {/* Auditor-Specific Section */}
        {scope?.scopeType === 'auditor' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Your Review Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{stats?.passedCount || 0}</p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{stats?.failedCount || 0}</p>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{stats?.totalInterviews || 0}</p>
                  <p className="text-sm text-muted-foreground">Total Reviews</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{(stats?.passRate || 0).toFixed(1)}%</p>
                  <p className="text-sm text-muted-foreground">Approval Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* QA Manager Section */}
        {scope?.scopeType === 'qa_manager' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Quality Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{(stats?.passRate || 0).toFixed(1)}%</p>
                  <p className="text-sm text-muted-foreground">Overall Pass Rate</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{stats?.reAuditCount || 0}</p>
                  <p className="text-sm text-muted-foreground">Re-Audits</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{(stats?.reAuditRate || 0).toFixed(1)}%</p>
                  <p className="text-sm text-muted-foreground">Re-Audit Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data Entry Section */}
        {scope?.scopeType === 'data_entry' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Your Data Entry Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{stats?.passedCount || 0}</p>
                  <p className="text-sm text-muted-foreground">Interviews Completed</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{stats?.totalInterviews || 0}</p>
                  <p className="text-sm text-muted-foreground">Total Processed</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{stats?.pendingCount || 0}</p>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{(stats?.passRate || 0).toFixed(0)}%</p>
                  <p className="text-sm text-muted-foreground">Completion Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
};

export default RoleAnalyticsDashboard;
