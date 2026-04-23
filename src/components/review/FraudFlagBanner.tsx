import { AlertTriangle, ExternalLink } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Link } from "react-router-dom";

export interface FraudCollision {
  audit_id: string;
  file_name: string;
  total_names: number | null;
  interview_time: string;
  minutes_apart: number;
}

interface FraudFlagBannerProps {
  isFlagged: boolean;
  collisions: FraudCollision[];
  isLoading?: boolean;
}

const formatTime = (t: string) => {
  // t is "HH:MM:SS" or "HH:MM"
  const parts = t.split(":");
  if (parts.length < 2) return t;
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m} ${ampm}`;
};

export const FraudFlagBanner = ({ isFlagged, collisions, isLoading }: FraudFlagBannerProps) => {
  if (isLoading || !isFlagged || !collisions?.length) return null;

  return (
    <Alert variant="destructive" className="border-destructive/60 bg-destructive/5">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="text-sm">
        Possible fraud detected — same agent ran another interview within 30 minutes
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-1.5">
        {collisions.map((c) => (
          <div key={c.audit_id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <Link
              to={`/review/${c.audit_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-medium underline underline-offset-2 hover:opacity-80 inline-flex items-center gap-1"
            >
              {c.file_name}
              <ExternalLink className="h-3 w-3" />
            </Link>
            <span className="text-muted-foreground">·</span>
            <span>{c.total_names ?? "?"} names</span>
            <span className="text-muted-foreground">·</span>
            <span>{formatTime(c.interview_time)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium">{c.minutes_apart} min apart</span>
          </div>
        ))}
      </AlertDescription>
    </Alert>
  );
};