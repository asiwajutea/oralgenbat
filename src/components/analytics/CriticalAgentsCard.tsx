import { useCriticalAgentsFraud } from "@/hooks/useFraudAnalytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

export const CriticalAgentsCard = () => {
  const { data: criticalAgents = [], isLoading } = useCriticalAgentsFraud();
  const navigate = useNavigate();

  const getGradeColor = (grade: 'A' | 'B' | 'C' | 'D') => {
    switch (grade) {
      case 'D': return 'bg-destructive text-destructive-foreground';
      case 'C': return 'bg-orange-500 text-white';
      case 'B': return 'bg-yellow-500 text-black';
      case 'A': return 'bg-green-500 text-white';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Critical Fraud Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (criticalAgents.length === 0) {
    return (
      <Card className="border-green-200 dark:border-green-800">
        <CardHeader className="bg-green-50 dark:bg-green-950">
          <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <ShieldCheck className="h-5 w-5" />
            Critical Fraud Alerts
            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
              All Clear
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <ShieldCheck className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-muted-foreground">
              No critical fraud alerts - all agents within acceptable thresholds
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-200 dark:border-red-800">
      <CardHeader className="bg-red-50 dark:bg-red-950">
        <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <AlertTriangle className="h-5 w-5" />
          Critical Fraud Alerts
          <Badge variant="destructive">{criticalAgents.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-3">
          {criticalAgents.map((agent) => (
            <div
              key={agent.interviewer_code}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-semibold">{agent.interviewer_code}</p>
                    {agent.interviewer_name && (
                      <p className="text-sm text-muted-foreground">{agent.interviewer_name}</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="text-right mr-2">
                  <p className="text-sm text-muted-foreground">Contractor</p>
                  <p className="font-medium text-sm">{agent.contractor_id}</p>
                </div>
                
                <Badge className={getGradeColor(agent.fraudGrade)}>
                  Grade {agent.fraudGrade}
                </Badge>
                
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Score</p>
                  <p className="font-bold text-lg text-destructive">
                    {agent.overallFraudScore.toFixed(1)}
                  </p>
                </div>
                
                <Button
                  onClick={() => navigate(`/analytics/agent-fraud/${agent.interviewer_code}`)}
                  size="sm"
                  variant="destructive"
                >
                  View Report
                </Button>
              </div>
            </div>
          ))}
        </div>
        
        {criticalAgents.length > 0 && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">
              <strong>Action Required:</strong> These agents require immediate attention. 
              Review fraud reports and take appropriate action.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
