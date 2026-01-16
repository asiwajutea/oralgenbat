import { ReactNode } from "react";
import Header from "@/components/Header";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        {children}
      </main>
      <PushNotificationPrompt />
      <PWAUpdatePrompt />
    </div>
  );
};

export default Layout;
