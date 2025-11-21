import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ReactNode } from "react";

interface ContractorRouteProps {
  children: ReactNode;
}

export const ContractorRoute = ({ children }: ContractorRouteProps) => {
  const { userRole } = useAuth();
  
  if (userRole !== 'contractor') {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};
