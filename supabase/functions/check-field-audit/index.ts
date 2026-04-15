import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth validation
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { file_name } = await req.json();

    if (!file_name) {
      return new Response(
        JSON.stringify({ error: 'file_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const folder_name = file_name.replace(/\.pdf$/i, '');

    const avtoolUrl = Deno.env.get('AVTOOL_SUPABASE_URL');
    const avtoolApiKey = Deno.env.get('AVTOOL_API_KEY');

    if (!avtoolUrl) {
      return new Response(
        JSON.stringify({ error: 'Configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch(`${avtoolUrl}/rest/v1/interviews?folder_name=eq.${encodeURIComponent(folder_name)}&select=id,folder_name,status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': avtoolApiKey || '',
        'Authorization': `Bearer ${avtoolApiKey || ''}`,
      },
    });

    if (!response.ok) {
      console.error('AVTool REST query error:', response.status);
      return new Response(
        JSON.stringify({ found: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rows = await response.json();
    
    if (Array.isArray(rows) && rows.length > 0) {
      const row = rows[0];
      return new Response(
        JSON.stringify({ found: true, status: row.status, folder_name: row.folder_name }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ found: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('check-field-audit error:', error);
    return new Response(
      JSON.stringify({ found: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
