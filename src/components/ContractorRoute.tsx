import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ReactNode } from "react";

interface ContractorRouteProps {
  children: ReactNode;
}

export const ContractorRoute = ({ children }: ContractorRouteProps) => {
  const { userRole } = useAuth();
  
  // Allow contractors, admins, and super admins
  if (userRole !== 'contractor' && userRole !== 'admin' && userRole !== 'super_admin') {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};
