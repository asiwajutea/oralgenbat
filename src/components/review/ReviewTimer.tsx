import { useState, useEffect, useRef } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ReviewTimerProps {
  isActive: boolean;
  onTimeUpdate?: (seconds: number) => void;
}

export const ReviewTimer = ({ isActive, onTimeUpdate }: ReviewTimerProps) => {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<Date | null>(null);

  useEffect(() => {
    if (isActive) {
      startTimeRef.current = new Date();
      
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

export const useReviewTimer = (isActive: boolean) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  return {
    elapsedSeconds,
    setElapsedSeconds,
    Timer: (
      <ReviewTimer
        isActive={isActive}
        onTimeUpdate={setElapsedSeconds}
      />
    ),
  };
};
