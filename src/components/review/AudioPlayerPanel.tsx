import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Volume2, Music, CheckCircle, Loader2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AudioPlayerPanelProps {
  auditId: string;
  familyStoryUrl: string;
  pedigreeUrl: string;
  onDurationConfirmed: () => void;
}

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

  const handleConfirmDurations = async () => {
    const familyDuration = familyMin * 60 + familySec;
    const pedigreeDuration = pedigreeMin * 60 + pedigreeSec;

    if (familyDuration === 0 || pedigreeDuration === 0) {
      toast.error("Please enter valid durations for both audio files");
      return;
    }

    setIsConfirming(true);
    try {
      const { error } = await supabase
        .from("interview_metadata")
        .update({
          family_story_duration: familyDuration,
          pedigree_segment_duration: pedigreeDuration,
          duration_manually_confirmed: true,
        })
        .eq("audit_id", auditId);

      if (error) throw error;

      toast.success("Audio durations confirmed successfully");
      onDurationConfirmed();
    } catch (error) {
      console.error("Error confirming durations:", error);
      toast.error("Failed to save durations. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Audio Duration Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Play the audio files to verify duration, then confirm. Audio files will be automatically deleted after the interview is reviewed.
          </AlertDescription>
        </Alert>

        {/* Family Story Audio */}
        <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/5">
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

          <div className="grid grid-cols-2 gap-4 mt-4">
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
        </div>

        {/* Pedigree Segment Audio */}
        <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/5">
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

          <div className="grid grid-cols-2 gap-4 mt-4">
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
        </div>

        <Button
          onClick={handleConfirmDurations}
          disabled={isConfirming}
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
              Confirm Durations
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
