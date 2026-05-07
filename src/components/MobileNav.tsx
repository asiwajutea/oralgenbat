import { useState, useEffect } from "react";
import { Menu, FileText, Home, ClipboardList, Users, BarChart3, History, Lock, FolderOpen, Database, Search, Shield, LogOut, Building2, Check, DollarSign, Megaphone, Bell, MessageSquare, Copy, Flame, Bug, Inbox as InboxIcon, Activity, Upload } from "lucide-react";
import { useChatUnreadTotal } from "@/hooks/useChatUnread";
import { Badge } from "@/components/ui/badge";
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
  const { data: chatUnread = 0 } = useChatUnreadTotal();
  const [userContractors, setUserContractors] = useState<{id: string;contractor_id: string;is_primary: boolean;}[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const fetchContractors = async () => {
      if (!profile?.id) return;
      const allContractors: Set<string> = new Set();
      if (profile.contractor_id) allContractors.add(profile.contractor_id);
      const { data: assignments } = await supabase.from('user_contractor_assignments').select('id, contractor_id, is_primary').eq('user_id', profile.id);
      if (assignments && assignments.length > 0) assignments.forEach((a) => allContractors.add(a.contractor_id));
      if (userRole === 'sub_contractor') {
        const { data: fmAssignments } = await supabase.from("field_manager_subcontractor_assignments").select("field_manager_id").eq("sub_contractor_id", profile.id).eq("is_active", true);
        if (fmAssignments && fmAssignments.length > 0) {
          const fmIds = fmAssignments.map((a) => a.field_manager_id);
          const { data: fmProfiles } = await supabase.from("profiles").select("contractor_id").in("id", fmIds);
          fmProfiles?.forEach((p) => { if (p.contractor_id) allContractors.add(p.contractor_id); });
        }
      }
      const uniqueContractors = Array.from(allContractors);
      setUserContractors(uniqueContractors.map((cid, idx) => ({ id: `${profile.id}-${cid}`, contractor_id: cid, is_primary: idx === 0 })));
    };
    fetchContractors();
  }, [profile?.id, userRole]);

  const switchContractor = async (contractorId: string) => {
    if (!profile?.id || switching) return;
    setSwitching(true);
    try {
      const { error } = await supabase.from('profiles').update({ active_contractor_id: contractorId }).eq('id', profile.id);
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
  const canSeeFraudAnalytics = userRole && ['field_manager', 'contractor', 'admin', 'super_admin', 'sub_contractor'].includes(userRole);

  const NavItem = ({ to, icon: Icon, children }: {to: string;icon: React.ElementType;children: React.ReactNode;}) =>
    <Link to={to} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors", isActive(to) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>
      <Icon className="h-4 w-4" />
      {children}
    </Link>;

  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <>
      <Separator className="my-3" />
      <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{children}</p>
    </>
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
            <span className="font-semibold">Backend Audit Tool</span>
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
            {/* Home */}
            <NavItem to="/" icon={Home}>Home</NavItem>

            {/* Inbox with unread badge */}
            <Link
              to="/inbox"
              onClick={() => setOpen(false)}
              className={cn("flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors", isActive("/inbox") ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}
            >
              <span className="flex items-center gap-3">
                <InboxIcon className="h-4 w-4" />
                Inbox
              </span>
              {chatUnread > 0 && (
                <Badge variant="destructive" className="h-5">{chatUnread > 9 ? "9+" : chatUnread}</Badge>
              )}
            </Link>

            {/* Activity History */}
            <NavItem to="/activity" icon={Activity}>Activity History</NavItem>

            {/* Interviews (auditor, admin) */}
            {(userRole === 'auditor' || isAdmin) && <NavItem to="/interviews" icon={ClipboardList}>Interviews</NavItem>}
            
            {/* My Dashboard */}
            {userRole === 'field_manager' && <NavItem to="/field-manager-dashboard" icon={BarChart3}>My Dashboard</NavItem>}
            {userRole === 'contractor' && <NavItem to="/contractor-dashboard" icon={BarChart3}>My Dashboard</NavItem>}

            {/* Operations */}
            {(userRole === 'field_manager' || userRole === 'contractor' || isAdmin || isSubContractor || userRole === 'data_entry_clerk' || userRole === 'quality_assurance_manager') && (
              <>
                <SectionHeader>Operations</SectionHeader>
                {(userRole === 'field_manager' || userRole === 'contractor' || isAdmin || isSubContractor) && (
                  <NavItem to="/interview-tracking" icon={Search}>Tracking</NavItem>
                )}
                {(userRole === 'field_manager' || userRole === 'contractor' || isAdmin || isSubContractor) && (
                  <NavItem to="/burn-queue" icon={Flame}>Burn Queue</NavItem>
                )}
                {(userRole === 'field_manager' || userRole === 'contractor' || isAdmin || isSubContractor) && (
                  <NavItem to="/payment-tracking" icon={DollarSign}>Payments</NavItem>
                )}
                {(userRole === 'data_entry_clerk' || userRole === 'quality_assurance_manager' || isAdmin) && (
                  <NavItem to="/data-entry" icon={Database}>Data Entry</NavItem>
                )}
              </>
            )}

            {/* Teams */}
            {(userRole === 'field_manager' || isSubContractor || userRole === 'contractor' || isAdmin) && (
              <>
                <SectionHeader>Teams</SectionHeader>
                {userRole === 'field_manager' && <NavItem to="/team-management" icon={Users}>Team Management</NavItem>}
                {isSubContractor && <NavItem to="/subcontractor-team-management" icon={Users}>Team Management</NavItem>}
                {(userRole === 'contractor' || isAdmin) && <NavItem to="/admin/team-approvals" icon={Shield}>Team Approvals</NavItem>}
              </>
            )}

            {/* Analytics */}
            {(canSeeFraudAnalytics || userRole === 'contractor' || userRole === 'data_entry_clerk' || userRole === 'quality_assurance_manager' || isSubContractor || isAdmin) && (
              <>
                <SectionHeader>Analytics</SectionHeader>
                {(userRole === 'contractor' || userRole === 'data_entry_clerk' || userRole === 'quality_assurance_manager' || isSubContractor) && (
                  <NavItem to="/my-analytics" icon={BarChart3}>My Analytics</NavItem>
                )}
                {isAdmin && (
                  userRole === 'super_admin'
                    ? <NavItem to="/analytics" icon={BarChart3}>Analytics</NavItem>
                    : <NavItem to="/my-analytics" icon={BarChart3}>My Analytics</NavItem>
                )}
                {canSeeFraudAnalytics && <NavItem to="/fraud-analytics" icon={Shield}>Fraud Analytics</NavItem>}
                {(canSeeFraudAnalytics || userRole === 'contractor' || isSubContractor || isAdmin) && (
                  <NavItem to="/upload-tracking" icon={BarChart3}>Upload Tracking</NavItem>
                )}
              </>
            )}

            {/* Communications */}
            <SectionHeader>Communications</SectionHeader>
            <NavItem to="/notices" icon={Megaphone}>Notice Board</NavItem>
            <NavItem to="/notices?tab=push" icon={Bell}>Push Notifications</NavItem>

            {/* My Reviews (auditor only) */}
            {userRole === 'auditor' && (
              <>
                <SectionHeader>Reviews</SectionHeader>
                <NavItem to="/review-history" icon={History}>My Reviews</NavItem>
              </>
            )}

            {/* Admin */}
            {isAdmin && (
              <>
                <SectionHeader>Admin</SectionHeader>
                <NavItem to="/admin" icon={Users}>Manage Users</NavItem>
                <NavItem to="/admin/review-history" icon={History}>Review History</NavItem>
                <NavItem to="/admin/team-assignments" icon={FolderOpen}>Team Assignments</NavItem>
                <NavItem to="/admin/zip-diagnostics" icon={FileText}>ZIP/PDF Diagnostics</NavItem>
                <NavItem to="/admin/locked-interviews" icon={Lock}>Locks</NavItem>
                <NavItem to="/admin/sms-logs" icon={MessageSquare}>SMS Logs</NavItem>
                <NavItem to="/admin/duplicates" icon={Copy}>Duplicate Detection</NavItem>
                <NavItem to="/admin/upload-controls" icon={Lock}>Upload Controls</NavItem>
                <NavItem to="/admin/penalties" icon={DollarSign}>Penalty Charges</NavItem>
                {userRole === 'super_admin' && <NavItem to="/admin/error-console" icon={Bug}>Error Console</NavItem>}
                {userRole === 'super_admin' && <NavItem to="/admin/chat-policies" icon={Shield}>Chat Policies</NavItem>}
              </>
            )}
            <SectionHeader>Uploads</SectionHeader>
            <NavItem to="/upload-center" icon={Upload}>Upload Center</NavItem>
            {(userRole === 'field_manager' || userRole === 'sub_contractor' || userRole === 'contractor') && (
              <NavItem to="/admin/penalties" icon={DollarSign}>Penalty Charges</NavItem>
            )}
            {(userRole === 'field_manager' || userRole === 'sub_contractor') && (
              <NavItem to="/my-penalties" icon={DollarSign}>My Penalties</NavItem>
            )}
          </nav>

          {/* Footer */}
          <div className="border-t p-3 space-y-3">
            {userContractors.length > 1 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Building2 className="h-3 w-3" />
                  Switch Contractor
                </div>
                <Select value={profile?.active_contractor_id || profile?.contractor_id} onValueChange={switchContractor} disabled={switching}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select contractor" />
                  </SelectTrigger>
                  <SelectContent>
                    {userContractors.map((uc) => (
                      <SelectItem key={uc.contractor_id} value={uc.contractor_id}>
                        <div className="flex items-center gap-2">
                          <span>{uc.contractor_id}</span>
                          {(profile?.active_contractor_id || profile?.contractor_id) === uc.contractor_id && <Check className="h-3 w-3 text-primary" />}
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
            <Button variant="ghost" className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { setOpen(false); signOut(); }}>
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
