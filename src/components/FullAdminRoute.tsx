import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

/**
 * Route guard for pages that only admin and super_admin can access.
 * This explicitly excludes sub_contractor role.
 * Used for: Review History, Team Assignments, Zip Diagnostics, Locked Interviews
 */
const FullAdminRoute = ({ children }: { children: React.ReactNode }) => {
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

  // Only admin and super_admin - explicitly excludes sub_contractor
  if (userRole !== 'admin' && userRole !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default FullAdminRoute;
