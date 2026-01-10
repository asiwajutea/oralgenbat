import { FileText } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import UserMenu from "@/components/UserMenu";
import MobileNav from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from "@/components/ui/navigation-menu";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
const Header = () => {
  const {
    userRole
  } = useAuth();
  const location = useLocation();
  const isReviewsActive = location.pathname.startsWith('/admin/review-history') || location.pathname.startsWith('/admin/team-assignments');
  return <header className="border-b bg-card sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-card/95">
      <div className="container flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6">
        {/* Left: Mobile Nav + Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          <MobileNav />
          <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <span className="text-lg sm:text-xl font-semibold hidden xs:inline">Backend Audit Tool</span>
          <span className="text-lg font-semibold xs:hidden">Backend Audit Tool (OralGen)</span>
        </div>
        
        {/* Center: Navigation Links - Desktop only */}
        <nav className="hidden lg:flex items-center gap-4 xl:gap-6">
          <NavLink to="/" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
            Home
          </NavLink>
          <NavLink to="/interviews" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
            Interviews
          </NavLink>
          {userRole === 'field_manager' && <>
              <NavLink to="/field-manager-dashboard" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
                My Dashboard
              </NavLink>
              <NavLink to="/team-management" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
                Team Management
              </NavLink>
            </>}
          {userRole === 'contractor' && <NavLink to="/contractor-dashboard" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              My Dashboard
            </NavLink>}
          {(userRole === 'contractor' || userRole === 'admin' || userRole === 'super_admin') && <NavLink to="/admin/team-approvals" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              Team Approvals
            </NavLink>}
          {(userRole === 'field_manager' || userRole === 'contractor' || userRole === 'admin' || userRole === 'super_admin') && <NavLink to="/interview-tracking" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              Tracking
            </NavLink>}
          {(userRole === 'data_entry_clerk' || userRole === 'quality_assurance_manager' || userRole === 'admin' || userRole === 'super_admin') && <NavLink to="/data-entry" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              Data Entry
            </NavLink>}
          {(userRole === 'admin' || userRole === 'super_admin') && <>
              <NavLink to="/admin" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
                Manage Users
              </NavLink>
              <NavLink to="/analytics" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
                Analytics
              </NavLink>
              
              {/* All Reviews Dropdown */}
              <NavigationMenu>
                <NavigationMenuList>
                  <NavigationMenuItem>
                    <NavigationMenuTrigger className={cn("h-auto px-0 py-0 bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent text-sm font-medium", isReviewsActive ? "text-primary" : "text-foreground hover:text-primary")}>
                      All Reviews
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <div className="w-48 p-2">
                        <NavigationMenuLink asChild>
                          <Link to="/admin/review-history" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground", location.pathname === '/admin/review-history' && "bg-accent text-accent-foreground")}>
                            Review History
                          </Link>
                        </NavigationMenuLink>
                        <NavigationMenuLink asChild>
                          <Link to="/admin/team-assignments" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground", location.pathname === '/admin/team-assignments' && "bg-accent text-accent-foreground")}>
                            Team Assignments
                          </Link>
                        </NavigationMenuLink>
                        <NavigationMenuLink asChild>
                          <Link to="/admin/zip-diagnostics" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground", location.pathname === '/admin/zip-diagnostics' && "bg-accent text-accent-foreground")}>
                            ZIP Diagnostics
                          </Link>
                        </NavigationMenuLink>
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                </NavigationMenuList>
              </NavigationMenu>
              
              <NavLink to="/admin/locked-interviews" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
                Locks
              </NavLink>
            </>}
          {userRole === 'auditor' && <NavLink to="/review-history" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              My Reviews
            </NavLink>}
        </nav>
        
        {/* Right: Theme Toggle + User Menu */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <UserMenu />
        </div>
      </div>
    </header>;
};
export default Header;