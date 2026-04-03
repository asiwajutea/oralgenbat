import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_name } = await req.json();

    if (!file_name) {
      return new Response(
        JSON.stringify({ error: 'file_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract folder_name from file_name (remove .pdf extension if present)
    const folder_name = file_name.replace(/\.pdf$/i, '');

    const avtoolUrl = Deno.env.get('AVTOOL_SUPABASE_URL');
    const avtoolApiKey = Deno.env.get('AVTOOL_API_KEY');

    if (!avtoolUrl) {
      return new Response(
        JSON.stringify({ error: 'AVTool URL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query AVTool's database directly via REST API to check folder existence regardless of status
    const response = await fetch(`${avtoolUrl}/rest/v1/interviews?folder_name=eq.${encodeURIComponent(folder_name)}&select=id,folder_name,status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': avtoolApiKey || '',
        'Authorization': `Bearer ${avtoolApiKey || ''}`,
      },
    });

    if (!response.ok) {
      console.error('AVTool REST query error:', response.status, await response.text());
      return new Response(
        JSON.stringify({ found: false, error: 'Failed to query AVTool' }),
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

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('check-field-audit error:', error);
    return new Response(
      JSON.stringify({ found: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
