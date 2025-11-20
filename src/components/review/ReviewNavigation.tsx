import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, ChevronRight } from "lucide-react";

interface ReviewNavigationProps {
  nextAuditId?: string;
}

export const ReviewNavigation = ({ nextAuditId }: ReviewNavigationProps) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between">
      <Button
        variant="ghost"
        onClick={() => navigate("/")}
        className="gap-2"
      >
        <Home className="h-4 w-4" />
        Back to Dashboard
      </Button>

      <Button
        variant="default"
        onClick={() => navigate(`/review/${nextAuditId}`)}
        disabled={!nextAuditId}
        className="gap-2"
      >
        Next Interview
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
