import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Volume2, Music, CheckCircle, Loader2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface AudioPlayerPanelProps {
  auditId: string;
  familyStoryUrl: string;
  pedigreeUrl: string;
  onDurationConfirmed: () => void;
}

const NOISE_LEVELS = [
  { label: "1 - Excellent", value: 1, percentage: 10, description: "Minimal/no noise" },
  { label: "2 - Good", value: 2, percentage: 30, description: "Light background noise" },
  { label: "3 - Fair", value: 3, percentage: 50, description: "Moderate noise" },
  { label: "4 - Poor", value: 4, percentage: 70, description: "Significant noise" },
  { label: "5 - Very Poor", value: 5, percentage: 90, description: "Mostly noise" },
];

export const AudioPlayerPanel = ({
  auditId,
  familyStoryUrl,
  pedigreeUrl,
  onDurationConfirmed,
}: AudioPlayerPanelProps) => {
  const [familyMin, setFamilyMin] = useState(0);
  const [familySec, setFamilySec] = useState(0);
  const [pedigreeMin, setPedigreeMin] = useState(0);
  const [pedigreeSec, setPedigreeSec] = useState(0);
  const [familyNoiseLevel, setFamilyNoiseLevel] = useState<number | null>(null);
  const [pedigreeNoiseLevel, setPedigreeNoiseLevel] = useState<number | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  
  const familyAudioRef = useRef<HTMLAudioElement>(null);
  const pedigreeAudioRef = useRef<HTMLAudioElement>(null);

  const handleFamilyStoryLoaded = () => {
    if (familyAudioRef.current?.duration) {
      const totalSeconds = Math.round(familyAudioRef.current.duration);
      setFamilyMin(Math.floor(totalSeconds / 60));
      setFamilySec(totalSeconds % 60);
    }
  };

  const handlePedigreeLoaded = () => {
    if (pedigreeAudioRef.current?.duration) {
      const totalSeconds = Math.round(pedigreeAudioRef.current.duration);
      setPedigreeMin(Math.floor(totalSeconds / 60));
      setPedigreeSec(totalSeconds % 60);
    }
  };

  const getNoisePercentage = (level: number | null) => {
    if (level === null) return null;
    const found = NOISE_LEVELS.find(n => n.value === level);
    return found?.percentage ?? null;
  };

  const handleConfirmDurations = async () => {
    const familyDuration = familyMin * 60 + familySec;
    const pedigreeDuration = pedigreeMin * 60 + pedigreeSec;

    if (familyDuration === 0 || pedigreeDuration === 0) {
      toast.error("Please enter valid durations for both audio files");
      return;
    }

    if (familyNoiseLevel === null || pedigreeNoiseLevel === null) {
      toast.error("Please rate the noise level for both audio files");
      return;
    }

    const familyNoisePercentage = getNoisePercentage(familyNoiseLevel);
    const pedigreeNoisePercentage = getNoisePercentage(pedigreeNoiseLevel);

    setIsConfirming(true);
    try {
      // Step 1: Save durations and noise levels to database
      const { error } = await supabase
        .from("interview_metadata")
        .update({
          family_story_duration: familyDuration,
          pedigree_segment_duration: pedigreeDuration,
          family_story_noise_level: familyNoisePercentage,
          pedigree_segment_noise_level: pedigreeNoisePercentage,
          duration_manually_confirmed: true,
        })
        .eq("audit_id", auditId);

      if (error) throw error;

      // Step 2: Regenerate AI summary with confirmed durations and noise levels
      const { error: summaryError } = await supabase.functions.invoke('regenerate-audio-summary', {
        body: { 
          auditId, 
          familyStoryDuration: familyDuration, 
          pedigreeDuration,
          familyNoiseLevel: familyNoisePercentage,
          pedigreeNoiseLevel: pedigreeNoisePercentage,
        }
      });

      if (summaryError) {
        console.warn("Summary regeneration failed:", summaryError);
        // Check for specific error types
        const errorMessage = summaryError.message || '';
        if (errorMessage.includes('402') || errorMessage.includes('credits')) {
          toast.warning("AI credits exhausted. Durations saved, but AI summary could not be generated. Please add credits to your Lovable workspace.");
        } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          toast.warning("AI rate limit reached. Durations saved, but please try regenerating summary later.");
        }
        // Don't fail the whole operation - durations are saved
      }

      toast.success("Audio durations and noise levels confirmed");
      onDurationConfirmed();
    } catch (error) {
      console.error("Error confirming durations:", error);
      toast.error("Failed to save. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  };

  const NoiseLevelSelector = ({ 
    value, 
    onChange, 
    label 
  }: { 
    value: number | null; 
    onChange: (level: number) => void;
    label: string;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {NOISE_LEVELS.map((level) => (
          <Button
            key={level.value}
            type="button"
            variant={value === level.value ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(level.value)}
            className={cn(
              "text-xs",
              value === level.value && "ring-2 ring-primary ring-offset-2"
            )}
            title={level.description}
          >
            {level.label}
          </Button>
        ))}
      </div>
      {value !== null && (
        <p className="text-xs text-muted-foreground">
          Noise level: {getNoisePercentage(value)}%
        </p>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Audio Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Play the audio files, verify duration, and rate the noise level. Audio files will be automatically deleted after review.
          </AlertDescription>
        </Alert>

        {/* Family Story Audio */}
        <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/5">
          <div className="flex items-center gap-2 mb-2">
            <Volume2 className="h-5 w-5 text-primary" />
            <h4 className="font-medium">Family Story</h4>
          </div>
          
          <audio
            ref={familyAudioRef}
            src={familyStoryUrl}
            controls
            onLoadedMetadata={handleFamilyStoryLoaded}
            className="w-full"
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="family-min">Minutes</Label>
              <Input
                id="family-min"
                type="number"
                min="0"
                value={familyMin}
                onChange={(e) => setFamilyMin(parseInt(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="family-sec">Seconds</Label>
              <Input
                id="family-sec"
                type="number"
                min="0"
                max="59"
                value={familySec}
                onChange={(e) => setFamilySec(parseInt(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Total: {familyMin}:{familySec.toString().padStart(2, "0")}
          </p>

          <NoiseLevelSelector
            value={familyNoiseLevel}
            onChange={setFamilyNoiseLevel}
            label="Rate Noise Level"
          />
        </div>

        {/* Pedigree Segment Audio */}
        <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/5">
          <div className="flex items-center gap-2 mb-2">
            <Music className="h-5 w-5 text-primary" />
            <h4 className="font-medium">Pedigree Segment</h4>
          </div>
          
          <audio
            ref={pedigreeAudioRef}
            src={pedigreeUrl}
            controls
            onLoadedMetadata={handlePedigreeLoaded}
            className="w-full"
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pedigree-min">Minutes</Label>
              <Input
                id="pedigree-min"
                type="number"
                min="0"
                value={pedigreeMin}
                onChange={(e) => setPedigreeMin(parseInt(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="pedigree-sec">Seconds</Label>
              <Input
                id="pedigree-sec"
                type="number"
                min="0"
                max="59"
                value={pedigreeSec}
                onChange={(e) => setPedigreeSec(parseInt(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Total: {pedigreeMin}:{pedigreeSec.toString().padStart(2, "0")}
          </p>

          <NoiseLevelSelector
            value={pedigreeNoiseLevel}
            onChange={setPedigreeNoiseLevel}
            label="Rate Noise Level"
          />
        </div>

        <Button
          onClick={handleConfirmDurations}
          disabled={isConfirming || familyNoiseLevel === null || pedigreeNoiseLevel === null}
          className="w-full"
        >
          {isConfirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Confirming...
            </>
          ) : (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              Confirm Durations & Noise Levels
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};