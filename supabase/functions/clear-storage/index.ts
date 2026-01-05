import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKETS = ['audit-pdfs', 'mobile-zips', 'interview-photos', 'interview-audio'];

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting storage cleanup for buckets:', BUCKETS);

    const results: Record<string, { deleted: number; errors: number }> = {};

    for (const bucketId of BUCKETS) {
      console.log(`Processing bucket: ${bucketId}`);
      let deletedCount = 0;
      let errorCount = 0;

      try {
        // List all files in the bucket
        const { data: files, error: listError } = await supabase.storage
          .from(bucketId)
          .list('', { limit: 1000 });

        if (listError) {
          console.error(`Error listing files in ${bucketId}:`, listError);
          errorCount++;
          results[bucketId] = { deleted: deletedCount, errors: errorCount };
          continue;
        }

        if (!files || files.length === 0) {
          console.log(`No files found in bucket: ${bucketId}`);
          results[bucketId] = { deleted: 0, errors: 0 };
          continue;
        }

        // For buckets that use folders (like audit-id based paths)
        // We need to recursively delete
        for (const item of files) {
          if (item.id === null) {
            // This is a folder, list its contents
            const { data: folderFiles, error: folderListError } = await supabase.storage
              .from(bucketId)
              .list(item.name, { limit: 1000 });

            if (folderListError) {
              console.error(`Error listing folder ${item.name}:`, folderListError);
              errorCount++;
              continue;
            }

            if (folderFiles && folderFiles.length > 0) {
              const filePaths = folderFiles.map(f => `${item.name}/${f.name}`);
              const { error: deleteError } = await supabase.storage
                .from(bucketId)
                .remove(filePaths);

              if (deleteError) {
                console.error(`Error deleting files in folder ${item.name}:`, deleteError);
                errorCount += filePaths.length;
              } else {
                deletedCount += filePaths.length;
              }
            }
          } else {
            // This is a file at the root level
            const { error: deleteError } = await supabase.storage
              .from(bucketId)
              .remove([item.name]);

            if (deleteError) {
              console.error(`Error deleting file ${item.name}:`, deleteError);
              errorCount++;
            } else {
              deletedCount++;
            }
          }
        }

        console.log(`Bucket ${bucketId}: deleted ${deletedCount} files, ${errorCount} errors`);
        results[bucketId] = { deleted: deletedCount, errors: errorCount };
      } catch (bucketError) {
        console.error(`Error processing bucket ${bucketId}:`, bucketError);
        results[bucketId] = { deleted: deletedCount, errors: errorCount + 1 };
      }
    }

    const totalDeleted = Object.values(results).reduce((sum, r) => sum + r.deleted, 0);
    const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);

    console.log(`Storage cleanup complete. Total deleted: ${totalDeleted}, Total errors: ${totalErrors}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleared ${totalDeleted} files from storage`,
        results,
        totalDeleted,
        totalErrors,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Storage cleanup error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
