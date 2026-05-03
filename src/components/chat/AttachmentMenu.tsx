import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Paperclip, Link2, FileSearch, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type Attachment = { name: string; url: string; size: number; mime: string };
type InterviewRef = { audit_id: string; file_name: string };
type InternalLink = { label: string; path: string };

const PRESET_LINKS: InternalLink[] = [
  { label: "Tracking", path: "/interview-tracking" },
  { label: "Notice Board", path: "/notices" },
  { label: "Analytics", path: "/analytics" },
  { label: "Team Assignments", path: "/admin/team-assignments" },
  { label: "Inbox", path: "/inbox" },
];

interface Props {
  onAttach: (a: Attachment) => void;
  onInterview: (r: InterviewRef) => void;
  onLink: (l: InternalLink) => void;
}

export const AttachmentMenu = ({ onAttach, onInterview, onLink }: Props) => {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<InterviewRef[]>([]);
  const [searching, setSearching] = useState(false);

  const handleFile = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("chat-attachments").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      onAttach({ name: file.name, url: data.publicUrl, size: file.size, mime: file.type });
      toast.success("File attached");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const searchInterviews = async (q: string) => {
    setSearch(q);
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("audits")
      .select("id, file_name")
      .ilike("file_name", `%${q}%`)
      .limit(10);
    setResults((data || []).map((r) => ({ audit_id: r.id, file_name: r.file_name })));
    setSearching(false);
  };

  return (
    <div className="flex items-center gap-1">
      <input ref={fileRef} type="file" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={uploading} onClick={() => fileRef.current?.click()} title="Attach file">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Reference an interview">
            <FileSearch className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <Input placeholder="Search file_name…" value={search} onChange={(e) => searchInterviews(e.target.value)} />
          <ScrollArea className="h-56 mt-2">
            {searching ? (
              <div className="text-xs text-muted-foreground p-2 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Searching…</div>
            ) : results.length === 0 ? (
              <div className="text-xs text-muted-foreground p-2">Type to search interviews</div>
            ) : (
              results.map((r) => (
                <button key={r.audit_id} onClick={() => onInterview(r)} className="block w-full text-left text-xs px-2 py-1.5 hover:bg-accent rounded">
                  {r.file_name}
                </button>
              ))
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Insert internal link">
            <Link2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56">
          <p className="text-xs font-medium mb-2">Insert link to…</p>
          <div className="space-y-1">
            {PRESET_LINKS.map((l) => (
              <button key={l.path} onClick={() => onLink(l)} className="block w-full text-left text-xs px-2 py-1.5 hover:bg-accent rounded">
                {l.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};