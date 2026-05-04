import { FileText } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import UserMenu from "@/components/UserMenu";
import MobileNav from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import InboxBell from "@/components/InboxBell";
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

  // Active state helpers
  const isOperationsActive = ['/interview-tracking', '/payment-tracking', '/data-entry', '/burn-queue'].some(p => location.pathname.startsWith(p));
  const isTeamsActive = ['/team-management', '/subcontractor-team-management', '/admin/team-approvals'].some(p => location.pathname.startsWith(p));
  const isAdminActive = ['/admin'].some(p => location.pathname.startsWith(p)) && !location.pathname.startsWith('/admin/team-approvals');
  const isAnalyticsActive = location.pathname === '/analytics' || location.pathname === '/my-analytics' || location.pathname === '/fraud-analytics' || location.pathname.startsWith('/role-analytics') || location.pathname === '/upload-tracking';
  const isSuperAdmin = userRole === 'super_admin';
  const isCommunicationsActive = location.pathname.startsWith('/notices');

  // Role checks
  const canSeeFraudAnalytics = userRole && ['field_manager', 'contractor', 'admin', 'super_admin', 'sub_contractor'].includes(userRole);
  const canSeeAnalytics = userRole && ['contractor', 'admin', 'super_admin', 'data_entry_clerk', 'quality_assurance_manager', 'sub_contractor'].includes(userRole);
  const showAnalyticsDropdown = canSeeAnalytics && canSeeFraudAnalytics;

  const analyticsLink = userRole === 'super_admin' ? '/analytics' : '/my-analytics';
  const analyticsLabel = userRole === 'super_admin' ? 'Analytics' : 'My Analytics';

  // Operations items based on role
  const operationsItems = [
    ...(userRole && ['field_manager', 'contractor', 'admin', 'super_admin', 'sub_contractor'].includes(userRole)
      ? [{ to: '/interview-tracking', label: 'Tracking' }, { to: '/payment-tracking', label: 'Payments' }, { to: '/burn-queue', label: 'Burn Queue' }]
      : []),
    ...(userRole && ['data_entry_clerk', 'quality_assurance_manager', 'admin', 'super_admin'].includes(userRole)
      ? [{ to: '/data-entry', label: 'Data Entry' }]
      : []),
  ];

  // Teams items based on role
  const teamsItems = [
    ...(userRole === 'field_manager' ? [{ to: '/team-management', label: 'Team Management' }] : []),
    ...(userRole === 'sub_contractor' ? [{ to: '/subcontractor-team-management', label: 'Team Management' }] : []),
    ...((userRole === 'contractor' || isAdmin) ? [{ to: '/admin/team-approvals', label: 'Team Approvals' }] : []),
  ];

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

          {(isAuditor || isAdmin) && (
            <NavLink to="/interviews" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              Interviews
            </NavLink>
          )}

          {userRole === 'field_manager' && (
            <NavLink to="/field-manager-dashboard" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              My Dashboard
            </NavLink>
          )}

          {userRole === 'contractor' && (
            <NavLink to="/contractor-dashboard" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              My Dashboard
            </NavLink>
          )}

          {/* Operations dropdown */}
          {operationsItems.length > 0 && (
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className={cn("h-auto px-0 py-0 bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent text-sm font-medium", isOperationsActive ? "text-primary" : "text-foreground hover:text-primary")}>
                    Operations
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="w-48 p-2">
                      {operationsItems.map(item => (
                        <NavigationMenuLink key={item.to} asChild>
                          <Link to={item.to} className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === item.to && "bg-accent text-accent-foreground")}>
                            {item.label}
                          </Link>
                        </NavigationMenuLink>
                      ))}
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          )}

          {/* Teams dropdown */}
          {teamsItems.length > 0 && (
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className={cn("h-auto px-0 py-0 bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent text-sm font-medium", isTeamsActive ? "text-primary" : "text-foreground hover:text-primary")}>
                    Teams
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="w-48 p-2">
                      {teamsItems.map(item => (
                        <NavigationMenuLink key={item.to} asChild>
                          <Link to={item.to} className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === item.to && "bg-accent text-accent-foreground")}>
                            {item.label}
                          </Link>
                        </NavigationMenuLink>
                      ))}
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
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
                      <NavigationMenuLink asChild>
                        <Link to="/upload-tracking" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/upload-tracking' && "bg-accent text-accent-foreground")}>
                          Upload Tracking
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

          {isAuditor && (
            <NavLink to="/review-history" className="text-sm font-medium transition-colors hover:text-primary" activeClassName="text-primary">
              My Reviews
            </NavLink>
          )}

          {/* Admin dropdown */}
          {isAdmin && (
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className={cn("h-auto px-0 py-0 bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent text-sm font-medium", isAdminActive ? "text-primary" : "text-foreground hover:text-primary")}>
                    Admin
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="w-48 p-2">
                      <NavigationMenuLink asChild>
                        <Link to="/admin" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/admin' && "bg-accent text-accent-foreground")}>
                          Manage Users
                        </Link>
                      </NavigationMenuLink>
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
                          ZIP/PDF Diagnostics
                        </Link>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <Link to="/admin/locked-interviews" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/admin/locked-interviews' && "bg-accent text-accent-foreground")}>
                          Locks
                        </Link>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <Link to="/admin/sms-logs" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/admin/sms-logs' && "bg-accent text-accent-foreground")}>
                          SMS Logs
                        </Link>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <Link to="/admin/duplicates" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/admin/duplicates' && "bg-accent text-accent-foreground")}>
                          Duplicate Detection
                        </Link>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <Link to="/admin/upload-controls" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/admin/upload-controls' && "bg-accent text-accent-foreground")}>
                          Upload Controls
                        </Link>
                      </NavigationMenuLink>
                      {isSuperAdmin && (
                        <NavigationMenuLink asChild>
                          <Link to="/admin/error-console" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/admin/error-console' && "bg-accent text-accent-foreground")}>
                            Error Console
                          </Link>
                        </NavigationMenuLink>
                      )}
                      {isSuperAdmin && (
                        <NavigationMenuLink asChild>
                          <Link to="/admin/chat-policies" className={cn("block select-none rounded-md p-3 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground", location.pathname === '/admin/chat-policies' && "bg-accent text-accent-foreground")}>
                            Chat Policies
                          </Link>
                        </NavigationMenuLink>
                      )}
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
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
          <InboxBell />
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
