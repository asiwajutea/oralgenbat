import { useEffect } from "react";
import { usePresence } from "@/hooks/usePresence";
import { useAuth } from "@/contexts/AuthContext";

interface PresenceProviderProps {
  children: React.ReactNode;
}

export const PresenceProvider = ({ children }: PresenceProviderProps) => {
  const { user } = useAuth();
  
  // Initialize presence tracking when user is logged in
  usePresence();

  return <>{children}</>;
};