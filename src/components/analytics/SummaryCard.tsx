import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryCardProps {
  title: string;
  value: string | number;
  trend?: number;
  suffix?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}

export const SummaryCard = ({ title, value, trend, suffix, icon, loading }: SummaryCardProps) => {
  const getTrendIcon = () => {
    if (!trend || trend === 0) return <Minus className="h-4 w-4" />;
    return trend > 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  const getTrendColor = () => {
    if (!trend || trend === 0) return "text-muted-foreground";
    return trend > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-24 mb-2"></div>
            <div className="h-8 bg-muted rounded w-32"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <h3 className="text-3xl font-bold">
                {value}
                {suffix && <span className="text-lg ml-1">{suffix}</span>}
              </h3>
            </div>
            {trend !== undefined && (
              <div className={cn("flex items-center gap-1 mt-2 text-sm font-medium", getTrendColor())}>
                {getTrendIcon()}
                <span>{Math.abs(trend).toFixed(1)}%</span>
                <span className="text-muted-foreground text-xs">vs prev period</span>
              </div>
            )}
          </div>
          {icon && (
            <div className="p-3 bg-primary/10 rounded-lg text-primary">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
