import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldCheck, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { ScopedAgent } from "@/hooks/useRoleAnalytics";

interface RoleFraudAlertsProps {
  criticalAgents: ScopedAgent[];
  isLoading?: boolean;
  title?: string;
}

export const RoleFraudAlerts = ({ 
  criticalAgents, 
  isLoading = false,
  title = "Team Fraud Alerts"
}: RoleFraudAlertsProps) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);

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
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
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
            {title}
            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
              All Clear
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="text-center py-6">
            <ShieldCheck className="h-10 w-10 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No critical fraud alerts in your scope
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-red-200 dark:border-red-800">
        <CollapsibleTrigger asChild>
          <CardHeader className="bg-red-50 dark:bg-red-950 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900 transition-colors">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="h-5 w-5" />
                {title}
                <Badge variant="destructive">{criticalAgents.length}</Badge>
              </div>
              <ChevronDown 
                className="h-5 w-5 text-red-700 dark:text-red-300 transition-transform duration-200" 
                style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-4">
            <div className="space-y-2">
              {criticalAgents.map((agent) => (
                <div
                  key={agent.interviewer_code}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{agent.interviewer_code}</p>
                    {agent.interviewer_name && (
                      <p className="text-xs text-muted-foreground truncate">{agent.interviewer_name}</p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge className={getGradeColor(agent.fraudGrade)}>
                      {agent.fraudGrade}
                    </Badge>
                    
                    <div className="text-right min-w-[50px]">
                      <p className="text-xs text-muted-foreground">Score</p>
                      <p className="font-bold text-destructive">
                        {agent.overallFraudScore.toFixed(0)}
                      </p>
                    </div>
                    
                    <Button
                      onClick={() => navigate(`/analytics/agent-fraud/${agent.interviewer_code}`)}
                      size="sm"
                      variant="destructive"
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-3 p-2 bg-red-50 dark:bg-red-950 rounded-lg">
              <p className="text-xs text-red-700 dark:text-red-300">
                <strong>Action Required:</strong> Review these agents' fraud reports.
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
