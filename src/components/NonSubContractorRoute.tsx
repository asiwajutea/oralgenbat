import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

/**
 * Route guard for pages that sub_contractor should not access.
 * Used for: Interviews page and Review Interview page
 */
const NonSubContractorRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, userRole, profile, isApproved, loading } = useAuth();

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

  // Wait for profile to be loaded
  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isApproved) {
    return <Navigate to="/pending-approval" replace />;
  }

  // Block sub_contractor from this page
  if (userRole === 'sub_contractor') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default NonSubContractorRoute;
