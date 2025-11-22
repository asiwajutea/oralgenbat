import { FileText } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import UserMenu from "@/components/UserMenu";
import { useAuth } from "@/contexts/AuthContext";

const Header = () => {
  const { userRole } = useAuth();

  return (
    <header className="border-b bg-card sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-card/95">
      <div className="container flex items-center justify-between h-16 px-6">
        {/* Left: Logo + Brand */}
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          <span className="text-xl font-semibold">Backend Audit Tool</span>
        </div>
        
        {/* Center: Navigation Links */}
        <nav className="flex items-center gap-6">
          <NavLink 
            to="/"
            className="text-sm font-medium transition-colors hover:text-primary"
            activeClassName="text-primary"
          >
            Interviews
          </NavLink>
          {userRole === 'field_manager' && (
            <>
              <NavLink 
                to="/field-manager-dashboard"
                className="text-sm font-medium transition-colors hover:text-primary"
                activeClassName="text-primary"
              >
                My Dashboard
              </NavLink>
              <NavLink 
                to="/team-management"
                className="text-sm font-medium transition-colors hover:text-primary"
                activeClassName="text-primary"
              >
                Team Management
              </NavLink>
            </>
          )}
          {userRole === 'contractor' && (
            <NavLink 
              to="/contractor-dashboard"
              className="text-sm font-medium transition-colors hover:text-primary"
              activeClassName="text-primary"
            >
              My Dashboard
            </NavLink>
          )}
          {(userRole === 'contractor' || userRole === 'admin' || userRole === 'super_admin') && (
            <NavLink 
              to="/admin/team-approvals"
              className="text-sm font-medium transition-colors hover:text-primary"
              activeClassName="text-primary"
            >
              Team Approvals
            </NavLink>
          )}
          {(userRole === 'admin' || userRole === 'super_admin') && (
            <>
              <NavLink 
                to="/admin"
                className="text-sm font-medium transition-colors hover:text-primary"
                activeClassName="text-primary"
              >
                Manage Users
              </NavLink>
              <NavLink 
                to="/analytics"
                className="text-sm font-medium transition-colors hover:text-primary"
                activeClassName="text-primary"
              >
                Analytics
              </NavLink>
            </>
          )}
        </nav>
        
        {/* Right: User Menu */}
        <UserMenu />
      </div>
    </header>
  );
};

export default Header;
