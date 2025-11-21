import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ReactNode } from "react";

interface FieldManagerRouteProps {
  children: ReactNode;
}

export const FieldManagerRoute = ({ children }: FieldManagerRouteProps) => {
  const { userRole } = useAuth();
  
  if (userRole !== 'field_manager') {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};
