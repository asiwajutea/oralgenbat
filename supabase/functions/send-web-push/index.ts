import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Convert base64url to Uint8Array
function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Import VAPID private key for signing
async function importVapidPrivateKey(
  privateKeyBase64url: string
): Promise<CryptoKey> {
  const rawKey = base64urlToUint8Array(privateKeyBase64url);
  // Convert raw 32-byte key to JWK for P-256
  const x_y = base64urlToUint8Array(
    Deno.env.get("VAPID_PUBLIC_KEY") || ""
  );
  // For ECDSA P-256, the public key is 65 bytes (uncompressed): 0x04 + x(32) + y(32)
  const x = btoa(String.fromCharCode(...x_y.slice(1, 33)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const y = btoa(String.fromCharCode(...x_y.slice(33, 65)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const d = privateKeyBase64url;

  const jwk = {
    kty: "EC",
    crv: "P-256",
    x,
    y,
    d,
  };

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

// Create VAPID JWT token
async function createVapidJwt(
  audience: string,
  subject: string,
  privateKey: CryptoKey
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: subject,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const signingInput = encoder.encode(`${headerB64}.${payloadB64}`);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    signingInput
  );

  // Convert DER signature to raw r||s format for JWT
  const sigArray = new Uint8Array(signature);
  let sigB64: string;

  if (sigArray.length === 64) {
    // Already raw format
    sigB64 = btoa(String.fromCharCode(...sigArray))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } else {
    // DER format - extract r and s
    // DER: 0x30 len 0x02 rlen r 0x02 slen s
    let offset = 2; // skip 0x30 and length
    offset++; // skip 0x02
    const rLen = sigArray[offset++];
    const r = sigArray.slice(offset, offset + rLen);
    offset += rLen;
    offset++; // skip 0x02
    const sLen = sigArray[offset++];
    const s = sigArray.slice(offset, offset + sLen);

    // Pad/trim to 32 bytes each
    const rPadded = new Uint8Array(32);
    const sPadded = new Uint8Array(32);
    rPadded.set(r.length > 32 ? r.slice(r.length - 32) : r, 32 - Math.min(r.length, 32));
    sPadded.set(s.length > 32 ? s.slice(s.length - 32) : s, 32 - Math.min(s.length, 32));

    const rawSig = new Uint8Array(64);
    rawSig.set(rPadded);
    rawSig.set(sPadded, 32);

    sigB64 = btoa(String.fromCharCode(...rawSig))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  return `${headerB64}.${payloadB64}.${sigB64}`;
}

// Send a single web push notification
async function sendPush(
  subscription: any,
  payload: string,
  vapidPrivateKey: CryptoKey,
  vapidPublicKey: string
): Promise<{ success: boolean; statusCode?: number; expired?: boolean }> {
  try {
    const endpoint = subscription.endpoint;
    const url = new URL(endpoint);
    const audience = `${url.protocol}//${url.host}`;

    const jwt = await createVapidJwt(
      audience,
      "mailto:admin@auditbackend.app",
      vapidPrivateKey
    );

    const payloadBytes = new TextEncoder().encode(payload);

    // Get p256dh and auth from subscription keys
    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;

    if (!p256dh || !auth) {
      return { success: false, expired: true };
    }

    // For simplicity, send unencrypted push (some browsers support this)
    // In production, you'd want full RFC 8291 encryption
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
        "Content-Type": "application/json",
        TTL: "86400",
        Urgency: "high",
      },
      body: payload,
    });

    if (response.status === 201 || response.status === 200) {
      return { success: true, statusCode: response.status };
    }

    // 404 or 410 means subscription expired
    if (response.status === 404 || response.status === 410) {
      return { success: false, statusCode: response.status, expired: true };
    }

    console.error(
      `Push failed: ${response.status} ${await response.text()}`
    );
    return { success: false, statusCode: response.status };
  } catch (error) {
    console.error("Push send error:", error);
    return { success: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const vapidPublicKeyRaw = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKeyRaw = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKeyRaw || !vapidPrivateKeyRaw) {
      console.error("VAPID keys not configured");
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      user_id,
      title,
      message,
      type,
      notification_id,
      push_notification_id,
      target_type,
      target_roles,
      target_user_ids,
      url: clickUrl,
    } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let vapidPrivateKey: CryptoKey;
    try {
      vapidPrivateKey = await importVapidPrivateKey(vapidPrivateKeyRaw);
    } catch (e) {
      console.error("Failed to import VAPID key:", e);
      return new Response(
        JSON.stringify({ error: "Invalid VAPID key configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine target users
    let targetUserIds: string[] = [];

    if (user_id) {
      // Single user notification (from user_notifications trigger)
      targetUserIds = [user_id];
    } else if (push_notification_id) {
      // Bulk push notification - get targeted users from delivery records
      const { data: deliveries } = await supabase
        .from("push_notification_deliveries")
        .select("user_id")
        .eq("push_notification_id", push_notification_id);

      targetUserIds = (deliveries || []).map((d: any) => d.user_id);
    }

    if (targetUserIds.length === 0) {
      return new Response(
        JSON.stringify({ message: "No target users" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch push subscriptions for target users
    const { data: settings } = await supabase
      .from("user_notification_settings")
      .select("user_id, push_subscription, notify_new_interviews, notify_failed_audit, notify_re_audit, notify_milestones, notify_inactivity, notify_audit_passed, notify_team_requests, notify_interview_assigned, notify_data_entry_complete, notify_account_status, notify_new_registration, notify_payment, notify_agent_reassigned, notify_issues, notify_comments")
      .in("user_id", targetUserIds)
      .not("push_subscription", "is", null);

    if (!settings || settings.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push subscriptions found", targeted: targetUserIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map notification types to settings keys
    const typeSettingsMap: Record<string, string> = {
      new_interview: "notify_new_interviews",
      failed_audit: "notify_failed_audit",
      re_audit: "notify_re_audit",
      milestone: "notify_milestones",
      inactivity: "notify_inactivity",
      audit_passed: "notify_audit_passed",
      team_request_approved: "notify_team_requests",
      team_request_rejected: "notify_team_requests",
      new_team_request: "notify_team_requests",
      interview_assigned: "notify_interview_assigned",
      data_entry_complete: "notify_data_entry_complete",
      account_approved: "notify_account_status",
      account_suspended: "notify_account_status",
      new_registration: "notify_new_registration",
      payment_created: "notify_payment",
      journey_updated: "notify_payment",
      agent_reassigned: "notify_agent_reassigned",
      issue_flagged: "notify_issues",
      issue_resolved: "notify_issues",
      comment_reply: "notify_comments",
      resolution_comment: "notify_comments",
    };

    const settingsKey = type ? typeSettingsMap[type] : null;

    let successCount = 0;
    let failCount = 0;
    const expiredSubscriptions: string[] = [];

    for (const setting of settings) {
      // Check if notification type is enabled for this user
      if (settingsKey && setting[settingsKey] === false) {
        continue; // User has disabled this notification type
      }

      const subscription = setting.push_subscription;
      if (!subscription || !subscription.endpoint) continue;

      const pushPayload = JSON.stringify({
        title: title || "Notification",
        message: message || "",
        url: clickUrl || "/",
        notification_id,
        push_notification_id,
      });

      const result = await sendPush(
        subscription,
        pushPayload,
        vapidPrivateKey,
        vapidPublicKeyRaw
      );

      if (result.success) {
        successCount++;
      } else {
        failCount++;
        if (result.expired) {
          expiredSubscriptions.push(setting.user_id);
        }
      }
    }

    // Clean up expired subscriptions
    if (expiredSubscriptions.length > 0) {
      await supabase
        .from("user_notification_settings")
        .update({ push_subscription: null })
        .in("user_id", expiredSubscriptions);
      console.log(`Cleared ${expiredSubscriptions.length} expired subscriptions`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failCount,
        expired_cleared: expiredSubscriptions.length,
        targeted: targetUserIds.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-web-push error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
