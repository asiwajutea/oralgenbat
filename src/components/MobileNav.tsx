import { useState, useEffect } from "react";
import { Menu, FileText, Home, ClipboardList, Users, BarChart3, History, Lock, FolderOpen, Database, Search, Shield, LogOut, Building2, Check } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MobileNav = () => {
  const [open, setOpen] = useState(false);
  const { userRole, profile, signOut, refreshProfile } = useAuth();
  const location = useLocation();
  const [userContractors, setUserContractors] = useState<{ id: string; contractor_id: string; is_primary: boolean }[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const fetchContractors = async () => {
      if (!profile?.id) return;
      const { data } = await supabase
        .from('user_contractor_assignments')
        .select('id, contractor_id, is_primary')
        .eq('user_id', profile.id);
      setUserContractors(data || []);
    };
    fetchContractors();
  }, [profile?.id]);

  const switchContractor = async (contractorId: string) => {
    if (!profile?.id || switching) return;
    setSwitching(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ active_contractor_id: contractorId })
        .eq('id', profile.id);
      
      if (error) throw error;
      await refreshProfile();
      toast.success(`Switched to ${contractorId}`);
    } catch (error) {
      toast.error('Failed to switch contractor');
    } finally {
      setSwitching(false);
    }
  };

  const isActive = (path: string) => location.pathname === path;
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isSubContractor = userRole === 'sub_contractor';

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
            {(userRole === 'auditor' || isAdmin) && (
              <NavItem to="/interviews" icon={ClipboardList}>Interviews</NavItem>
            )}
            
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
            
            {(userRole === 'field_manager' || userRole === 'contractor' || isAdmin || isSubContractor) && (
              <NavItem to="/interview-tracking" icon={Search}>Tracking</NavItem>
            )}
            
            {(userRole === 'data_entry_clerk' || userRole === 'quality_assurance_manager' || isAdmin || isSubContractor) && (
              <NavItem to="/data-entry" icon={Database}>Data Entry</NavItem>
            )}

            {(userRole === 'data_entry_clerk' || userRole === 'quality_assurance_manager') && (
              <NavItem to="/my-analytics" icon={BarChart3}>My Analytics</NavItem>
            )}
            
            {userRole === 'auditor' && (
              <NavItem to="/review-history" icon={History}>My Reviews</NavItem>
            )}
            
            {isSubContractor && (
              <>
                <Separator className="my-3" />
                <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sub-contractor</p>
                <NavItem to="/subcontractor-team-management" icon={Users}>Team Management</NavItem>
                <NavItem to="/admin" icon={Users}>Manage Users</NavItem>
                <NavItem to="/my-analytics" icon={BarChart3}>My Analytics</NavItem>
              </>
            )}
            
            {isAdmin && (
              <>
                <Separator className="my-3" />
                <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Admin</p>
                <NavItem to="/admin" icon={Users}>Manage Users</NavItem>
                {userRole === 'super_admin' ? (
                  <NavItem to="/analytics" icon={BarChart3}>Analytics</NavItem>
                ) : (
                  <NavItem to="/my-analytics" icon={BarChart3}>My Analytics</NavItem>
                )}
                <NavItem to="/admin/review-history" icon={History}>Review History</NavItem>
                <NavItem to="/admin/team-assignments" icon={FolderOpen}>Team Assignments</NavItem>
                <NavItem to="/admin/zip-diagnostics" icon={FileText}>ZIP Diagnostics</NavItem>
                <NavItem to="/admin/locked-interviews" icon={Lock}>Locks</NavItem>
              </>
            )}
          </nav>

          {/* Footer */}
          <div className="border-t p-3 space-y-3">
            {/* Contractor Switcher */}
            {userContractors.length > 1 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Building2 className="h-3 w-3" />
                  Switch Contractor
                </div>
                <Select
                  value={profile?.active_contractor_id || profile?.contractor_id}
                  onValueChange={switchContractor}
                  disabled={switching}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select contractor" />
                  </SelectTrigger>
                  <SelectContent>
                    {userContractors.map((uc) => (
                      <SelectItem key={uc.contractor_id} value={uc.contractor_id}>
                        <div className="flex items-center gap-2">
                          <span>{uc.contractor_id}</span>
                          {(profile?.active_contractor_id || profile?.contractor_id) === uc.contractor_id && (
                            <Check className="h-3 w-3 text-primary" />
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <Separator />
            
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
