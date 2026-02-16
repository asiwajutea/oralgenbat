import { FileText, Megaphone } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import UserMenu from "@/components/UserMenu";
import MobileNav from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import { useAuth } from "@/contexts/AuthContext";
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from "@/components/ui/navigation-menu";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const Header = () => {
  const { userRole, profile } = useAuth();
  const location = useLocation();

  const activeContractorId = profile?.active_contractor_id || profile?.contractor_id;
  const isAuditor = userRole === 'auditor';
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isReviewsActive = location.pathname.startsWith('/admin/review-history') || location.pathname.startsWith('/admin/team-assignments');
  const isCommunicationsActive = location.pathname.startsWith('/notices');
  const isAnalyticsActive = location.pathname === '/analytics' || location.pathname === '/my-analytics' || location.pathname === '/fraud-analytics' || location.pathname.startsWith('/role-analytics');

  // Roles that see Fraud Analytics
  const canSeeFraudAnalytics = userRole && ['field_manager', 'contractor', 'admin', 'super_admin', 'sub_contractor'].includes(userRole);
  // Roles that see Analytics/My Analytics
  const canSeeAnalytics = userRole && ['contractor', 'admin', 'super_admin', 'data_entry_clerk', 'quality_assurance_manager', 'sub_contractor'].includes(userRole);
  // Should we group under Analytics dropdown?
  const showAnalyticsDropdown = canSeeAnalytics && canSeeFraudAnalytics;

  const analyticsLink = userRole === 'super_admin' ? '/analytics' : '/my-analytics';
  const analyticsLabel = userRole === 'super_admin' ? 'Analytics' : 'My Analytics';

  return (
    <header className="border-b bg-card sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-card/95">
      <div className="container flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6">
        {/* Left: Mobile Nav + Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          <MobileNav />
          <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <span className="text-lg sm:text-xl font-semibold hidden sm:inline">Backend Audit Tool</span>
        </div>
        
        {/* Center: Navigation Links - Desktop only */}
        <nav className="hidden lg:flex items-center gap-4 xl:gap-6">
          <NavLink to="/" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
            Home
          </NavLink>

          {(userRole === 'auditor' || isAdmin) && (
            <NavLink to="/interviews" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              Interviews
            </NavLink>
          )}

          {userRole === 'field_manager' && (
            <>
              <NavLink to="/field-manager-dashboard" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
                My Dashboard
              </NavLink>
              <NavLink to="/team-management" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
                Team Management
              </NavLink>
            </>
          )}

          {userRole === 'contractor' && (
            <NavLink to="/contractor-dashboard" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              My Dashboard
            </NavLink>
          )}

          {(userRole === 'contractor' || isAdmin) && (
            <NavLink to="/admin/team-approvals" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              Team Approvals
            </NavLink>
          )}

          {(userRole === 'field_manager' || userRole === 'contractor' || isAdmin || userRole === 'sub_contractor') && (
            <NavLink to="/interview-tracking" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              Tracking
            </NavLink>
          )}

          {(userRole === 'field_manager' || userRole === 'contractor' || isAdmin || userRole === 'sub_contractor') && (
            <NavLink to="/payment-tracking" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              Payments
            </NavLink>
          )}

          {(userRole === 'data_entry_clerk' || userRole === 'quality_assurance_manager' || isAdmin) && (
            <NavLink to="/data-entry" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              Data Entry
            </NavLink>
          )}

          {userRole === 'sub_contractor' && (
            <NavLink to="/subcontractor-team-management" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              Team Management
            </NavLink>
          )}

          {/* Analytics dropdown or standalone */}
          {showAnalyticsDropdown ? (
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className={cn("h-auto px-0 py-0 bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent text-sm font-medium", isAnalyticsActive ? "text-primary" : "text-foreground hover:text-primary")}>
                    Analytics
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="w-48 p-2">
                      <NavigationMenuLink asChild>
                        <Link to={analyticsLink} className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === analyticsLink && "bg-accent text-accent-foreground")}>
                          {analyticsLabel}
                        </Link>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <Link to="/fraud-analytics" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/fraud-analytics' && "bg-accent text-accent-foreground")}>
                          Fraud Analytics
                        </Link>
                      </NavigationMenuLink>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          ) : canSeeAnalytics && !canSeeFraudAnalytics ? (
            <NavLink to={analyticsLink} className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              {analyticsLabel}
            </NavLink>
          ) : canSeeFraudAnalytics && !canSeeAnalytics ? (
            <NavLink to="/fraud-analytics" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              Fraud Analytics
            </NavLink>
          ) : null}

          {/* Communications dropdown */}
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className={cn("h-auto px-0 py-0 bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent text-sm font-medium", isCommunicationsActive ? "text-primary" : "text-foreground hover:text-primary")}>
                  Communications
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="w-52 p-2">
                    <NavigationMenuLink asChild>
                      <Link to="/notices" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/notices' && !location.search && "bg-accent text-accent-foreground")}>
                        Notice Board
                      </Link>
                    </NavigationMenuLink>
                    <NavigationMenuLink asChild>
                      <Link to="/notices?tab=push" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.search === '?tab=push' && "bg-accent text-accent-foreground")}>
                        Push Notifications
                      </Link>
                    </NavigationMenuLink>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          {userRole === 'auditor' && (
            <NavLink to="/review-history" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              My Reviews
            </NavLink>
          )}

          {isAdmin && (
            <>
              <NavLink to="/admin" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
                Manage Users
              </NavLink>

              <NavigationMenu>
                <NavigationMenuList>
                  <NavigationMenuItem>
                    <NavigationMenuTrigger className={cn("h-auto px-0 py-0 bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent text-sm font-medium", isReviewsActive ? "text-primary" : "text-foreground hover:text-primary")}>
                      All Reviews
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <div className="w-48 p-2">
                        <NavigationMenuLink asChild>
                          <Link to="/admin/review-history" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/admin/review-history' && "bg-accent text-accent-foreground")}>
                            Review History
                          </Link>
                        </NavigationMenuLink>
                        <NavigationMenuLink asChild>
                          <Link to="/admin/team-assignments" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/admin/team-assignments' && "bg-accent text-accent-foreground")}>
                            Team Assignments
                          </Link>
                        </NavigationMenuLink>
                        <NavigationMenuLink asChild>
                          <Link to="/admin/zip-diagnostics" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/admin/zip-diagnostics' && "bg-accent text-accent-foreground")}>
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
            </>
          )}
        </nav>
        
        {/* Right: Contractor Indicator + Notifications + Theme Toggle + User Menu */}
        <div className="flex items-center gap-2">
          {isAuditor && activeContractorId && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-md">
              <span className="text-xs font-medium text-primary">Viewing:</span>
              <span className="text-xs font-bold text-primary">{activeContractorId}</span>
            </div>
          )}
          <NotificationBell />
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  );
};

export default Header;
