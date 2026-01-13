import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface SubContractorRouteProps {
  children: ReactNode;
}

export const SubContractorRoute = ({ children }: SubContractorRouteProps) => {
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

  // Allow sub_contractor, admin, and super_admin
  const allowedRoles = ['sub_contractor', 'admin', 'super_admin'];
  if (!allowedRoles.includes(userRole || '')) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};
