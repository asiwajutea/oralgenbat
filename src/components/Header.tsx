import { FileText, ChevronDown } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import UserMenu from "@/components/UserMenu";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useLocation } from "react-router-dom";

const Header = () => {
  const { userRole } = useAuth();
  const location = useLocation();
  
  // Check if we're on any "All Reviews" submenu page
  const isReviewsActive = location.pathname.startsWith('/admin/review-history') || 
                          location.pathname.startsWith('/admin/team-assignments');

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
              
              {/* All Reviews Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className={`flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary ${isReviewsActive ? 'text-primary' : ''}`}>
                  All Reviews
                  <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                  <DropdownMenuItem asChild>
                    <Link to="/admin/review-history" className="cursor-pointer">
                      Review History
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/team-assignments" className="cursor-pointer">
                      Team Assignments
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <NavLink 
                to="/admin/locked-interviews"
                className="text-sm font-medium transition-colors hover:text-primary"
                activeClassName="text-primary"
              >
                Locks
              </NavLink>
            </>
          )}
          {(userRole === 'auditor') && (
            <NavLink 
              to="/review-history"
              className="text-sm font-medium transition-colors hover:text-primary"
              activeClassName="text-primary"
            >
              My Reviews
            </NavLink>
          )}
        </nav>
        
        {/* Right: User Menu */}
        <UserMenu />
      </div>
    </header>
  );
};

export default Header;