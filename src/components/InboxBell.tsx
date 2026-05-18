import { useNavigate } from "react-router-dom";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useChatUnreadTotal } from "@/hooks/useChatUnread";

const InboxBell = () => {
  const navigate = useNavigate();
  const { data: unread = 0 } = useChatUnreadTotal();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={() => navigate("/inbox")}
      aria-label="Open inbox"
    >
      <Inbox className="h-5 w-5" />
      {unread > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
        >
          {unread > 99 ? "99+" : unread}
        </Badge>
      )}
    </Button>
  );
};

export default InboxBell;