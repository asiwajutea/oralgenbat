import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

interface MetadataPanelProps {
  metadata: any;
}

export const MetadataPanel = ({ metadata }: MetadataPanelProps) => {
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  const formatTime = (timeStr: string) => {
    try {
      const [hours, minutes] = timeStr.split(":");
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    } catch {
      return timeStr;
    }
  };

  const MetadataRow = ({ label, value }: { label: string; value: any }) => (
    <div className="grid grid-cols-2 gap-4 py-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value || "—"}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Interviewee Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Interviewee Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <MetadataRow label="Title" value={metadata.interviewee_title} />
          <MetadataRow label="Name" value={metadata.interviewee_name} />
          <MetadataRow label="Age" value={metadata.interviewee_age} />
          <MetadataRow label="Birth Year" value={metadata.interviewee_birth_year} />
          <MetadataRow label="Tribe" value={metadata.interviewee_tribe} />
          <MetadataRow label="Clan" value={metadata.interviewee_clan} />
          <MetadataRow label="Birth Location" value={metadata.interviewee_birth_location} />
          <MetadataRow label="Phone" value={metadata.interviewee_phone} />
        </CardContent>
      </Card>

      {/* Interview Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Interview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <MetadataRow label="Date" value={formatDate(metadata.interview_date)} />
          <MetadataRow label="Time" value={formatTime(metadata.interview_time)} />
          <MetadataRow label="Language" value={metadata.interview_language} />
          <MetadataRow label="Location" value={metadata.interview_location} />
          <MetadataRow label="First Ancestor" value={metadata.first_ancestor} />
          <MetadataRow label="Total Names" value={metadata.total_names} />
        </CardContent>
      </Card>

      {/* Interviewer Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Interviewer Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <MetadataRow label="Interviewer ID" value={metadata.interviewer_code} />
          <MetadataRow label="Name" value={metadata.interviewer_name} />
          <MetadataRow label="Field Manager" value={metadata.field_manager} />
        </CardContent>
      </Card>

      {/* Contractor Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contractor Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <MetadataRow label="Contractor ID" value={metadata.contractor_id} />
          <MetadataRow label="Business Name" value={metadata.contractor_business_name} />
        </CardContent>
      </Card>
    </div>
  );
};
