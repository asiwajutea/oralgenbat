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

  try {
    const payload = await req.json();
    const { audit_id, file_name, interviewer_code, contractor_id, review_comment } = payload;
    
    console.log('SMS notification triggered for failed audit:', { 
      audit_id, 
      file_name, 
      interviewer_code, 
      contractor_id 
    });
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const phones: string[] = [];
    
    // Get Field Manager phone from team_assignments using the interviewer_code
    if (interviewer_code) {
      const { data: fmAssignment, error: fmError } = await supabase
        .from('team_assignments')
        .select('field_manager_id')
        .eq('interviewer_code', interviewer_code)
        .eq('status', 'approved')
        .limit(1)
        .maybeSingle();
      
      if (fmError) {
        console.error('Error fetching field manager assignment:', fmError);
      }
      
      if (fmAssignment?.field_manager_id) {
        // Get the field manager's phone from profiles
        const { data: fmProfile, error: fmProfileError } = await supabase
          .from('profiles')
          .select('phone, full_name')
          .eq('id', fmAssignment.field_manager_id)
          .maybeSingle();
        
        if (fmProfileError) {
          console.error('Error fetching field manager profile:', fmProfileError);
        }
        
        if (fmProfile?.phone) {
          const formatted = formatPhoneNumber(fmProfile.phone);
          if (formatted) {
            phones.push(formatted);
            console.log(`Added Field Manager ${fmProfile.full_name}: ${formatted}`);
          }
        }
      }
    }
    
    // Get Sub-Contractors for this contractor
    if (contractor_id) {
      // First get all sub_contractor role users
      const { data: scRoles, error: scRolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'sub_contractor');
      
      if (scRolesError) {
        console.error('Error fetching sub-contractor roles:', scRolesError);
      }
      
      const scUserIds = new Set(scRoles?.map(r => r.user_id) || []);
      
      if (scUserIds.size > 0) {
        // Get profiles for users who have this contractor assigned and are sub_contractors
        const { data: scProfiles, error: scProfilesError } = await supabase
          .from('profiles')
          .select('id, phone, full_name, contractor_id, active_contractor_id')
          .or(`contractor_id.eq.${contractor_id},active_contractor_id.eq.${contractor_id}`);
        
        if (scProfilesError) {
          console.error('Error fetching sub-contractor profiles:', scProfilesError);
        }
        
        scProfiles?.forEach(profile => {
          // Only include if they are a sub_contractor
          if (scUserIds.has(profile.id) && profile.phone) {
            const formatted = formatPhoneNumber(profile.phone);
            if (formatted && !phones.includes(formatted)) {
              phones.push(formatted);
              console.log(`Added Sub-Contractor ${profile.full_name}: ${formatted}`);
            }
          }
        });
      }
    }
    
    if (phones.length === 0) {
      console.log('No valid phone numbers found for SMS notification');
      return new Response(JSON.stringify({ 
        success: false, 
        reason: 'No valid recipients found',
        audit_id,
        file_name
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Compose detailed message
    const message = `OralGen BAT: Interview ${file_name || 'Unknown'} by interviewer ${interviewer_code || 'unknown'} failed audit. Action required. Log in to review.`;
    
    console.log(`Sending SMS to ${phones.length} recipient(s): ${phones.join(', ')}`);
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
    
    return new Response(JSON.stringify({ 
      success,
      recipients_count: phones.length,
      recipients: phones,
      message,
      sms_response: smsResult 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error: unknown) {
    console.error('SMS notification error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
