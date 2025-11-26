import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActionPlanCardProps {
  actionPlan: {
    immediate: string[];
    shortTerm: string[];
    escalation: string | null;
  };
}

export const ActionPlanCard = ({ actionPlan }: ActionPlanCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommended Action Plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Escalation Alert */}
        {actionPlan.escalation && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold">ESCALATION REQUIRED</div>
              <p className="mt-1">{actionPlan.escalation}</p>
            </AlertDescription>
          </Alert>
        )}

        {/* Immediate Actions */}
        <div>
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500"></span>
            Immediate Actions
          </h4>
          <ul className="space-y-2">
            {actionPlan.immediate.map((action, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <Circle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Short-term Actions */}
        <div>
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
            Short-term Recommendations
          </h4>
          <ul className="space-y-2">
            {actionPlan.shortTerm.map((action, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <Circle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>

        <Button className="w-full" variant="outline">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Mark as Reviewed
        </Button>
      </CardContent>
    </Card>
  );
};