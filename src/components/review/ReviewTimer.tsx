import { useState, useEffect, useRef } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ReviewTimerProps {
  isActive: boolean;
  initialSeconds?: number;
  onTimeUpdate?: (seconds: number) => void;
}

export const ReviewTimer = ({ isActive, initialSeconds = 0, onTimeUpdate }: ReviewTimerProps) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef = useRef(false);

  // Update seconds when initialSeconds changes (e.g., from database)
  useEffect(() => {
    if (initialSeconds > 0 && !initializedRef.current) {
      setSeconds(initialSeconds);
      onTimeUpdate?.(initialSeconds);
      initializedRef.current = true;
    }
  }, [initialSeconds, onTimeUpdate]);

  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => {
          const newSeconds = prev + 1;
          onTimeUpdate?.(newSeconds);
          return newSeconds;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, onTimeUpdate]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  if (!isActive) return null;

  return (
    <Badge variant="outline" className="gap-1.5 font-mono text-xs">
      <Clock className="h-3 w-3" />
      {formatTime(seconds)}
    </Badge>
  );
};

export const useReviewTimer = (isActive: boolean, reviewStartedAt?: Date | null) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Calculate initial seconds from reviewStartedAt
  const initialSeconds = reviewStartedAt 
    ? Math.floor((Date.now() - reviewStartedAt.getTime()) / 1000)
    : 0;

  return {
    elapsedSeconds,
    setElapsedSeconds,
    initialSeconds,
    TimerComponent: ReviewTimer,
  };
};
