import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportRequest {
  teamId: string;
  teamName?: string;
  batchId?: string; // For re-downloading a specific batch
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

    // Get auth user for tracking who exported
    const authHeader = req.headers.get('Authorization');
    let exportedBy: string | null = null;
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      exportedBy = user?.id || null;
    }

    const { teamId, teamName, batchId }: ExportRequest = await req.json();

    if (!teamId) {
      return new Response(
        JSON.stringify({ error: 'Team ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Exporting PDFs for team: ${teamId}${batchId ? ` (re-download batch: ${batchId})` : ''}`);

    // If re-downloading a specific batch
    if (batchId) {
      const { data: batch, error: batchError } = await supabase
        .from('team_export_batches')
        .select('*')
        .eq('export_batch_id', batchId)
        .eq('team_id', teamId)
        .single();

      if (batchError || !batch) {
        return new Response(
          JSON.stringify({ error: 'Batch not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get audit files for this batch
      const fileNames = batch.file_names as string[];
      const { data: audits } = await supabase
        .from('audits')
        .select('id, file_name, file_url')
        .in('file_name', fileNames);

      const pdfList = audits?.map(audit => ({
        fileName: `${audit.file_name}.pdf`,
        url: audit.file_url,
        auditId: audit.id,
      })) || [];

      return new Response(
        JSON.stringify({
          success: true,
          teamName: teamName || 'Unknown Team',
          totalFiles: pdfList.length,
          files: pdfList,
          exportTimestamp: batch.exported_at,
          batchId: batch.export_batch_id,
          isRedownload: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get only unexported assignments for the team (current batch)
    const { data: assignments, error: assignError } = await supabase
      .from('interview_assignments')
      .select('id, audit_id, total_names')
      .eq('team_id', teamId)
      .is('exported_at', null);

    if (assignError) {
      console.error('Error fetching assignments:', assignError);
      throw assignError;
    }

    if (!assignments || assignments.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          files: [], 
          message: 'No new assignments to export for this team' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${assignments.length} unexported assignments`);

    // Generate a unique batch ID based on timestamp
    const exportTimestamp = new Date();
    const exportBatchId = `batch_${exportTimestamp.toISOString().replace(/[:.]/g, '-')}`;

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
        JSON.stringify({ 
          success: false, 
          files: [], 
          message: 'No audit files found for these assignments' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${audits.length} audits with PDF files`);

    // Calculate total names for this batch
    const totalNames = assignments.reduce((sum, a) => sum + (a.total_names || 0), 0);

    // Mark all these assignments as exported
    const assignmentIds = assignments.map(a => a.id);
    const { error: updateError } = await supabase
      .from('interview_assignments')
      .update({
        exported_at: exportTimestamp.toISOString(),
        export_batch_id: exportBatchId,
      })
      .in('id', assignmentIds);

    if (updateError) {
      console.error('Error marking assignments as exported:', updateError);
      // Don't throw - continue with the export even if marking fails
    }

    // Save export batch record for history
    const fileNames = audits.map(a => a.file_name);
    const { error: batchInsertError } = await supabase
      .from('team_export_batches')
      .insert({
        team_id: teamId,
        export_batch_id: exportBatchId,
        exported_at: exportTimestamp.toISOString(),
        exported_by: exportedBy,
        total_files: audits.length,
        total_names: totalNames,
        file_names: fileNames,
      });

    if (batchInsertError) {
      console.error('Error saving export batch:', batchInsertError);
      // Don't throw - batch was still exported successfully
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
        totalNames: totalNames,
        files: pdfList,
        exportTimestamp: exportTimestamp.toISOString(),
        batchId: exportBatchId,
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
