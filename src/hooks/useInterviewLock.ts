import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface UseLockResult {
  isLocked: boolean;
  lockedByOther: boolean;
  lockOwnerId: string | null;
  acquireLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
  isLoading: boolean;
}

export const useInterviewLock = (auditId: string | undefined): UseLockResult => {
  const { session } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [lockedByOther, setLockedByOther] = useState(false);
  const [lockOwnerId, setLockOwnerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const userId = session?.user?.id;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

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
        return;
      }

      const isLockValid = data.locked_by && data.locked_at && data.locked_at > oneHourAgo;
      
      if (isLockValid) {
        setIsLocked(true);
        setLockOwnerId(data.locked_by);
        setLockedByOther(data.locked_by !== userId);
      } else {
        setIsLocked(false);
        setLockedByOther(false);
        setLockOwnerId(null);
      }
    } catch (error) {
      console.error("Error checking lock status:", error);
    } finally {
      setIsLoading(false);
    }
  }, [auditId, userId, oneHourAgo]);

  // Acquire lock
  const acquireLock = useCallback(async (): Promise<boolean> => {
    if (!auditId || !userId) return false;

    try {
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
      const { error: updateError } = await supabase
        .from("audits")
        .update({
          locked_by: userId,
          locked_at: new Date().toISOString(),
        })
        .eq("id", auditId);

      if (updateError) throw updateError;

      setIsLocked(true);
      setLockedByOther(false);
      setLockOwnerId(userId);
      return true;
    } catch (error) {
      console.error("Error acquiring lock:", error);
      toast.error("Failed to lock interview for review.");
      return false;
    }
  }, [auditId, userId, oneHourAgo]);

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
    } catch (error) {
      console.error("Error releasing lock:", error);
    }
  }, [auditId, userId]);

  // Refresh lock periodically (every 5 minutes)
  useEffect(() => {
    if (!auditId || !userId || lockedByOther) return;

    const refreshInterval = setInterval(async () => {
      if (isLocked && lockOwnerId === userId) {
        await supabase
          .from("audits")
          .update({ locked_at: new Date().toISOString() })
          .eq("id", auditId)
          .eq("locked_by", userId);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, [auditId, userId, isLocked, lockOwnerId, lockedByOther]);

  // Initial check
  useEffect(() => {
    checkLockStatus();
  }, [checkLockStatus]);

  return {
    isLocked,
    lockedByOther,
    lockOwnerId,
    acquireLock,
    releaseLock,
    isLoading,
  };
};
