import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface UseLockResult {
  isLocked: boolean;
  lockedByOther: boolean;
  lockOwnerId: string | null;
  lockExpiresAt: Date | null;
  remainingSeconds: number;
  acquireLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
  isLoading: boolean;
  hasAbandoned: boolean;
  setAbandoned: (abandoned: boolean) => void;
}

const LOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour

export const useInterviewLock = (auditId: string | undefined): UseLockResult => {
  const { session } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [lockedByOther, setLockedByOther] = useState(false);
  const [lockOwnerId, setLockOwnerId] = useState<string | null>(null);
  const [lockExpiresAt, setLockExpiresAt] = useState<Date | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAbandoned, setHasAbandonedState] = useState(false);

  const userId = session?.user?.id;
  const abandonedKey = `abandoned_review_${auditId}`;

  // Check if this review was abandoned (from session storage)
  useEffect(() => {
    if (auditId) {
      const wasAbandoned = sessionStorage.getItem(abandonedKey) === 'true';
      setHasAbandonedState(wasAbandoned);
    }
  }, [auditId, abandonedKey]);

  // Set abandoned state and persist to session storage
  const setAbandoned = useCallback((abandoned: boolean) => {
    setHasAbandonedState(abandoned);
    if (abandoned && auditId) {
      sessionStorage.setItem(abandonedKey, 'true');
    } else if (auditId) {
      sessionStorage.removeItem(abandonedKey);
    }
  }, [auditId, abandonedKey]);

  // Calculate remaining time from locked_at
  const calculateRemainingSeconds = useCallback((lockedAt: string | null): number => {
    if (!lockedAt) return 0;
    const lockedAtDate = new Date(lockedAt);
    const expiresAt = new Date(lockedAtDate.getTime() + LOCK_DURATION_MS);
    const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    return remaining;
  }, []);

  // Check lock status
  const checkLockStatus = useCallback(async () => {
    if (!auditId) return;

    try {
      const { data, error } = await supabase
        .from("audits")
        .select("locked_by, locked_at, status")
        .eq("id", auditId)
        .single();

      if (error) throw error;

      // Don't lock already reviewed audits
      if (data.status === "Audit Passed" || data.status === "Audit Failed") {
        setIsLocked(false);
        setLockedByOther(false);
        setLockOwnerId(null);
        setLockExpiresAt(null);
        setRemainingSeconds(0);
        return;
      }

      const oneHourAgo = new Date(Date.now() - LOCK_DURATION_MS).toISOString();
      const isLockValid = data.locked_by && data.locked_at && data.locked_at > oneHourAgo;
      
      if (isLockValid) {
        setIsLocked(true);
        setLockOwnerId(data.locked_by);
        setLockedByOther(data.locked_by !== userId);
        
        const expiresAt = new Date(new Date(data.locked_at).getTime() + LOCK_DURATION_MS);
        setLockExpiresAt(expiresAt);
        setRemainingSeconds(calculateRemainingSeconds(data.locked_at));
      } else {
        setIsLocked(false);
        setLockedByOther(false);
        setLockOwnerId(null);
        setLockExpiresAt(null);
        setRemainingSeconds(0);
      }
    } catch (error) {
      console.error("Error checking lock status:", error);
    } finally {
      setIsLoading(false);
    }
  }, [auditId, userId, calculateRemainingSeconds]);

  // Acquire lock
  const acquireLock = useCallback(async (): Promise<boolean> => {
    if (!auditId || !userId) return false;

    // Don't acquire lock if review was abandoned
    if (hasAbandoned) {
      return false;
    }

    try {
      const oneHourAgo = new Date(Date.now() - LOCK_DURATION_MS).toISOString();
      
      // First check current lock status
      const { data: audit, error: fetchError } = await supabase
        .from("audits")
        .select("locked_by, locked_at, status")
        .eq("id", auditId)
        .single();

      if (fetchError) throw fetchError;

      // Don't lock reviewed audits
      if (audit.status === "Audit Passed" || audit.status === "Audit Failed") {
        return true;
      }

      const isLockValid = audit.locked_by && audit.locked_at && audit.locked_at > oneHourAgo;
      const isLockedByMe = audit.locked_by === userId;

      // If locked by someone else and still valid, deny
      if (isLockValid && !isLockedByMe) {
        setLockedByOther(true);
        toast.error("This interview is currently being reviewed by another auditor.");
        return false;
      }

      // Acquire or refresh lock
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("audits")
        .update({
          locked_by: userId,
          locked_at: now,
        })
        .eq("id", auditId);

      if (updateError) throw updateError;

      setIsLocked(true);
      setLockedByOther(false);
      setLockOwnerId(userId);
      
      const expiresAt = new Date(Date.now() + LOCK_DURATION_MS);
      setLockExpiresAt(expiresAt);
      setRemainingSeconds(calculateRemainingSeconds(now));
      
      return true;
    } catch (error) {
      console.error("Error acquiring lock:", error);
      toast.error("Failed to lock interview for review.");
      return false;
    }
  }, [auditId, userId, hasAbandoned, calculateRemainingSeconds]);

  // Release lock
  const releaseLock = useCallback(async (): Promise<void> => {
    if (!auditId || !userId) return;

    try {
      const { error } = await supabase
        .from("audits")
        .update({
          locked_by: null,
          locked_at: null,
        })
        .eq("id", auditId)
        .eq("locked_by", userId); // Only release if we own the lock

      if (error) throw error;

      setIsLocked(false);
      setLockedByOther(false);
      setLockOwnerId(null);
      setLockExpiresAt(null);
      setRemainingSeconds(0);
    } catch (error) {
      console.error("Error releasing lock:", error);
    }
  }, [auditId, userId]);

  // Update countdown every second
  useEffect(() => {
    if (!lockExpiresAt || !isLocked || lockedByOther) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((lockExpiresAt.getTime() - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      
      // If expired, refresh lock status
      if (remaining === 0) {
        checkLockStatus();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockExpiresAt, isLocked, lockedByOther, checkLockStatus]);

  // Refresh lock periodically (every 5 minutes)
  useEffect(() => {
    if (!auditId || !userId || lockedByOther || hasAbandoned) return;

    const refreshInterval = setInterval(async () => {
      if (isLocked && lockOwnerId === userId) {
        const now = new Date().toISOString();
        await supabase
          .from("audits")
          .update({ locked_at: now })
          .eq("id", auditId)
          .eq("locked_by", userId);
        
        const expiresAt = new Date(Date.now() + LOCK_DURATION_MS);
        setLockExpiresAt(expiresAt);
        setRemainingSeconds(3600); // Reset to full hour
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, [auditId, userId, isLocked, lockOwnerId, lockedByOther, hasAbandoned]);

  // Initial check
  useEffect(() => {
    checkLockStatus();
  }, [checkLockStatus]);

  return {
    isLocked,
    lockedByOther,
    lockOwnerId,
    lockExpiresAt,
    remainingSeconds,
    acquireLock,
    releaseLock,
    isLoading,
    hasAbandoned,
    setAbandoned,
  };
};
