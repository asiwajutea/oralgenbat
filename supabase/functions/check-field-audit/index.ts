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

    // Call AVTool's get-field-audit edge function
    const response = await fetch(`${avtoolUrl}/functions/v1/get-field-audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(avtoolApiKey ? { 'api_key': avtoolApiKey } : {}),
      },
      body: JSON.stringify({ folder_name }),
    });

    if (!response.ok) {
      console.error('AVTool response error:', response.status, await response.text());
      return new Response(
        JSON.stringify({ found: false, error: 'Failed to reach AVTool' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();

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
