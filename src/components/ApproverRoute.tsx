import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ApproverRouteProps {
  children: ReactNode;
}

export const ApproverRoute = ({ children }: ApproverRouteProps) => {
  const { userRole } = useAuth();
  
  // Allow contractors, admins, and super_admins to approve team assignments
  if (
    userRole !== 'contractor' && 
    userRole !== 'admin' && 
    userRole !== 'super_admin'
  ) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};
