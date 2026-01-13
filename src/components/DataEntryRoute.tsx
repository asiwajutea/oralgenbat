import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface DataEntryRouteProps {
  children: ReactNode;
}

export const DataEntryRoute = ({ children }: DataEntryRouteProps) => {
  const { user, userRole, isApproved, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isApproved) {
    return <Navigate to="/pending-approval" replace />;
  }

  // Allow data entry clerks, QA managers, admins, super admins, and sub_contractors
  const allowedRoles = ['data_entry_clerk', 'quality_assurance_manager', 'admin', 'super_admin', 'sub_contractor'];
  if (!allowedRoles.includes(userRole || '')) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};