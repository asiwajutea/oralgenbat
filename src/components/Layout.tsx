import { ReactNode } from "react";
import Header from "@/components/Header";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import { AnnouncementProvider } from "@/components/announcements/AnnouncementProvider";
import { useGlobalErrorCapture } from "@/hooks/useGlobalErrorCapture";
import UnassignedAgentNagModal from "@/components/UnassignedAgentNagModal";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  useGlobalErrorCapture();
  return (
    <AnnouncementProvider>
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1">
          {children}
        </main>
        <PushNotificationPrompt />
        <PWAUpdatePrompt />
        <UnassignedAgentNagModal />
      </div>
    </AnnouncementProvider>
  );
};

export default Layout;
