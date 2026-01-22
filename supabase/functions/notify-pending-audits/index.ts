import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Format phone to Nigerian international format (234...)
function formatPhoneNumber(phone: string): string | null {
  if (!phone) return null;
  
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Already in international format
  if (cleaned.startsWith('234') && cleaned.length >= 13) {
    return cleaned;
  }
  
  // Nigerian local format starting with 0
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return '234' + cleaned.substring(1);
  }
  
  // 10-digit number without leading 0
  if (cleaned.length === 10) {
    return '234' + cleaned;
  }
  
  console.log(`Invalid phone format: ${phone} -> ${cleaned}`);
  return null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const multitexterApiKey = Deno.env.get('MULTITEXTER_API_KEY');
    
    if (!multitexterApiKey) {
      console.error('MULTITEXTER_API_KEY not configured');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'MULTITEXTER_API_KEY not configured' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get all auditors with their phone numbers
    const { data: auditors, error: auditorsError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'auditor');

    if (auditorsError) {
      console.error('Error fetching auditors:', auditorsError);
      throw auditorsError;
    }

    if (!auditors || auditors.length === 0) {
      console.log('No auditors found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No auditors to notify' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const auditorIds = auditors.map(a => a.user_id);

    // Get auditor profiles with phone numbers
    const { data: auditorProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', auditorIds)
      .eq('is_approved', true);

    if (profilesError) {
      console.error('Error fetching auditor profiles:', profilesError);
      throw profilesError;
    }

    // Collect valid phone numbers
    const phones: string[] = [];
    const auditorNames: string[] = [];
    
    auditorProfiles?.forEach(profile => {
      if (profile.phone) {
        const formatted = formatPhoneNumber(profile.phone);
        if (formatted && !phones.includes(formatted)) {
          phones.push(formatted);
          auditorNames.push(profile.full_name);
          console.log(`Added Auditor ${profile.full_name}: ${formatted}`);
        }
      }
    });

    if (phones.length === 0) {
      console.log('No valid auditor phone numbers found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No valid auditor phone numbers found' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calculate timestamp for 30 minutes ago
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // Count new pending audits (uploaded in last 30 minutes)
    const { count: newPendingCount, error: pendingError } = await supabase
      .from('audits')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Pending')
      .gte('uploaded_at', thirtyMinutesAgo);

    if (pendingError) {
      console.error('Error counting pending audits:', pendingError);
      throw pendingError;
    }

    // Count new re-audit requests (modified in last 30 minutes with is_re_audit = true and status Pending)
    const { count: reAuditCount, error: reAuditError } = await supabase
      .from('audits')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Pending')
      .eq('is_re_audit', true)
      .gte('last_modified', thirtyMinutesAgo);

    if (reAuditError) {
      console.error('Error counting re-audits:', reAuditError);
      throw reAuditError;
    }

    const totalNew = newPendingCount || 0;
    const totalReAudit = reAuditCount || 0;

    console.log(`Found ${totalNew} new pending audits and ${totalReAudit} re-audit requests`);

    // Only send SMS if there's something to notify about
    if (totalNew === 0 && totalReAudit === 0) {
      console.log('No new audits or re-audits to notify about');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No new audits to notify about',
        new_pending: 0,
        re_audits: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Compose message
    let message = 'OralGen BAT: ';
    const parts: string[] = [];
    
    if (totalNew > 0) {
      parts.push(`${totalNew} new interview${totalNew > 1 ? 's' : ''} awaiting audit`);
    }
    if (totalReAudit > 0) {
      parts.push(`${totalReAudit} re-audit${totalReAudit > 1 ? 's' : ''} pending review`);
    }
    
    message += parts.join(' and ') + '. Log in to review.';

    console.log(`Sending SMS to ${phones.length} auditor(s): ${phones.join(', ')}`);
    console.log(`Message: ${message}`);

    // Send SMS via Multitexter API
    const smsResponse = await fetch('https://app.multitexter.com/v2/app/sendsms', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${multitexterApiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        sender_name: 'OralGen BAT',
        recipients: phones.join(',')
      })
    });

    const smsResult = await smsResponse.json();
    console.log('Multitexter API response:', JSON.stringify(smsResult));

    const success = smsResult.status === 1;

    // Log the SMS notification
    await supabase.from('sms_notification_logs').insert({
      audit_id: null,
      file_name: null,
      interviewer_code: null,
      contractor_id: null,
      recipients: phones,
      recipients_count: phones.length,
      message,
      status: success ? 'sent' : 'failed',
      provider_response: smsResult,
      error_message: success ? null : (smsResult.msg || 'Unknown error from provider')
    });

    return new Response(JSON.stringify({ 
      success,
      recipients_count: phones.length,
      recipients: phones,
      auditor_names: auditorNames,
      new_pending: totalNew,
      re_audits: totalReAudit,
      message,
      sms_response: smsResult 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Notify pending audits error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log the error
    await supabase.from('sms_notification_logs').insert({
      audit_id: null,
      file_name: null,
      interviewer_code: null,
      contractor_id: null,
      recipients: [],
      recipients_count: 0,
      message: 'Scheduled notification for pending audits',
      status: 'error',
      error_message: errorMessage
    });

    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
