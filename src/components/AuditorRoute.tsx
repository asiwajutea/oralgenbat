import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ReactNode } from "react";

interface AuditorRouteProps {
  children: ReactNode;
}

export const AuditorRoute = ({ children }: AuditorRouteProps) => {
  const { userRole } = useAuth();
  
  // Allow auditors, admins, and super admins
  if (userRole !== 'auditor' && userRole !== 'admin' && userRole !== 'super_admin') {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};
