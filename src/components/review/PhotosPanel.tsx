import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Photo {
  id: string;
  file_name: string;
  storage_path: string;
  display_order: number;
}

interface PhotosPanelProps {
  photos: Photo[];
  auditId: string;
}

export const PhotosPanel = ({ photos, auditId }: PhotosPanelProps) => {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  if (!photos || photos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No photos available
          </p>
        </CardContent>
      </Card>
    );
  }

  const currentPhoto = photos[currentPhotoIndex];
  const photoUrl = supabase.storage
    .from("interview-photos")
    .getPublicUrl(currentPhoto.storage_path).data.publicUrl;

  const goToPrevious = () => {
    setCurrentPhotoIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const goToNext = () => {
    setCurrentPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  const openFullscreen = () => {
    window.open(photoUrl, "_blank");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">Photos</CardTitle>
        <span className="text-sm text-muted-foreground">
          Photo {currentPhotoIndex + 1} of {photos.length}: {currentPhoto.file_name}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
          <img
            src={photoUrl}
            alt={currentPhoto.file_name}
            className="w-full h-full object-contain"
          />
          <Button
            size="icon"
            variant="secondary"
            className="absolute top-2 right-2"
            onClick={openFullscreen}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={goToPrevious}
            disabled={photos.length <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex gap-1">
            {photos.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentPhotoIndex(index)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  index === currentPhotoIndex
                    ? "bg-primary"
                    : "bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          <Button
            size="icon"
            variant="outline"
            onClick={goToNext}
            disabled={photos.length <= 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
