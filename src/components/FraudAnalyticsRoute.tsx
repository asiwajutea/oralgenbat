import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const ALLOWED_ROLES = ['super_admin', 'admin', 'contractor', 'sub_contractor', 'field_manager'];

const FraudAnalyticsRoute = ({ children }: { children: React.ReactNode }) => {
  const { userRole, loading } = useAuth();

  if (loading) return null;
  if (!userRole || !ALLOWED_ROLES.includes(userRole)) return <Navigate to="/" replace />;

  return <>{children}</>;
};

export default FraudAnalyticsRoute;
