import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
const WARNING_TIME = 60 * 1000; // Show warning 60 seconds before logout

interface UseInactivityLogoutReturn {
  showWarning: boolean;
  countdown: number;
  resetTimer: () => void;
}

export const useInactivityLogout = (): UseInactivityLogoutReturn => {
  const { signOut, user } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const clearAllTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    clearAllTimers();
    setShowWarning(false);
    await signOut("inactivity");
  }, [signOut, clearAllTimers]);

  const startCountdown = useCallback(() => {
    setShowWarning(true);
    setCountdown(60);
    
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [handleLogout]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    clearAllTimers();
    setShowWarning(false);
    setCountdown(60);

    if (!user) return;

    // Set warning timeout (14 minutes)
    warningTimeoutRef.current = setTimeout(() => {
      startCountdown();
    }, INACTIVITY_TIMEOUT - WARNING_TIME);

    // Set logout timeout (15 minutes) as backup
    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, INACTIVITY_TIMEOUT);
  }, [user, clearAllTimers, startCountdown, handleLogout]);

  useEffect(() => {
    if (!user) {
      clearAllTimers();
      return;
    }

    // Activity events to track
    const events = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    // Throttled reset to avoid excessive resets
    let throttleTimeout: ReturnType<typeof setTimeout> | null = null;
    const throttledReset = () => {
      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          throttleTimeout = null;
          resetTimer();
        }, 1000); // Throttle to max once per second
      }
    };

    // Add event listeners
    events.forEach((event) => {
      document.addEventListener(event, throttledReset, { passive: true });
    });

    // Initial timer start
    resetTimer();

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, throttledReset);
      });
      if (throttleTimeout) {
        clearTimeout(throttleTimeout);
      }
      clearAllTimers();
    };
  }, [user, resetTimer, clearAllTimers]);

  return {
    showWarning,
    countdown,
    resetTimer,
  };
};
