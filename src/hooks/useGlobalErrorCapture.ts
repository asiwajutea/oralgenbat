import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useGlobalErrorCapture = () => {
  const { user, userRole } = useAuth();
  const recentErrors = useRef<Map<string, number>>(new Map());
  const DEBOUNCE_MS = 5000;

  const logError = async (
    errorMessage: string,
    errorStack: string | null,
    errorSource: string,
    componentName?: string
  ) => {
    // Debounce: skip if same message was logged within 5s
    const now = Date.now();
    const lastLogged = recentErrors.current.get(errorMessage);
    if (lastLogged && now - lastLogged < DEBOUNCE_MS) return;
    recentErrors.current.set(errorMessage, now);

    // Cleanup old entries
    if (recentErrors.current.size > 100) {
      for (const [key, time] of recentErrors.current.entries()) {
        if (now - time > DEBOUNCE_MS) recentErrors.current.delete(key);
      }
    }

    try {
      await supabase.from("client_error_logs").insert({
        user_id: user?.id || null,
        user_email: user?.email || null,
        user_role: userRole || null,
        error_message: errorMessage.slice(0, 2000),
        error_stack: errorStack?.slice(0, 5000) || null,
        error_source: errorSource,
        page_url: window.location.href,
        component_name: componentName || null,
        browser_info: navigator.userAgent,
      });
    } catch {
      // Silently fail — we can't log errors about logging errors
    }
  };

  useEffect(() => {
    // Capture uncaught errors
    const handleError = (event: ErrorEvent) => {
      logError(
        event.message || "Unknown error",
        event.error?.stack || `at ${event.filename}:${event.lineno}:${event.colno}`,
        "runtime"
      );
    };

    // Capture unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      const message =
        event.reason instanceof Error
          ? event.reason.message
          : typeof event.reason === "string"
          ? event.reason
          : "Unhandled Promise Rejection";
      const stack =
        event.reason instanceof Error ? event.reason.stack || null : null;
      logError(message, stack, "unhandled_rejection");
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [user, userRole]);

  return { logError };
};
