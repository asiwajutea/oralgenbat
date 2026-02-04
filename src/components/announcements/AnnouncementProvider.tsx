import { createContext, useContext, useState, useEffect, ReactNode } from "react";
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

export const AnnouncementProvider = ({ children }: AnnouncementProviderProps) => {
  const { user } = useAuth();
  const { pendingAnnouncements, dismissAnnouncement, announcementsLoading } = useAnnouncements();
  const [currentAnnouncement, setCurrentAnnouncement] = useState<Announcement | null>(null);
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [hasShownOnLogin, setHasShownOnLogin] = useState(false);

  // Queue announcements when user logs in
  useEffect(() => {
    if (user && !announcementsLoading && pendingAnnouncements.length > 0 && !hasShownOnLogin) {
      setQueue(pendingAnnouncements);
      setHasShownOnLogin(true);
    }
  }, [user, announcementsLoading, pendingAnnouncements, hasShownOnLogin]);

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

  const hasUnread = pendingAnnouncements.length > 0;

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
