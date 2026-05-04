import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

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

    // Get audit details with PDF URLs and re-audit info
    const auditIds = assignments.map(a => a.audit_id);
    const { data: audits, error: auditError } = await supabase
      .from('audits')
      .select('id, file_name, file_url, mobile_zip_url, is_re_audit, passed_with_failures, pass_override_reason, pass_override_action_plan, reviewed_by, reviewed_at')
      .in('id', auditIds);

    if (auditError) {
      console.error('Error fetching audits:', auditError);
      throw auditError;
    }
    
    // For re-audited interviews, check if metadata was replaced via re_audit_submissions
    const reAuditedIds = audits?.filter(a => a.is_re_audit).map(a => a.id) || [];
    let metadataReplacedSet = new Set<string>();
    
    if (reAuditedIds.length > 0) {
      const { data: reAuditSubs } = await supabase
        .from('re_audit_submissions')
        .select('audit_id, replaced_zip')
        .in('audit_id', reAuditedIds)
        .eq('replaced_zip', true);
      
      metadataReplacedSet = new Set(reAuditSubs?.map(s => s.audit_id) || []);
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
    // Include metadata ZIP only for re-audited interviews with replaced metadata
    const pdfList = audits.map(audit => {
      const includeMetadata = audit.is_re_audit && metadataReplacedSet.has(audit.id) && audit.mobile_zip_url;
      const isOverride = !!audit.passed_with_failures;
      const baseName = isOverride ? `${audit.file_name}_attention` : audit.file_name;
      return {
        fileName: `${baseName}.pdf`,
        url: audit.file_url,
        auditId: audit.id,
        ...(includeMetadata ? {
          metadataUrl: audit.mobile_zip_url,
          metadataFileName: `${baseName}_metadata.zip`,
        } : {}),
      };
    });

    // Build override-notes PDF if any overridden audits in this batch
    const overridden = (audits || [])
      .filter((a: any) => a.passed_with_failures)
      .sort((a: any, b: any) => String(a.file_name).localeCompare(String(b.file_name)));
    if (overridden.length > 0) {
      try {
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
        let page = pdf.addPage([595, 842]);
        let y = 800;
        const drawLine = (text: string, opts: { bold?: boolean; size?: number; color?: any } = {}) => {
          const size = opts.size || 11;
          const f = opts.bold ? fontBold : font;
          const wrapped = wrap(text, 90);
          for (const ln of wrapped) {
            if (y < 50) { page = pdf.addPage([595, 842]); y = 800; }
            page.drawText(ln, { x: 40, y, size, font: f, color: opts.color || rgb(0, 0, 0) });
            y -= size + 4;
          }
        };
        drawLine(`Override / Attention Notes`, { bold: true, size: 16 });
        drawLine(`Team: ${teamName || teamId}`, { size: 10 });
        drawLine(`Batch: ${exportBatchId}`, { size: 10 });
        drawLine(`Generated: ${exportTimestamp.toISOString()}`, { size: 10 });
        y -= 8;
        for (const a of overridden) {
          if (y < 120) { page = pdf.addPage([595, 842]); y = 800; }
          drawLine(`${a.file_name}_attention`, { bold: true, size: 13 });
          drawLine(`Reviewed by: ${a.reviewed_by || '—'}  ·  ${a.reviewed_at || '—'}`, { size: 10, color: rgb(0.4, 0.4, 0.4) });
          if (a.pass_override_reason) { drawLine(`Reason:`, { bold: true }); drawLine(a.pass_override_reason); }
          if (a.pass_override_action_plan) { drawLine(`Action plan:`, { bold: true }); drawLine(a.pass_override_action_plan); }
          y -= 6;
        }
        const bytes = await pdf.save();
        const path = `override-notes/${exportBatchId}.pdf`;
        await supabase.storage.from('team-exports').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
        const { data: pub } = supabase.storage.from('team-exports').getPublicUrl(path);
        if (pub?.publicUrl) {
          pdfList.unshift({
            fileName: `Override_Notes_${exportBatchId}.pdf`,
            url: pub.publicUrl,
            auditId: 'override-notes',
          } as any);
        }
      } catch (e) {
        console.error('Override notes PDF generation failed', e);
      }
    }

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

function wrap(text: string, maxChars: number): string[] {
  const words = String(text || '').split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur ? cur + ' ' : '') + w;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}
