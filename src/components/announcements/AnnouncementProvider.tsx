import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { useAnnouncements, Announcement } from "@/hooks/useAnnouncements";
import { useAuth } from "@/contexts/AuthContext";
import { AnnouncementModal } from "./AnnouncementModal";

interface AnnouncementContextType {
  hasUnread: boolean;
  currentAnnouncement: Announcement | null;
  dismissCurrent: (acknowledged: boolean) => void;
  showAnnouncement: (announcement: Announcement) => void;
}

const AnnouncementContext = createContext<AnnouncementContextType>({
  hasUnread: false,
  currentAnnouncement: null,
  dismissCurrent: () => {},
  showAnnouncement: () => {},
});

export const useAnnouncementContext = () => useContext(AnnouncementContext);

interface AnnouncementProviderProps {
  children: ReactNode;
}

const SESSION_STORAGE_KEY = 'announcements_shown_this_session';

// Helper to get shown IDs from session storage
const getShownThisSession = (): string[] => {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Helper to add ID to session storage
const addShownThisSession = (id: string) => {
  try {
    const ids = getShownThisSession();
    if (!ids.includes(id)) {
      ids.push(id);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(ids));
    }
  } catch {
    // Ignore session storage errors
  }
};

export const AnnouncementProvider = ({ children }: AnnouncementProviderProps) => {
  const { user } = useAuth();
  const { announcements, pendingAnnouncements, dismissAnnouncement, announcementsLoading, dismissals } = useAnnouncements();
  const [currentAnnouncement, setCurrentAnnouncement] = useState<Announcement | null>(null);
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [hasShownOnLogin, setHasShownOnLogin] = useState(false);

  // Get "every_login" announcements that haven't been shown this session
  const everyLoginAnnouncements = useMemo(() => {
    if (!user || announcementsLoading) return [];
    
    const shownThisSession = getShownThisSession();
    
    return announcements.filter(a => {
      // Must be every_login type
      if (a.display_frequency !== "every_login") return false;
      
      // Check expiry
      if (a.expires_at && new Date(a.expires_at) < new Date()) return false;
      
      // Check scheduled
      if (a.scheduled_at && new Date(a.scheduled_at) > new Date()) return false;
      
      // Check if already shown this session
      if (shownThisSession.includes(a.id)) return false;
      
      return true;
    });
  }, [announcements, user, announcementsLoading]);

  // Combine pending (once/daily/weekly that need showing) with every_login announcements
  const allAnnouncementsToShow = useMemo(() => {
    // Merge pending and every_login, avoiding duplicates
    const combined = [...pendingAnnouncements];
    everyLoginAnnouncements.forEach(a => {
      if (!combined.find(p => p.id === a.id)) {
        combined.push(a);
      }
    });
    
    // Sort by priority (highest first)
    return combined.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [pendingAnnouncements, everyLoginAnnouncements]);

  // Queue announcements when user logs in
  useEffect(() => {
    if (user && !announcementsLoading && allAnnouncementsToShow.length > 0 && !hasShownOnLogin) {
      setQueue(allAnnouncementsToShow);
      setHasShownOnLogin(true);
    }
  }, [user, announcementsLoading, allAnnouncementsToShow, hasShownOnLogin]);

  // Reset on logout
  useEffect(() => {
    if (!user) {
      setHasShownOnLogin(false);
      setQueue([]);
      setCurrentAnnouncement(null);
    }
  }, [user]);

  // Show next announcement from queue
  useEffect(() => {
    if (!currentAnnouncement && queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrentAnnouncement(next);
      setQueue(rest);
    }
  }, [currentAnnouncement, queue]);

  const dismissCurrent = (acknowledged: boolean) => {
    if (currentAnnouncement) {
      // Track in session storage for every_login type
      if (currentAnnouncement.display_frequency === 'every_login') {
        addShownThisSession(currentAnnouncement.id);
      }
      
      // Persist dismissal to database
      dismissAnnouncement({
        announcementId: currentAnnouncement.id,
        acknowledged,
      });
      setCurrentAnnouncement(null);
    }
  };

  const showAnnouncement = (announcement: Announcement) => {
    setCurrentAnnouncement(announcement);
  };

  const hasUnread = allAnnouncementsToShow.length > 0;

  return (
    <AnnouncementContext.Provider
      value={{
        hasUnread,
        currentAnnouncement,
        dismissCurrent,
        showAnnouncement,
      }}
    >
      {children}
      {currentAnnouncement && (
        <AnnouncementModal
          announcement={currentAnnouncement}
          onDismiss={dismissCurrent}
        />
      )}
    </AnnouncementContext.Provider>
  );
};
