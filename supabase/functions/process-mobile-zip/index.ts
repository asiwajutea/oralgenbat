import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { parseBuffer } from "https://esm.sh/music-metadata@10.1.0";

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

    // Extract file path from URL for direct storage access
    const storageUrlParts = mobileZipUrl.split("/storage/v1/object/public/mobile-zips/");
    const storagePath = storageUrlParts[1];
    console.log("Downloading ZIP from storage path:", storagePath);

    // Retry logic for downloading - file might need time to propagate
    let zipBytes: Uint8Array | null = null;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Download attempt ${attempt}/3...`);
        
        // Use Supabase Storage API directly instead of public URL
        const { data, error } = await supabase.storage
          .from("mobile-zips")
          .download(storagePath);

        if (error) {
          throw new Error(`Storage download error: ${error.message}`);
        }

        if (!data) {
          throw new Error("No data returned from storage");
        }

        const arrayBuffer = await data.arrayBuffer();
        zipBytes = new Uint8Array(arrayBuffer);
        
        console.log(`Downloaded ${zipBytes.length} bytes`);
        
        // Validate size
        if (zipBytes.length === 0) {
          throw new Error("Downloaded ZIP file is empty (0 bytes)");
        }
        
        if (zipBytes.length < 100) {
          throw new Error(`File too small to be valid ZIP (${zipBytes.length} bytes)`);
        }
        
        // Validate ZIP file signature (should start with "PK")
        const isValidStart = zipBytes[0] === 0x50 && zipBytes[1] === 0x4B;
        if (!isValidStart) {
          const firstBytes = Array.from(zipBytes.slice(0, 10))
            .map(b => b.toString(16).padStart(2, '0')).join(' ');
          throw new Error(`Invalid ZIP start signature. First bytes: ${firstBytes}`);
        }
        
        // Validate ZIP has End of Central Directory (EOCD) signature
        // EOCD signature is "PK\x05\x06" (0x50 0x4B 0x05 0x06)
        // It should be in the last 65KB of the file
        const searchStart = Math.max(0, zipBytes.length - 65536);
        let foundEOCD = false;
        let eocdOffset = -1;
        
        for (let i = zipBytes.length - 22; i >= searchStart; i--) {
          if (zipBytes[i] === 0x50 && zipBytes[i+1] === 0x4B && 
              zipBytes[i+2] === 0x05 && zipBytes[i+3] === 0x06) {
            foundEOCD = true;
            eocdOffset = i;
            console.log(`✓ Found EOCD at offset ${i}`);
            break;
          }
        }
        
        if (!foundEOCD) {
          // Log diagnostic information
          const lastBytes = Array.from(zipBytes.slice(-100))
            .map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.warn(`⚠️ EOCD not found in expected location. Last 100 bytes: ${lastBytes}`);
          console.warn(`File size: ${zipBytes.length}, searched from ${searchStart} to ${zipBytes.length - 22}`);
          
          // Don't fail here - let JSZip try to parse it
          console.log('Proceeding with JSZip parsing despite missing EOCD in expected location...');
        } else {
          console.log(`✓ Valid ZIP file structure detected (${zipBytes.length} bytes, EOCD at ${eocdOffset})`);
        }
        
        console.log(`✓ ZIP file downloaded successfully (${zipBytes.length} bytes)`);
        break; // Success!
        
      } catch (error) {
        lastError = error as Error;
        console.error(`Attempt ${attempt} failed:`, error);
        
        if (attempt < 3) {
          const delayMs = attempt * 2000; // 2s, 4s
          console.log(`Waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    if (!zipBytes) {
      throw new Error(`Failed to download valid ZIP after 3 attempts: ${lastError?.message || 'Unknown error'}`);
    }

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

    // Extract ZIP using JSZip with better error handling
    console.log("Attempting to extract ZIP with JSZip...");
    let zip;
    try {
      // Try loading the Uint8Array directly
      zip = await JSZip.loadAsync(zipBytes);
      console.log("✓ ZIP file loaded successfully with JSZip");
      
      // Log what's inside
      const fileList = Object.keys(zip.files);
      console.log(`ZIP contains ${fileList.length} files:`, fileList);
    } catch (zipError) {
      console.error("JSZip loading failed with error:", zipError);
      console.error("Error name:", zipError instanceof Error ? zipError.name : 'unknown');
      console.error("Error message:", zipError instanceof Error ? zipError.message : 'unknown');
      
      // Log more diagnostic info
      const centralDirSignatures: string[] = [];
      for (let i = 0; i < zipBytes.length - 3; i++) {
        if (zipBytes[i] === 0x50 && zipBytes[i+1] === 0x4B) {
          const sig = `${zipBytes[i].toString(16)}${zipBytes[i+1].toString(16)}${zipBytes[i+2].toString(16)}${zipBytes[i+3].toString(16)}`;
          if (!centralDirSignatures.includes(sig)) {
            centralDirSignatures.push(sig);
          }
        }
      }
      console.error("Found ZIP signatures:", centralDirSignatures);
      
      throw new Error(`Failed to parse ZIP file: ${zipError instanceof Error ? zipError.message : 'Unknown error'}. The ZIP file may be corrupted, use an unsupported format (ZIP64), or be incomplete. Please verify the file can be opened locally.`);
    }

    // Detect base path - files may be nested in a folder matching the ZIP name
    const allFiles = Object.keys(zip.files);
    let basePath = '';
    
    // Check if all files are nested in a single root folder
    const nonEmptyFiles = allFiles.filter(f => !f.endsWith('/'));
    if (nonEmptyFiles.length > 0) {
      const firstSlashIndex = nonEmptyFiles[0].indexOf('/');
      if (firstSlashIndex > 0) {
        const potentialRoot = nonEmptyFiles[0].substring(0, firstSlashIndex + 1);
        const allInSameRoot = nonEmptyFiles.every(f => f.startsWith(potentialRoot));
        if (allInSameRoot) {
          basePath = potentialRoot;
          console.log(`Detected nested structure with base path: "${basePath}"`);
        }
      }
    }

    // Helper function to find a file with flexible path matching
    const findFile = (filename: string, subfolder?: string): any => {
      const searchPaths = [];
      
      if (subfolder) {
        // Try with subfolder
        searchPaths.push(`${basePath}${subfolder}/${filename}`);
        searchPaths.push(`${subfolder}/${filename}`);
        searchPaths.push(`${basePath}${subfolder.toLowerCase()}/${filename}`);
        searchPaths.push(`${subfolder.toLowerCase()}/${filename}`);
      }
      
      // Try at base path level
      searchPaths.push(`${basePath}${filename}`);
      // Try at root level
      searchPaths.push(filename);
      // Try lowercase
      searchPaths.push(`${basePath}${filename.toLowerCase()}`);
      searchPaths.push(filename.toLowerCase());
      
      for (const path of searchPaths) {
        const file = zip.file(path);
        if (file) {
          console.log(`Found file "${filename}" at path: "${path}"`);
          return file;
        }
      }
      
      // Last resort: search all files for matching filename
      const matchingFile = allFiles.find(f => {
        const parts = f.split('/');
        const name = parts[parts.length - 1];
        return name.toLowerCase() === filename.toLowerCase();
      });
      
      if (matchingFile) {
        console.log(`Found file "${filename}" via search at: "${matchingFile}"`);
        return zip.file(matchingFile);
      }
      
      return null;
    };
    
    // Read metadata.json
    let metadata: any = {};
    try {
      const metadataFile = findFile("metadata.json");
      if (metadataFile) {
        const metadataContent = await metadataFile.async("text");
        metadata = JSON.parse(metadataContent);
        console.log("✓ Successfully parsed metadata.json:", JSON.stringify(metadata, null, 2));
      } else {
        console.warn("⚠️ metadata.json not found in ZIP. Searched paths but file was not located.");
        console.warn("Available files:", allFiles);
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
        // Try to find photo in photos subfolder first, then at root
        const photoFile = findFile(photoName, "photos");
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

    // Upload audio files to storage for manual verification
    console.log("Uploading audio files for manual verification...");
    let familyStoryAudioUrl: string | null = null;
    let pedigreeAudioUrl: string | null = null;

    const familyStoryFile = findFile("family_story.mp3");
    if (familyStoryFile) {
      const audioData = await familyStoryFile.async("uint8array");
      const storagePath = `${auditId}/family_story.mp3`;
      
      const { error: uploadError } = await supabase.storage
        .from("interview-audio")
        .upload(storagePath, audioData, {
          contentType: "audio/mpeg",
          upsert: true,
        });

      if (uploadError) {
        console.error("Error uploading family story audio:", uploadError);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from("interview-audio")
          .getPublicUrl(storagePath);
        familyStoryAudioUrl = publicUrl;
        console.log("✓ Family story audio uploaded:", publicUrl);
      }
    } else {
      console.log("family_story.mp3 not found in ZIP");
    }

    const pedigreeSegmentFile = findFile("pedigree_segment.mp3");
    if (pedigreeSegmentFile) {
      const audioData = await pedigreeSegmentFile.async("uint8array");
      const storagePath = `${auditId}/pedigree_segment.mp3`;
      
      const { error: uploadError } = await supabase.storage
        .from("interview-audio")
        .upload(storagePath, audioData, {
          contentType: "audio/mpeg",
          upsert: true,
        });

      if (uploadError) {
        console.error("Error uploading pedigree audio:", uploadError);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from("interview-audio")
          .getPublicUrl(storagePath);
        pedigreeAudioUrl = publicUrl;
        console.log("✓ Pedigree audio uploaded:", publicUrl);
      }
    } else {
      console.log("pedigree_segment.mp3 not found in ZIP");
    }

    // Analyze audio files (for initial estimates, will be manually verified)
    console.log("Analyzing audio files...");
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
        
        // Audio file URLs for manual verification
        family_story_audio_url: familyStoryAudioUrl,
        pedigree_segment_audio_url: pedigreeAudioUrl,
        duration_manually_confirmed: false,
      });

    if (metadataError) {
      console.error("Error inserting metadata:", metadataError);
      throw metadataError;
    }

    // Automatically trigger PDF analysis
    console.log("Triggering automatic PDF analysis...");
    try {
      const { data: pdfAnalysisResult, error: pdfAnalysisError } = await supabase.functions.invoke(
        'analyze-pdf',
        {
          body: { auditId }
        }
      );

      if (pdfAnalysisError) {
        console.warn("PDF analysis failed (non-critical):", pdfAnalysisError.message);
        console.warn("PDF can be analyzed manually later from the Review page");
      } else {
        console.log("✓ PDF analysis completed successfully:", pdfAnalysisResult);
      }
    } catch (pdfAnalysisException) {
      console.warn("PDF analysis encountered an error (non-critical):", pdfAnalysisException);
      console.warn("PDF can be analyzed manually later from the Review page");
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
    console.log(`Audio file size: ${audioData.length} bytes (${(audioData.length / 1024).toFixed(2)} KB)`);
    
    let duration = 0;
    
    // Method 1: Try music-metadata parsing
    try {
      console.log("Attempting music-metadata parsing...");
      const metadata = await parseBuffer(audioData, { mimeType: 'audio/mpeg' });
      console.log(`Metadata format:`, JSON.stringify(metadata.format));
      
      if (metadata.format.duration && metadata.format.duration > 0) {
        duration = Math.round(metadata.format.duration);
        console.log(`✓ Parsed MP3 duration from metadata: ${duration} seconds`);
      } else {
        console.log("Metadata parsing returned 0 or null duration, trying fallback methods...");
        throw new Error("No valid duration in metadata");
      }
    } catch (parseError) {
      console.error("Music-metadata parsing failed:", parseError);
      
      // Method 2: Try MP3 frame parsing (most common format)
      console.log("Attempting MP3 frame detection...");
      duration = estimateMP3DurationFromFrames(audioData);
      
      if (duration > 0) {
        console.log(`✓ Calculated MP3 duration: ${duration} seconds`);
      } else {
        // Method 3: Fall back to AAC/ADTS frame detection
        console.log("MP3 parsing failed, attempting AAC/ADTS frame detection...");
        duration = estimateAACDurationFromFrames(audioData);
        console.log(`✓ Calculated AAC duration: ${duration} seconds`);
      }
    }
    
    console.log(`Final calculated duration: ${duration} seconds`);
    
    // Analyze audio content for noise/silence levels
    const analysis = await analyzeAudioBuffer(audioData);
    
    return {
      duration,
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

// Helper function to estimate duration from MP3 frames
function estimateMP3DurationFromFrames(audioData: Uint8Array): number {
  let frameCount = 0;
  let sampleRate = 44100; // Default
  let offset = 0;
  const SAMPLES_PER_MP3_FRAME = 1152; // For MPEG1 Layer 3
  
  // Bitrate tables for MPEG1 Layer 3 (in kbps)
  const bitratesV1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const sampleRates = [44100, 48000, 32000];
  
  while (offset < audioData.length - 4) {
    // Check for MP3 sync word (11 bits set: 0xFFE or higher)
    if (audioData[offset] === 0xFF && (audioData[offset + 1] & 0xE0) === 0xE0) {
      const byte1 = audioData[offset + 1];
      const byte2 = audioData[offset + 2];
      
      // Extract MPEG version (bits 11-12 of byte1)
      const version = (byte1 >> 3) & 0x03;
      // Extract layer (bits 13-14 of byte1)
      const layer = (byte1 >> 1) & 0x03;
      
      // We want MPEG1 (version=3) Layer 3 (layer=1)
      if (version === 3 && layer === 1) {
        // Extract bitrate index (bits 16-19 of byte2)
        const bitrateIndex = (byte2 >> 4) & 0x0F;
        // Extract sample rate index (bits 20-21 of byte2)
        const sampleRateIndex = (byte2 >> 2) & 0x03;
        // Extract padding bit (bit 22 of byte2)
        const padding = (byte2 >> 1) & 0x01;
        
        if (bitrateIndex !== 0 && bitrateIndex !== 15 && sampleRateIndex !== 3) {
          const bitrate = bitratesV1L3[bitrateIndex];
          if (frameCount === 0) {
            sampleRate = sampleRates[sampleRateIndex];
          }
          
          // Calculate frame length: (144 * bitrate * 1000) / sampleRate + padding
          const frameLength = Math.floor((144 * bitrate * 1000) / sampleRate) + padding;
          
          if (frameLength > 0 && frameLength < 2881) { // Max MP3 frame size
            frameCount++;
            offset += frameLength;
            continue;
          }
        }
      }
    }
    offset++;
  }
  
  console.log(`Detected ${frameCount} MP3 frames, sample rate: ${sampleRate} Hz`);
  
  if (frameCount > 0) {
    const duration = Math.round((frameCount * SAMPLES_PER_MP3_FRAME) / sampleRate);
    return duration;
  }
  
  return 0;
}

// Helper function to estimate duration from AAC/ADTS frames
function estimateAACDurationFromFrames(audioData: Uint8Array): number {
  let frameCount = 0;
  let sampleRate = 44100; // Default
  let offset = 0;
  
  // AAC frame = 1024 samples
  const SAMPLES_PER_AAC_FRAME = 1024;
  
  // Sample rate lookup table for AAC/ADTS
  const sampleRates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  
  while (offset < audioData.length - 7) {
    // Check for ADTS sync word (0xFFF)
    if (audioData[offset] === 0xFF && (audioData[offset + 1] & 0xF0) === 0xF0) {
      // Extract sample rate index from header
      const sampleRateIndex = (audioData[offset + 2] >> 2) & 0x0F;
      if (sampleRateIndex < sampleRates.length && frameCount === 0) {
        sampleRate = sampleRates[sampleRateIndex];
      }
      
      // Extract frame length from ADTS header
      const frameLength = ((audioData[offset + 3] & 0x03) << 11) |
                         (audioData[offset + 4] << 3) |
                         ((audioData[offset + 5] >> 5) & 0x07);
      
      if (frameLength > 0 && frameLength < 8192) {
        frameCount++;
        offset += frameLength;
      } else {
        offset++;
      }
    } else {
      offset++;
    }
  }
  
  console.log(`Detected ${frameCount} AAC frames, sample rate: ${sampleRate} Hz`);
  
  if (frameCount > 0) {
    const duration = Math.round((frameCount * SAMPLES_PER_AAC_FRAME) / sampleRate);
    return duration;
  }
  
  return 0;
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

    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const systemPrompt = `You are assessing audio recordings for a field genealogy interview project conducted in open outdoor spaces in Africa. These are NOT studio recordings - ambient environmental sounds from ongoing activities nearby are completely normal and acceptable.

KEY PROJECT STANDARDS:
- Family Story recording should be at least 10 minutes (600 seconds)
- Pedigree Segment recording should be at least 15 minutes (900 seconds)
- Continuous dialogue is expected throughout - extended silent periods indicate potential issues
- Background ambient sounds do NOT affect quality rating

IMPORTANT: Base your assessment ONLY on recording duration. Do not comment on noise levels.`;

    const prompt = `Assess these two field interview recordings:

Family Story Recording: ${formatDuration(familyStory.duration)} (${familyStory.duration} seconds)
- Minimum required: 10:00 (600 seconds)

Pedigree Segment Recording: ${formatDuration(pedigreeSegment.duration)} (${pedigreeSegment.duration} seconds)
- Minimum required: 15:00 (900 seconds)

Provide a brief quality assessment (2-3 sentences) with an overall rating:
- Excellent: Both recordings meet or exceed duration requirements
- Good: Both recordings close to requirements (within 10% below minimum)
- Fair: One recording significantly below requirement
- Poor: Both recordings significantly below requirements`;

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
            content: systemPrompt
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
