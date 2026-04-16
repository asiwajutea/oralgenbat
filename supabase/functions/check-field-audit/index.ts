import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // --- Caller auth ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return respond({ error: 'Unauthorized' }, 401);
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Caller auth failed:', authError?.message);
      return respond({ error: 'Unauthorized' }, 401);
    }

    // --- Parse & validate body ---
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return respond({ error: 'Invalid JSON body' }, 400);
    }

    const fileName = typeof body.file_name === 'string' ? body.file_name.trim() : '';
    if (!fileName) {
      return respond({ error: 'file_name is required' }, 400);
    }

    // Normalize: strip .pdf extension to get folder_name
    const folderName = fileName.replace(/\.pdf$/i, '');
    console.log(`[check-field-audit] Looking up folder_name="${folderName}" for user=${user.id}`);

    // --- External AVTool config ---
    const avtoolUrl = Deno.env.get('AVTOOL_SUPABASE_URL');
    const avtoolApiKey = Deno.env.get('AVTOOL_API_KEY');

    if (!avtoolUrl || !avtoolApiKey) {
      console.error('[check-field-audit] Missing AVTOOL_SUPABASE_URL or AVTOOL_API_KEY');
      return respond({
        found: false,
        reason: 'external_config_error',
        message: 'AVTool integration is not configured',
      });
    }

    // --- Query AVTool REST API ---
    const restUrl = `${avtoolUrl}/rest/v1/interviews?folder_name=eq.${encodeURIComponent(folderName)}&select=id,folder_name,status,reviewed_at,reviewed_by,created_at`;
    console.log(`[check-field-audit] Querying AVTool: ${restUrl}`);

    const avtoolResponse = await fetch(restUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': avtoolApiKey,
        'Authorization': `Bearer ${avtoolApiKey}`,
      },
    });

    if (!avtoolResponse.ok) {
      const errorBody = await avtoolResponse.text();
      console.error(`[check-field-audit] AVTool error ${avtoolResponse.status}: ${errorBody}`);

      // Distinguish auth errors from other errors
      if (avtoolResponse.status === 401 || avtoolResponse.status === 403) {
        return respond({
          found: false,
          reason: 'external_auth_error',
          message: 'AVTool rejected the credentials. The API key may need to be updated.',
        });
      }

      return respond({
        found: false,
        reason: 'external_error',
        message: `AVTool returned HTTP ${avtoolResponse.status}`,
      });
    }

    const rows = await avtoolResponse.json();
    console.log(`[check-field-audit] AVTool returned ${Array.isArray(rows) ? rows.length : 0} rows for "${folderName}"`);

    if (Array.isArray(rows) && rows.length > 0) {
      const row = rows[0];
      return respond({
        found: true,
        status: row.status ?? null,
        folder_name: row.folder_name ?? folderName,
        reviewed_at: row.reviewed_at ?? null,
        reviewed_by: row.reviewed_by ?? null,
        created_at: row.created_at ?? null,
      });
    }

    return respond({ found: false, reason: 'not_found' });
  } catch (error) {
    console.error('[check-field-audit] Unexpected error:', error);
    return respond({ found: false, reason: 'internal_error', message: 'Unexpected server error' });
  }
});
