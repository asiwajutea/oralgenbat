import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportRequest {
  teamId: string;
  teamName?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { teamId, teamName }: ExportRequest = await req.json();

    if (!teamId) {
      return new Response(
        JSON.stringify({ error: 'Team ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Exporting PDFs for team: ${teamId}`);

    // Get only unexported assignments for the team (current batch)
    const { data: assignments, error: assignError } = await supabase
      .from('interview_assignments')
      .select('id, audit_id')
      .eq('team_id', teamId)
      .is('exported_at', null);

    if (assignError) {
      console.error('Error fetching assignments:', assignError);
      throw assignError;
    }

    if (!assignments || assignments.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No new assignments to export for this team' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${assignments.length} unexported assignments`);

    // Generate a unique batch ID based on timestamp
    const exportTimestamp = new Date();
    const batchId = `batch_${exportTimestamp.toISOString().replace(/[:.]/g, '-')}`;

    // Get audit details with PDF URLs
    const auditIds = assignments.map(a => a.audit_id);
    const { data: audits, error: auditError } = await supabase
      .from('audits')
      .select('id, file_name, file_url')
      .in('id', auditIds);

    if (auditError) {
      console.error('Error fetching audits:', auditError);
      throw auditError;
    }

    if (!audits || audits.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No audit files found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${audits.length} audits with PDF files`);

    // Mark all these assignments as exported
    const assignmentIds = assignments.map(a => a.id);
    const { error: updateError } = await supabase
      .from('interview_assignments')
      .update({
        exported_at: exportTimestamp.toISOString(),
        export_batch_id: batchId,
      })
      .in('id', assignmentIds);

    if (updateError) {
      console.error('Error marking assignments as exported:', updateError);
      // Don't throw - continue with the export even if marking fails
    }

    // Create a list of PDF URLs with filenames for the client to download
    const pdfList = audits.map(audit => ({
      fileName: `${audit.file_name}.pdf`,
      url: audit.file_url,
      auditId: audit.id,
    }));

    // Return the list of PDFs - client will handle the zipping
    // This avoids memory issues on the edge function
    return new Response(
      JSON.stringify({
        success: true,
        teamName: teamName || 'Unknown Team',
        totalFiles: pdfList.length,
        files: pdfList,
        exportTimestamp: exportTimestamp.toISOString(),
        batchId: batchId,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Export error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
