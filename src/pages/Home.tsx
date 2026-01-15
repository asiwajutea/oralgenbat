import { useAuth } from "@/contexts/AuthContext";
import AuditorDashboard from "@/components/home/AuditorDashboard";
import FieldManagerDashboard from "@/components/home/FieldManagerDashboard";
import ContractorDashboard from "@/components/home/ContractorDashboard";
import AdminDashboard from "@/components/home/AdminDashboard";
import SubContractorDashboard from "@/components/home/SubContractorDashboard";
import QAManagerDashboard from "@/components/home/QAManagerDashboard";

const Home = () => {
  const { userRole, profile } = useAuth();

  const renderDashboard = () => {
    switch (userRole) {
      case 'auditor':
        return <AuditorDashboard />;
      case 'field_manager':
        return <FieldManagerDashboard />;
      case 'contractor':
        return <ContractorDashboard />;
      case 'sub_contractor':
        return <SubContractorDashboard />;
      case 'quality_assurance_manager':
        return <QAManagerDashboard />;
      case 'admin':
      case 'super_admin':
        return <AdminDashboard />;
      default:
        return <AuditorDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container py-4 sm:py-8 px-4 sm:px-6">
        {/* Welcome Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold">
            Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Here's what's happening today.
          </p>
        </div>

        {renderDashboard()}
      </div>
    </div>
  );
};

export default Home;