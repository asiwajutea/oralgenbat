import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ReactNode } from "react";

interface FieldManagerRouteProps {
  children: ReactNode;
}

export const FieldManagerRoute = ({ children }: FieldManagerRouteProps) => {
  const { userRole } = useAuth();
  
  // Allow field managers, admins, and super admins
  if (userRole !== 'field_manager' && userRole !== 'admin' && userRole !== 'super_admin') {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};
