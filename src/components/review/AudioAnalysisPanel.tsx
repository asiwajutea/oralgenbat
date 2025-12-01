import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Volume2, Music, CheckCircle, AlertTriangle } from "lucide-react";

interface AudioAnalysisPanelProps {
  metadata: any;
}

export const AudioAnalysisPanel = ({ metadata }: AudioAnalysisPanelProps) => {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const AudioMetrics = ({
    title,
    duration,
    noiseLevel,
    silenceLevel,
    icon: Icon,
  }: {
    title: string;
    duration: number;
    noiseLevel: number;
    silenceLevel: number;
    icon: any;
  }) => (
    <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/5">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h4 className="font-medium">{title}</h4>
          <p className="text-sm text-muted-foreground">
            Duration: {formatDuration(duration)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Noise Level</span>
            <span className="font-medium">{noiseLevel?.toFixed(1) || 0}%</span>
          </div>
          <Progress value={Math.min(noiseLevel || 0, 100)} className="h-2" />
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Silence Level</span>
            <span className="font-medium">{silenceLevel?.toFixed(1) || 0}%</span>
          </div>
          <Progress value={Math.min(silenceLevel || 0, 100)} className="h-2" />
        </div>
      </div>
    </div>
  );

  const isManuallyConfirmed = metadata.duration_manually_confirmed === true;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Audio Analysis</CardTitle>
          {isManuallyConfirmed ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Manually Verified
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Auto-parsed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <AudioMetrics
          title="Family Story"
          duration={metadata.family_story_duration || 0}
          noiseLevel={metadata.family_story_noise_level || 0}
          silenceLevel={metadata.family_story_silence_level || 0}
          icon={Volume2}
        />

        <AudioMetrics
          title="Pedigree Segment"
          duration={metadata.pedigree_segment_duration || 0}
          noiseLevel={metadata.pedigree_segment_noise_level || 0}
          silenceLevel={metadata.pedigree_segment_silence_level || 0}
          icon={Music}
        />

        {metadata.audio_quality_summary && (
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <h4 className="font-medium mb-2 text-sm">Quality Summary</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {metadata.audio_quality_summary}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
