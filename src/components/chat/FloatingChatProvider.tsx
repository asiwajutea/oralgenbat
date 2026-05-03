import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

type FloatingChatContextValue = {
  windows: string[];
  open: (conversationId: string) => void;
  close: (conversationId: string) => void;
};

const FloatingChatContext = createContext<FloatingChatContextValue | null>(null);

export const useFloatingChat = () => {
  const ctx = useContext(FloatingChatContext);
  if (!ctx) throw new Error("useFloatingChat must be used within FloatingChatProvider");
  return ctx;
};

const STORAGE_KEY = "floating-chat-windows";

export const FloatingChatProvider = ({ children }: { children: ReactNode }) => {
  const [windows, setWindows] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(windows)); } catch {}
  }, [windows]);

  const open = useCallback((id: string) => {
    setWindows((w) => (w.includes(id) ? w : [...w, id].slice(-3))); // max 3 visible
  }, []);
  const close = useCallback((id: string) => {
    setWindows((w) => w.filter((x) => x !== id));
  }, []);

  return (
    <FloatingChatContext.Provider value={{ windows, open, close }}>
      {children}
    </FloatingChatContext.Provider>
  );
};