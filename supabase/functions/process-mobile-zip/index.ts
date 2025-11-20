import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AudioAnalysis {
  duration: number;
  noiseLevel: number;
  silenceLevel: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { auditId, mobileZipUrl } = await req.json();
    console.log("Processing mobile ZIP for audit:", auditId);

    if (!auditId || !mobileZipUrl) {
      throw new Error("Missing required parameters: auditId and mobileZipUrl");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Download ZIP file from storage
    console.log("Downloading ZIP from:", mobileZipUrl);
    const zipResponse = await fetch(mobileZipUrl);
    if (!zipResponse.ok) {
      throw new Error(`Failed to download ZIP file: ${zipResponse.statusText}`);
    }
    const zipBlob = await zipResponse.blob();
    const zipArrayBuffer = await zipBlob.arrayBuffer();
    const zipBytes = new Uint8Array(zipArrayBuffer);

    // Extract filename from URL and parse it
    const urlParts = mobileZipUrl.split("/");
    const zipFileName = urlParts[urlParts.length - 1].replace(".zip", "");
    const filenameParts = zipFileName.split("_");
    
    if (filenameParts.length < 4) {
      throw new Error(`Invalid ZIP filename format: ${zipFileName}. Expected format: CONTRACTORID_INTERVIEWERCODE_DATE_TIME`);
    }

    const contractorId = filenameParts[0];
    const interviewerCode = filenameParts[1];
    const dateStr = filenameParts[2]; // YYYYMMDD
    const timeStr = filenameParts[3]; // HHMM
    
    const interviewDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    const interviewTime = `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:00`;

    console.log("Parsed filename:", { contractorId, interviewerCode, interviewDate, interviewTime });

    // Extract ZIP using JSZip
    console.log("Extracting ZIP...");
    const zip = await JSZip.loadAsync(zipArrayBuffer);
    
    // Read metadata.json
    let metadata: any = {};
    try {
      const metadataFile = zip.file("metadata.json");
      if (metadataFile) {
        const metadataContent = await metadataFile.async("text");
        metadata = JSON.parse(metadataContent);
        console.log("Parsed metadata:", metadata);
      }
    } catch (error) {
      console.error("Error reading metadata.json:", error);
    }

    // Process photos
    const photoOrder = [
      "individual.jpg",
      "signature.jpg", 
      "path_to_home.jpg",
      "area.jpg",
      "neighborhood.jpg",
      "group.jpg"
    ];

    console.log("Uploading photos...");
    for (let i = 0; i < photoOrder.length; i++) {
      const photoName = photoOrder[i];
      try {
        const photoFile = zip.file(`photos/${photoName}`);
        if (!photoFile) {
          console.log(`Photo not found: ${photoName}`);
          continue;
        }

        const photoData = await photoFile.async("uint8array");
        const storagePath = `${auditId}/photos/${photoName}`;

        const { error: uploadError } = await supabase.storage
          .from("interview-photos")
          .upload(storagePath, photoData, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (uploadError) {
          console.error(`Error uploading ${photoName}:`, uploadError);
          continue;
        }

        // Insert into interview_photos table
        const { error: insertError } = await supabase
          .from("interview_photos")
          .insert({
            audit_id: auditId,
            file_name: photoName,
            storage_path: storagePath,
            display_order: i + 1,
          });

        if (insertError) {
          console.error(`Error inserting photo record for ${photoName}:`, insertError);
        }
      } catch (error) {
        console.error(`Error processing photo ${photoName}:`, error);
      }
    }

    // Analyze audio files
    console.log("Analyzing audio files...");
    const familyStoryFile = zip.file("family_story.mp3");
    const pedigreeSegmentFile = zip.file("pedigree_segment.mp3");
    
    const familyStoryAnalysis = familyStoryFile 
      ? await analyzeAudioFromZip(familyStoryFile)
      : { duration: 0, noiseLevel: 0, silenceLevel: 0 };
    
    const pedigreeSegmentAnalysis = pedigreeSegmentFile
      ? await analyzeAudioFromZip(pedigreeSegmentFile)
      : { duration: 0, noiseLevel: 0, silenceLevel: 0 };

    // Generate AI quality summary
    console.log("Generating AI quality summary...");
    const qualitySummary = await generateAudioQualitySummary(
      familyStoryAnalysis,
      pedigreeSegmentAnalysis
    );

    // Helper function to format full name
    const formatFullName = (person: any) => {
      if (!person) return null;
      const parts = [person.title, person.firstName, person.lastName].filter(Boolean);
      return parts.length > 0 ? parts.join(" ").trim() : null;
    };

    // Helper function to format location
    const formatLocation = (place: any) => {
      if (!place) return null;
      const parts = [place.town, place.district, place.region, place.country].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : null;
    };

    // Calculate birth year from age if available
    const calculateBirthYear = (age: number | null) => {
      if (!age) return null;
      const currentYear = new Date().getFullYear();
      return currentYear - age;
    };

    // Insert metadata into database
    const { error: metadataError } = await supabase
      .from("interview_metadata")
      .insert({
        audit_id: auditId,
        contractor_id: contractorId,
        interviewer_code: interviewerCode,
        interview_date: interviewDate,
        interview_time: interviewTime,
        
        // Interviewee details
        interviewee_title: metadata.interviewee?.title || null,
        interviewee_name: formatFullName(metadata.interviewee),
        interviewee_age: metadata.interviewee?.age || null,
        interviewee_birth_year: calculateBirthYear(metadata.interviewee?.age),
        interviewee_tribe: metadata.interviewee?.tribe || null,
        interviewee_clan: metadata.interviewee?.clan || null,
        interviewee_birth_location: formatLocation(metadata.interviewee?.birthPlace),
        interviewee_phone: metadata.interviewee?.phone || null,
        
        // Interview details
        interview_language: metadata.interview?.language || null,
        first_ancestor: formatFullName(metadata.firstAncestor),
        total_names: metadata.interview?.namesCapturedCount || null,
        interview_location: formatLocation(metadata.interview?.place),
        
        // Interviewer details
        interviewer_id: metadata.interviewer?.id || null,
        interviewer_name: formatFullName(metadata.interviewer),
        field_manager: metadata.fieldManager?.name || null,
        
        // Contractor details
        contractor_business_name: metadata.contractor?.businessName || null,
        
        // Audio analysis
        family_story_duration: familyStoryAnalysis.duration,
        family_story_noise_level: familyStoryAnalysis.noiseLevel,
        family_story_silence_level: familyStoryAnalysis.silenceLevel,
        pedigree_segment_duration: pedigreeSegmentAnalysis.duration,
        pedigree_segment_noise_level: pedigreeSegmentAnalysis.noiseLevel,
        pedigree_segment_silence_level: pedigreeSegmentAnalysis.silenceLevel,
        audio_quality_summary: qualitySummary,
      });

    if (metadataError) {
      console.error("Error inserting metadata:", metadataError);
      throw metadataError;
    }

    console.log("Mobile ZIP processing completed successfully");
    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Mobile ZIP processed successfully",
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error processing mobile ZIP:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

async function analyzeAudioFromZip(zipFile: any): Promise<AudioAnalysis> {
  try {
    console.log("Analyzing audio file from ZIP");
    
    // Read audio file as Uint8Array
    const audioData = await zipFile.async("uint8array");
    
    // For MP3 files, estimate duration from file size (rough approximation)
    // Average MP3 bitrate is ~128kbps = 16KB/s
    const estimatedDuration = Math.round(audioData.length / 16000);
    
    // Analyze audio content
    const analysis = await analyzeAudioBuffer(audioData);
    
    return {
      duration: estimatedDuration,
      noiseLevel: analysis.noiseLevel,
      silenceLevel: analysis.silenceLevel,
    };
  } catch (error) {
    console.error("Error analyzing audio:", error);
    return {
      duration: 0,
      noiseLevel: 0,
      silenceLevel: 0,
    };
  }
}

async function analyzeAudioBuffer(audioData: Uint8Array): Promise<{ noiseLevel: number; silenceLevel: number }> {
  // Simple heuristic analysis based on data patterns
  // In production, this would use proper audio decoding and FFT analysis
  
  const sampleSize = Math.min(audioData.length, 100000); // Sample first 100KB
  const samples = audioData.slice(0, sampleSize);
  
  // Calculate variance to estimate noise
  let sum = 0;
  let sumSquares = 0;
  let zeroCount = 0;
  
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    sum += value;
    sumSquares += value * value;
    if (value < 10) zeroCount++;
  }
  
  const mean = sum / samples.length;
  const variance = (sumSquares / samples.length) - (mean * mean);
  const stdDev = Math.sqrt(variance);
  
  // Normalize to percentage (0-100)
  // Higher variance = more noise
  const noiseLevel = Math.min(100, (stdDev / 128) * 100);
  
  // Silence level based on near-zero samples
  const silenceLevel = (zeroCount / samples.length) * 100;
  
  return {
    noiseLevel: Math.round(noiseLevel * 100) / 100,
    silenceLevel: Math.round(silenceLevel * 100) / 100,
  };
}

async function generateAudioQualitySummary(
  familyStory: AudioAnalysis,
  pedigreeSegment: AudioAnalysis
): Promise<string> {
  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not found");
    }

    const prompt = `Analyze these two audio recordings and provide a brief quality assessment summary (2-3 sentences):

Family Story Recording:
- Duration: ${familyStory.duration} seconds
- Noise Level: ${familyStory.noiseLevel.toFixed(1)}%
- Silence Level: ${familyStory.silenceLevel.toFixed(1)}%

Pedigree Segment Recording:
- Duration: ${pedigreeSegment.duration} seconds
- Noise Level: ${pedigreeSegment.noiseLevel.toFixed(1)}%
- Silence Level: ${pedigreeSegment.silenceLevel.toFixed(1)}%

Provide an overall quality rating (Excellent/Good/Fair/Poor) and mention any concerns about noise or silence levels.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are an audio quality assessment expert. Provide concise, professional quality assessments."
          },
          {
            role: "user",
            content: prompt
          }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Lovable AI request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Error generating AI summary:", error);
    return "Audio quality analysis unavailable.";
  }
}
