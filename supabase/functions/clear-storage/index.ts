import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKETS = ['audit-pdfs', 'mobile-zips', 'interview-photos', 'interview-audio'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    const { data: isSuperAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'super_admin' });
    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Starting storage cleanup for buckets:', BUCKETS);

    const results: Record<string, { deleted: number; errors: number }> = {};

    for (const bucketId of BUCKETS) {
      console.log(`Processing bucket: ${bucketId}`);
      let deletedCount = 0;
      let errorCount = 0;

      try {
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
          results[bucketId] = { deleted: 0, errors: 0 };
          continue;
        }

        for (const item of files) {
          if (item.id === null) {
            const { data: folderFiles, error: folderListError } = await supabase.storage
              .from(bucketId)
              .list(item.name, { limit: 1000 });

            if (folderListError) {
              errorCount++;
              continue;
            }

            if (folderFiles && folderFiles.length > 0) {
              const filePaths = folderFiles.map(f => `${item.name}/${f.name}`);
              const { error: deleteError } = await supabase.storage
                .from(bucketId)
                .remove(filePaths);

              if (deleteError) {
                errorCount += filePaths.length;
              } else {
                deletedCount += filePaths.length;
              }
            }
          } else {
            const { error: deleteError } = await supabase.storage
              .from(bucketId)
              .remove([item.name]);

            if (deleteError) {
              errorCount++;
            } else {
              deletedCount++;
            }
          }
        }

        results[bucketId] = { deleted: deletedCount, errors: errorCount };
      } catch (bucketError) {
        results[bucketId] = { deleted: deletedCount, errors: errorCount + 1 };
      }
    }

    const totalDeleted = Object.values(results).reduce((sum, r) => sum + r.deleted, 0);
    const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);

    return new Response(
      JSON.stringify({ success: true, message: `Cleared ${totalDeleted} files from storage`, results, totalDeleted, totalErrors }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
