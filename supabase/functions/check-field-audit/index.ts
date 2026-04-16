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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError?.message);
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
    console.log('Checking field audit for folder_name:', folder_name);

    const avtoolUrl = Deno.env.get('AVTOOL_SUPABASE_URL');
    const avtoolApiKey = Deno.env.get('AVTOOL_API_KEY');

    if (!avtoolUrl || !avtoolApiKey) {
      console.error('Missing config - AVTOOL_SUPABASE_URL:', !!avtoolUrl, 'AVTOOL_API_KEY:', !!avtoolApiKey);
      return new Response(
        JSON.stringify({ error: 'Configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestUrl = `${avtoolUrl}/rest/v1/interviews?folder_name=eq.${encodeURIComponent(folder_name)}&select=id,folder_name,status`;
    console.log('Requesting AVTool URL:', requestUrl);

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': avtoolApiKey,
        'Authorization': `Bearer ${avtoolApiKey}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('AVTool REST query error:', response.status, response.statusText);
      console.error('AVTool response body:', errorBody);
      console.error('AVTool URL used:', avtoolUrl);
      return new Response(
        JSON.stringify({ found: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rows = await response.json();
    console.log('AVTool query result for', folder_name, ':', JSON.stringify(rows));
    
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
