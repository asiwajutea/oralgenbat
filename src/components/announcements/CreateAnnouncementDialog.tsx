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
import { CalendarIcon, Loader2 } from "lucide-react";
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
  { value: "role", label: "User Role" },
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
  const [targetRole, setTargetRole] = useState<string>("");
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

  // Reset form when opening/closing or editing
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
      setTargetRole(editingAnnouncement.target_role || "");
      setPriority(editingAnnouncement.priority);
      setScheduledAt(editingAnnouncement.scheduled_at ? new Date(editingAnnouncement.scheduled_at) : undefined);
      setExpiresAt(editingAnnouncement.expires_at ? new Date(editingAnnouncement.expires_at) : undefined);
    } else if (open) {
      // Reset for new announcement
      setTitle("");
      setContent("");
      setCtaText("");
      setCtaUrl("");
      setStyle("info");
      setDisplayFrequency("once");
      setRequireAcknowledgment(false);
      setTargetType("all");
      setTargetContractorId("");
      setTargetRole("");
      setPriority(0);
      setScheduledAt(undefined);
      setExpiresAt(undefined);
    }
  }, [open, editingAnnouncement]);

  // Determine allowed target types based on user role
  const isSuperAdmin = userRole === "super_admin";
  const isContractor = userRole === "contractor";
  const isSubContractor = userRole === "sub_contractor";
  const isQAManager = userRole === "quality_assurance_manager";

  const getAllowedTargetTypes = () => {
    if (isSuperAdmin) return TARGET_TYPES;
    if (isContractor) {
      return TARGET_TYPES.filter(t => t.value === "contractor" || t.value === "all");
    }
    if (isSubContractor || isQAManager) {
      return TARGET_TYPES.filter(t => t.value === "role" || t.value === "all");
    }
    return [TARGET_TYPES[0]]; // Only "all"
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required");
      return;
    }

    setIsSaving(true);

    try {
      const data = {
        title: title.trim(),
        content: content.trim(),
        cta_text: ctaText.trim() || null,
        cta_url: ctaUrl.trim() || null,
        style: style as "info" | "warning" | "success" | "announcement",
        display_frequency: displayFrequency as "once" | "every_login" | "daily" | "weekly",
        require_acknowledgment: requireAcknowledgment,
        target_type: targetType as "all" | "contractor" | "role" | "user",
        target_contractor_id: targetType === "contractor" ? targetContractorId : null,
        target_role: targetType === "role" ? targetRole : null,
        target_user_ids: null,
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
          <DialogTitle>
            {editingAnnouncement ? "Edit Announcement" : "Create Announcement"}
          </DialogTitle>
          <DialogDescription>
            Create an in-app notification that will be shown to users.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          <Tabs defaultValue="content" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="targeting">Targeting</TabsTrigger>
              <TabsTrigger value="scheduling">Scheduling</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="space-y-4 mt-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="Announcement title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Content */}
              <div className="space-y-2">
                <Label htmlFor="content">Content *</Label>
                <Textarea
                  id="content"
                  placeholder="Write your announcement here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                />
              </div>

              {/* Style */}
              <div className="space-y-2">
                <Label>Style</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STYLES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* CTA */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cta-text">CTA Button Text (optional)</Label>
                  <Input
                    id="cta-text"
                    placeholder="Learn more"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cta-url">CTA URL</Label>
                  <Input
                    id="cta-url"
                    placeholder="https://..."
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                  />
                </div>
              </div>

              {/* Require Acknowledgment */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require Acknowledgment</Label>
                  <p className="text-sm text-muted-foreground">
                    User must check a box before dismissing
                  </p>
                </div>
                <Switch
                  checked={requireAcknowledgment}
                  onCheckedChange={setRequireAcknowledgment}
                />
              </div>
            </TabsContent>

            <TabsContent value="targeting" className="space-y-4 mt-4">
              {/* Target Type */}
              <div className="space-y-2">
                <Label>Target Audience</Label>
                <Select value={targetType} onValueChange={setTargetType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getAllowedTargetTypes().map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Contractor Selector */}
              {targetType === "contractor" && (
                <div className="space-y-2">
                  <Label>Contractor Group</Label>
                  <Select value={targetContractorId} onValueChange={setTargetContractorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a contractor" />
                    </SelectTrigger>
                    <SelectContent>
                      {contractors.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Role Selector */}
              {targetType === "role" && (
                <div className="space-y-2">
                  <Label>User Role</Label>
                  <Select value={targetRole} onValueChange={setTargetRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Display Frequency */}
              <div className="space-y-2">
                <Label>Display Frequency</Label>
                <Select value={displayFrequency} onValueChange={setDisplayFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label htmlFor="priority">Priority (higher = shown first)</Label>
                <Input
                  id="priority"
                  type="number"
                  min={0}
                  max={100}
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                />
              </div>
            </TabsContent>

            <TabsContent value="scheduling" className="space-y-4 mt-4">
              {/* Schedule */}
              <div className="space-y-2">
                <Label>Schedule for Later (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !scheduledAt && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {scheduledAt ? format(scheduledAt, "PPP") : "Publish immediately"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={scheduledAt}
                      onSelect={setScheduledAt}
                      initialFocus
                    />
                    {scheduledAt && (
                      <div className="p-3 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setScheduledAt(undefined)}
                        >
                          Clear
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Expiry */}
              <div className="space-y-2">
                <Label>Auto-expire on (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !expiresAt && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {expiresAt ? format(expiresAt, "PPP") : "Never expires"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={expiresAt}
                      onSelect={setExpiresAt}
                      initialFocus
                    />
                    {expiresAt && (
                      <div className="p-3 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpiresAt(undefined)}
                        >
                          Clear
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {editingAnnouncement ? "Update" : "Create"} Announcement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
