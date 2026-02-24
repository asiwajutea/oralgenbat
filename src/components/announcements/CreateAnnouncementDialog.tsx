import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarIcon, Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAnnouncements, Announcement } from "@/hooks/useAnnouncements";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface CreateAnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAnnouncement?: Announcement | null;
}

const STYLES = [
  { value: "info", label: "Info (Blue)" },
  { value: "warning", label: "Warning (Amber)" },
  { value: "success", label: "Success (Green)" },
  { value: "announcement", label: "Announcement (Purple)" },
];

const FREQUENCIES = [
  { value: "once", label: "Show Once" },
  { value: "every_login", label: "Every Login" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const TARGET_TYPES = [
  { value: "all", label: "All Users" },
  { value: "contractor", label: "Contractor Group" },
  { value: "role", label: "User Roles" },
  { value: "user", label: "Specific Users" },
];

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "auditor", label: "Auditor" },
  { value: "contractor", label: "Contractor" },
  { value: "sub_contractor", label: "Sub-Contractor" },
  { value: "field_manager", label: "Field Manager" },
  { value: "data_entry_clerk", label: "Data Entry Clerk" },
  { value: "quality_assurance_manager", label: "QA Manager" },
];

export const CreateAnnouncementDialog = ({
  open,
  onOpenChange,
  editingAnnouncement,
}: CreateAnnouncementDialogProps) => {
  const { user, profile, userRole } = useAuth();
  const { createAnnouncement, updateAnnouncement } = useAnnouncements();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("content");

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [style, setStyle] = useState<string>("info");
  const [displayFrequency, setDisplayFrequency] = useState<string>("once");
  const [requireAcknowledgment, setRequireAcknowledgment] = useState(false);
  const [targetType, setTargetType] = useState<string>("all");
  const [targetContractorId, setTargetContractorId] = useState<string>("");
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [priority, setPriority] = useState(0);
  const [scheduledAt, setScheduledAt] = useState<Date | undefined>();
  const [expiresAt, setExpiresAt] = useState<Date | undefined>();

  // Fetch contractors for targeting
  const { data: contractors = [] } = useQuery({
    queryKey: ["contractor-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("contractor_id")
        .not("contractor_id", "is", null);
      const uniqueIds = [...new Set(data?.map(p => p.contractor_id).filter(Boolean))];
      return uniqueIds as string[];
    },
    enabled: open && targetType === "contractor",
  });

  // Fetch users for specific user targeting
  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-approved-users-announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, contractor_id")
        .eq("is_approved", true)
        .order("full_name");
      return data || [];
    },
    enabled: open && targetType === "user",
  });

  const filteredUsers = allUsers.filter(u =>
    u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  // Reset form when opening/closing
  useEffect(() => {
    if (open && editingAnnouncement) {
      setTitle(editingAnnouncement.title);
      setContent(editingAnnouncement.content);
      setCtaText(editingAnnouncement.cta_text || "");
      setCtaUrl(editingAnnouncement.cta_url || "");
      setStyle(editingAnnouncement.style);
      setDisplayFrequency(editingAnnouncement.display_frequency);
      setRequireAcknowledgment(editingAnnouncement.require_acknowledgment);
      setTargetType(editingAnnouncement.target_type);
      setTargetContractorId(editingAnnouncement.target_contractor_id || "");
      setTargetRoles((editingAnnouncement as any).target_roles || (editingAnnouncement.target_role ? [editingAnnouncement.target_role] : []));
      setTargetUserIds(editingAnnouncement.target_user_ids || []);
      setPriority(editingAnnouncement.priority);
      setScheduledAt(editingAnnouncement.scheduled_at ? new Date(editingAnnouncement.scheduled_at) : undefined);
      setExpiresAt(editingAnnouncement.expires_at ? new Date(editingAnnouncement.expires_at) : undefined);
      setActiveTab("content");
    } else if (open) {
      setTitle(""); setContent(""); setCtaText(""); setCtaUrl("");
      setStyle("info"); setDisplayFrequency("once"); setRequireAcknowledgment(false);
      setTargetType("all"); setTargetContractorId(""); setTargetRoles([]); setTargetUserIds([]);
      setPriority(0); setScheduledAt(undefined); setExpiresAt(undefined);
      setActiveTab("content"); setUserSearch("");
    }
  }, [open, editingAnnouncement]);

  const isSuperAdmin = userRole === "super_admin";
  const isContractor = userRole === "contractor";
  const isSubContractor = userRole === "sub_contractor";
  const isQAManager = userRole === "quality_assurance_manager";

  const getAllowedTargetTypes = () => {
    if (isSuperAdmin) return TARGET_TYPES;
    if (isContractor) return TARGET_TYPES.filter(t => t.value === "contractor" || t.value === "all");
    if (isSubContractor || isQAManager) return TARGET_TYPES.filter(t => t.value === "role" || t.value === "all");
    return [TARGET_TYPES[0]];
  };

  const toggleRole = (role: string) => {
    setTargetRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const toggleUser = (userId: string) => {
    setTargetUserIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const tabs = ["content", "targeting", "scheduling"];
  const currentTabIndex = tabs.indexOf(activeTab);
  const canGoNext = currentTabIndex < tabs.length - 1;
  const canGoBack = currentTabIndex > 0;

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required");
      setActiveTab("content");
      return;
    }

    setIsSaving(true);
    try {
      const data: any = {
        title: title.trim(),
        content: content.trim(),
        cta_text: ctaText.trim() || null,
        cta_url: ctaUrl.trim() || null,
        style,
        display_frequency: displayFrequency,
        require_acknowledgment: requireAcknowledgment,
        target_type: targetType,
        target_contractor_id: targetType === "contractor" ? targetContractorId : null,
        target_role: targetType === "role" && targetRoles.length > 0 ? targetRoles[0] : null,
        target_roles: targetType === "role" ? targetRoles : null,
        target_user_ids: targetType === "user" ? targetUserIds : null,
        priority,
        scheduled_at: scheduledAt?.toISOString() || null,
        expires_at: expiresAt?.toISOString() || null,
        is_active: true,
      };

      if (editingAnnouncement) {
        updateAnnouncement({ id: editingAnnouncement.id, ...data });
        toast.success("Announcement updated");
      } else {
        await createAnnouncement(data);
        toast.success("Announcement created");
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save announcement");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{editingAnnouncement ? "Edit Announcement" : "Create Announcement"}</DialogTitle>
          <DialogDescription>Create an in-app notification that will be shown to users.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="targeting">Targeting</TabsTrigger>
              <TabsTrigger value="scheduling">Scheduling</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" placeholder="Announcement title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Content *</Label>
                <Textarea id="content" placeholder="Write your announcement here..." value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
              </div>
              <div className="space-y-2">
                <Label>Style</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CTA Button Text (optional)</Label>
                  <Input placeholder="Learn more" value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>CTA URL</Label>
                  <Input placeholder="https://..." value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require Acknowledgment</Label>
                  <p className="text-sm text-muted-foreground">User must check a box before dismissing</p>
                </div>
                <Switch checked={requireAcknowledgment} onCheckedChange={setRequireAcknowledgment} />
              </div>

            </TabsContent>

            <TabsContent value="targeting" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Target Audience</Label>
                <Select value={targetType} onValueChange={(v) => { setTargetType(v); setTargetRoles([]); setTargetUserIds([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{getAllowedTargetTypes().map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {targetType === "contractor" && (
                <div className="space-y-2">
                  <Label>Contractor Group</Label>
                  <Select value={targetContractorId} onValueChange={setTargetContractorId}>
                    <SelectTrigger><SelectValue placeholder="Select a contractor" /></SelectTrigger>
                    <SelectContent>{contractors.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              {targetType === "role" && (
                <div className="space-y-2">
                  <Label>Select Roles (multiple)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map(r => (
                      <label key={r.value} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-accent">
                        <Checkbox checked={targetRoles.includes(r.value)} onCheckedChange={() => toggleRole(r.value)} />
                        <span className="text-sm">{r.label}</span>
                      </label>
                    ))}
                  </div>
                  {targetRoles.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {targetRoles.map(r => (
                        <Badge key={r} variant="secondary" className="text-xs">{ROLES.find(x => x.value === r)?.label}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {targetType === "user" && (
                <div className="space-y-2">
                  <Label>Select Users</Label>
                  <Input placeholder="Search users..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
                  {targetUserIds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {targetUserIds.map(id => {
                        const u = allUsers.find(u => u.id === id);
                        return <Badge key={id} variant="secondary" className="cursor-pointer text-xs" onClick={() => toggleUser(id)}>{u?.full_name || id} ×</Badge>;
                      })}
                    </div>
                  )}
                  <ScrollArea className="h-[180px] border rounded-md">
                    <div className="p-2 space-y-1">
                      {filteredUsers.slice(0, 50).map(u => (
                        <label key={u.id} className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent">
                          <Checkbox checked={targetUserIds.includes(u.id)} onCheckedChange={() => toggleUser(u.id)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{u.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email} · {u.contractor_id}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              <div className="space-y-2">
                <Label>Display Frequency</Label>
                <Select value={displayFrequency} onValueChange={setDisplayFrequency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority (higher = shown first)</Label>
                <Input type="number" min={0} max={100} value={priority} onChange={(e) => setPriority(parseInt(e.target.value) || 0)} />
              </div>

            </TabsContent>

            <TabsContent value="scheduling" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Schedule for Later (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !scheduledAt && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {scheduledAt ? format(scheduledAt, "PPP") : "Publish immediately"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={scheduledAt} onSelect={setScheduledAt} initialFocus />
                    {scheduledAt && <div className="p-3 border-t"><Button variant="ghost" size="sm" onClick={() => setScheduledAt(undefined)}>Clear</Button></div>}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Auto-expire on (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !expiresAt && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {expiresAt ? format(expiresAt, "PPP") : "Never expires"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={expiresAt} onSelect={setExpiresAt} initialFocus />
                    {expiresAt && <div className="p-3 border-t"><Button variant="ghost" size="sm" onClick={() => setExpiresAt(undefined)}>Clear</Button></div>}
                  </PopoverContent>
                </Popover>
              </div>

            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <div>
            {canGoBack && (
              <Button variant="outline" onClick={() => setActiveTab(tabs[currentTabIndex - 1])} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-2">
              Step {currentTabIndex + 1} of {tabs.length}
            </span>
            {canGoNext ? (
              <Button onClick={() => setActiveTab(tabs[currentTabIndex + 1])} className="gap-1">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingAnnouncement ? "Update" : "Create"} Announcement
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
