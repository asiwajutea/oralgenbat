import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Shield, AlertCircle, Ban } from "lucide-react";

interface FraudGradeBadgeProps {
  grade: 'A' | 'B' | 'C' | 'D';
  classification: string;
  score: number;
}

export const FraudGradeBadge = ({ grade, classification, score }: FraudGradeBadgeProps) => {
  const getGradeConfig = () => {
    switch (grade) {
      case 'A':
        return {
          bg: 'bg-green-50 dark:bg-green-950',
          border: 'border-green-200 dark:border-green-800',
          text: 'text-green-700 dark:text-green-300',
          icon: Shield,
          iconColor: 'text-green-600',
        };
      case 'B':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-950',
          border: 'border-yellow-200 dark:border-yellow-800',
          text: 'text-yellow-700 dark:text-yellow-300',
          icon: AlertCircle,
          iconColor: 'text-yellow-600',
        };
      case 'C':
        return {
          bg: 'bg-orange-50 dark:bg-orange-950',
          border: 'border-orange-200 dark:border-orange-800',
          text: 'text-orange-700 dark:text-orange-300',
          icon: AlertTriangle,
          iconColor: 'text-orange-600',
        };
      case 'D':
        return {
          bg: 'bg-red-50 dark:bg-red-950',
          border: 'border-red-200 dark:border-red-800',
          text: 'text-red-700 dark:text-red-300',
          icon: Ban,
          iconColor: 'text-red-600',
        };
    }
  };

  const config = getGradeConfig();
  const Icon = config.icon;

  return (
    <Card className={`${config.bg} ${config.border} border-2 p-6`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`p-4 rounded-full ${config.bg}`}>
            <Icon className={`h-8 w-8 ${config.iconColor}`} />
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Fraud Grade</div>
            <div className={`text-6xl font-bold ${config.text}`}>{grade}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-muted-foreground mb-2">Classification</div>
          <Badge variant={grade === 'A' ? 'default' : 'destructive'} className="text-lg px-4 py-2">
            {classification}
          </Badge>
          <div className={`text-3xl font-bold mt-4 ${config.text}`}>
            {score.toFixed(1)}/100
          </div>
          <div className="text-sm text-muted-foreground">Fraud Score</div>
        </div>
      </div>
    </Card>
  );
};