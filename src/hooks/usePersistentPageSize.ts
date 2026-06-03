import { useCallback, useEffect, useState } from "react";

const PREFIX = "lovable:pageSize:";

const read = (key: string, fallback: number): number => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Pagination page-size state persisted to localStorage per logical table.
 * The user's preferred page size sticks across sessions until they change it.
 *
 * @param key  Stable identifier for the table (e.g. "interview-tracking").
 * @param defaultSize Initial page size if no preference has been stored yet.
 */
export function usePersistentPageSize(
  key: string,
  defaultSize = 10,
): [number, (n: number) => void] {
  const [value, setValue] = useState<number>(() => read(key, defaultSize));

  // Cross-tab + cross-instance sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PREFIX + key || e.newValue == null) return;
      const n = Number(e.newValue);
      if (Number.isFinite(n) && n > 0) setValue(n);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const set = useCallback(
    (n: number) => {
      setValue(n);
      try {
        window.localStorage.setItem(PREFIX + key, String(n));
      } catch {
        /* ignore quota / private-mode errors */
      }
    },
    [key],
  );

  return [value, set];
}

export default usePersistentPageSize;