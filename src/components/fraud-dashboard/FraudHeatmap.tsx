import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AgentFraudProfile } from "@/utils/fraudCalculations";

interface Props {
  profiles: AgentFraudProfile[];
}

const getHeatColor = (score: number) => {
  if (score < 20) return 'bg-green-500/80';
  if (score < 40) return 'bg-yellow-500/80';
  if (score < 70) return 'bg-orange-500/80';
  return 'bg-red-500/80';
};

export const FraudHeatmap = ({ profiles }: Props) => {
  const sorted = [...profiles].sort((a, b) => b.overallFraudScore - a.overallFraudScore);
  const isMobile = useIsMobile();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Agent Fraud Score Heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
        ) : (
          <div className={`grid gap-1 ${isMobile ? 'grid-cols-5' : 'grid-cols-6 sm:grid-cols-8 md:grid-cols-10'}`}>
            {sorted.slice(0, 100).map(p => (
              <Tooltip key={p.interviewer_code}>
                <TooltipTrigger asChild>
                  <div className={`aspect-square rounded-sm ${getHeatColor(p.overallFraudScore)} cursor-pointer flex items-center justify-center`}>
                    <span className="text-[9px] font-bold text-white truncate px-0.5">
                      {p.interviewer_code.slice(-3)}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{p.interviewer_code}</p>
                  <p className="text-xs">Score: {p.overallFraudScore.toFixed(1)} | Grade: {p.fraudGrade}</p>
                  <p className="text-xs">{p.total_interviews} interviews</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500/80" /> Safe</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-500/80" /> Caution</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-500/80" /> High Risk</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500/80" /> Critical</span>
        </div>
      </CardContent>
    </Card>
  );
};
