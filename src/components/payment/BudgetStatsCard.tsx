import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, Wallet, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface BudgetStats {
  totalPaid: number;
  totalAdditions: number;
  totalDeductions: number;
  balance: number;
  unmatchedCount: number;
}

interface BudgetStatsCardProps {
  stats: BudgetStats | null;
  isLoading?: boolean;
}

export const BudgetStatsCard = ({ stats, isLoading }: BudgetStatsCardProps) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <Card className="bg-muted/50">
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">No payment data available</p>
        </CardContent>
      </Card>
    );
  }

  const statCards = [
    {
      title: "Total Names Paid",
      value: stats.totalPaid.toLocaleString(),
      icon: DollarSign,
      description: "New payments + additions",
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
    },
    {
      title: "Additions",
      value: `+${stats.totalAdditions.toLocaleString()}`,
      icon: TrendingUp,
      description: "Reworked interviews returned",
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
    },
    {
      title: "Deductions",
      value: `-${stats.totalDeductions.toLocaleString()}`,
      icon: TrendingDown,
      description: "Payments reversed",
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/20",
    },
    {
      title: "Budget Balance",
      value: stats.balance.toLocaleString(),
      icon: Wallet,
      description: "Paid + additions - deductions",
      color: stats.balance >= 0 ? "text-primary" : "text-red-600 dark:text-red-400",
      bgColor: "bg-primary/10",
      borderColor: "border-primary/20",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className={cn("border", stat.borderColor, stat.bgColor)}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={cn("p-2 rounded-full", stat.bgColor)}>
                  <Icon className={cn("h-4 w-4", stat.color)} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={cn("text-2xl font-bold", stat.color)}>
                  {stat.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {stats.unmatchedCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">
            {stats.unmatchedCount} invoice entries could not be matched to interviews in the database
          </span>
        </div>
      )}
    </div>
  );
};

export default BudgetStatsCard;
