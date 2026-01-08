import { usePresence } from "@/hooks/usePresence";
import { useAuth } from "@/contexts/AuthContext";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { InactivityWarningDialog } from "@/components/InactivityWarningDialog";

interface PresenceProviderProps {
  children: React.ReactNode;
}

export const PresenceProvider = ({ children }: PresenceProviderProps) => {
  const { user } = useAuth();
  
  // Initialize presence tracking when user is logged in
  usePresence();
  
  // Initialize inactivity logout tracking
  const { showWarning, countdown, resetTimer } = useInactivityLogout();

  return (
    <>
      {children}
      {user && (
        <InactivityWarningDialog
          open={showWarning}
          countdown={countdown}
          onStayLoggedIn={resetTimer}
        />
      )}
    </>
  );
};