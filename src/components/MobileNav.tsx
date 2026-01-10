import { useState } from "react";
import { Menu, FileText, Home, ClipboardList, Users, BarChart3, History, Lock, FolderOpen, Database, Search, Shield, LogOut, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const MobileNav = () => {
  const [open, setOpen] = useState(false);
  const { userRole, profile, signOut } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  const NavItem = ({ to, icon: Icon, children }: { to: string; icon: React.ElementType; children: React.ReactNode }) => (
    <Link
      to={to}
      onClick={() => setOpen(false)}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        isActive(to)
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle className="flex items-center gap-2 text-left">
            <FileText className="h-5 w-5 text-primary" />
            <span className="font-semibold">Audit Tool</span>
          </SheetTitle>
        </SheetHeader>
        
        <div className="flex flex-col h-[calc(100vh-65px)]">
          {/* User info */}
          <div className="px-4 py-3 border-b bg-muted/50">
            <p className="text-sm font-medium truncate">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">{userRole?.replace("_", " ")}</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            <NavItem to="/" icon={Home}>Home</NavItem>
            <NavItem to="/interviews" icon={ClipboardList}>Interviews</NavItem>
            
            {userRole === 'field_manager' && (
              <>
                <NavItem to="/field-manager-dashboard" icon={BarChart3}>My Dashboard</NavItem>
                <NavItem to="/team-management" icon={Users}>Team Management</NavItem>
              </>
            )}
            
            {userRole === 'contractor' && (
              <NavItem to="/contractor-dashboard" icon={BarChart3}>My Dashboard</NavItem>
            )}
            
            {(userRole === 'contractor' || isAdmin) && (
              <NavItem to="/admin/team-approvals" icon={Shield}>Team Approvals</NavItem>
            )}
            
            {(userRole === 'field_manager' || userRole === 'contractor' || isAdmin) && (
              <NavItem to="/interview-tracking" icon={Search}>Tracking</NavItem>
            )}
            
            {(userRole === 'data_entry_clerk' || userRole === 'quality_assurance_manager' || isAdmin) && (
              <NavItem to="/data-entry" icon={Database}>Data Entry</NavItem>
            )}
            
            {userRole === 'auditor' && (
              <NavItem to="/review-history" icon={History}>My Reviews</NavItem>
            )}
            
            {isAdmin && (
              <>
                <Separator className="my-3" />
                <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Admin</p>
                <NavItem to="/admin" icon={Users}>Manage Users</NavItem>
                <NavItem to="/analytics" icon={BarChart3}>Analytics</NavItem>
                <NavItem to="/admin/review-history" icon={History}>Review History</NavItem>
                <NavItem to="/admin/team-assignments" icon={FolderOpen}>Team Assignments</NavItem>
                <NavItem to="/admin/zip-diagnostics" icon={FileText}>ZIP Diagnostics</NavItem>
                <NavItem to="/admin/locked-interviews" icon={Lock}>Locks</NavItem>
              </>
            )}
          </nav>

          {/* Footer */}
          <div className="border-t p-3 space-y-2">
            <div className="flex items-center justify-between px-3">
              <span className="text-sm text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileNav;
