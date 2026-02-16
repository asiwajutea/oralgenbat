import { useCriticalAgentsFraud } from "@/hooks/useFraudAnalytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldCheck, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";

export const CriticalAgentsCard = () => {
  const { data: criticalAgents = [], isLoading } = useCriticalAgentsFraud();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);
  const isMobile = useIsMobile();

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
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
            Critical Fraud Alerts
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
        <CardHeader className="bg-green-50 dark:bg-green-950 py-3 sm:py-4">
          <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300 text-sm sm:text-base">
            <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" />
            Critical Fraud Alerts
            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 text-xs">
              All Clear
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 sm:pt-6">
          <div className="text-center py-4 sm:py-8">
            <ShieldCheck className="h-8 w-8 sm:h-12 sm:w-12 text-green-500 mx-auto mb-2 sm:mb-3" />
            <p className="text-sm text-muted-foreground">
              No critical fraud alerts
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
          <CardHeader className="bg-red-50 dark:bg-red-950 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900 transition-colors py-3 sm:py-4">
            <CardTitle className="flex items-center justify-between text-sm sm:text-base">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
                Critical Fraud Alerts
                <Badge variant="destructive" className="text-xs">{criticalAgents.length}</Badge>
              </div>
              <ChevronDown 
                className="h-4 w-4 sm:h-5 sm:w-5 text-red-700 dark:text-red-300 transition-transform duration-200" 
                style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-4 sm:pt-6">
            <div className="space-y-3">
              {criticalAgents.map((agent) => (
                <div
                  key={agent.interviewer_code}
                  className={`border rounded-lg hover:bg-accent/50 transition-colors ${isMobile ? 'p-3' : 'p-4'}`}
                >
                  {isMobile ? (
                    /* Mobile: vertical stack */
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{agent.interviewer_code}</p>
                          {agent.interviewer_name && (
                            <p className="text-xs text-muted-foreground">{agent.interviewer_name}</p>
                          )}
                        </div>
                        <Badge className={getGradeColor(agent.fraudGrade)}>
                          Grade {agent.fraudGrade}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{agent.contractor_id}</span>
                        <span className="font-bold text-destructive">{agent.overallFraudScore.toFixed(1)}</span>
                      </div>
                      <Button
                        onClick={() => navigate(`/analytics/agent-fraud/${agent.interviewer_code}`)}
                        size="sm"
                        variant="destructive"
                        className="w-full"
                      >
                        View Report
                      </Button>
                    </div>
                  ) : (
                    /* Desktop: horizontal */
                    <div className="flex items-center justify-between">
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
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
              <p className="text-xs sm:text-sm text-red-700 dark:text-red-300">
                <strong>Action Required:</strong> These agents require immediate attention.
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
