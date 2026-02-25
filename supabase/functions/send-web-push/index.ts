import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Helpers ───────────────────────────────────────────────

function base64urlToUint8Array(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  const bin = atob(b64 + "=".repeat(pad));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─── VAPID JWT ─────────────────────────────────────────────

async function importVapidKeys(
  publicKeyB64url: string,
  privateKeyB64url: string
): Promise<CryptoKey> {
  const pubRaw = base64urlToUint8Array(publicKeyB64url); // 65 bytes uncompressed
  const x = uint8ArrayToBase64url(pubRaw.slice(1, 33));
  const y = uint8ArrayToBase64url(pubRaw.slice(33, 65));
  const d = privateKeyB64url;

  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function createVapidJwt(
  audience: string,
  subject: string,
  privateKey: CryptoKey
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject };

  const hdr = uint8ArrayToBase64url(new TextEncoder().encode(JSON.stringify(header)));
  const pld = uint8ArrayToBase64url(new TextEncoder().encode(JSON.stringify(payload)));

  const sigInput = new TextEncoder().encode(`${hdr}.${pld}`);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, sigInput);
  const sigArr = new Uint8Array(sig);

  // Convert DER → raw r||s if needed
  let raw: Uint8Array;
  if (sigArr.length === 64) {
    raw = sigArr;
  } else {
    let off = 2;
    off++; // 0x02
    const rLen = sigArr[off++];
    const r = sigArr.slice(off, off + rLen);
    off += rLen;
    off++; // 0x02
    const sLen = sigArr[off++];
    const s = sigArr.slice(off, off + sLen);
    raw = new Uint8Array(64);
    raw.set(r.length > 32 ? r.slice(r.length - 32) : r, 32 - Math.min(r.length, 32));
    raw.set(s.length > 32 ? s.slice(s.length - 32) : s, 32 + 32 - Math.min(s.length, 32));
  }

  return `${hdr}.${pld}.${uint8ArrayToBase64url(raw)}`;
}

// ─── RFC 8291 Web Push Encryption (aes128gcm) ─────────────

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  // Extract
  const prkKey = await crypto.subtle.importKey("raw", salt.length ? salt : new Uint8Array(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, ikm));
  // Expand
  const prkExpandKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoLen = new Uint8Array([...info, 1]);
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkExpandKey, infoLen));
  return okm.slice(0, length);
}

function concatUint8(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(type);
  const nul = new Uint8Array([0]);
  // "Content-Encoding: <type>\0P-256\0" + len(client) + client + len(server) + server
  const header = encoder.encode("Content-Encoding: ");
  const p256 = encoder.encode("P-256");
  const clientLen = new Uint8Array(2);
  clientLen[0] = 0;
  clientLen[1] = clientPublicKey.length;
  const serverLen = new Uint8Array(2);
  serverLen[0] = 0;
  serverLen[1] = serverPublicKey.length;
  return concatUint8(header, typeBytes, nul, p256, nul, clientLen, clientPublicKey, serverLen, serverPublicKey);
}

async function encryptPayload(
  plaintext: Uint8Array,
  subscriptionP256dh: string,
  subscriptionAuth: string
): Promise<{ ciphertext: Uint8Array; serverPublicKey: Uint8Array }> {
  const clientPublicKey = base64urlToUint8Array(subscriptionP256dh);
  const authSecret = base64urlToUint8Array(subscriptionAuth);

  // Generate ephemeral ECDH key pair
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Export ephemeral public key as uncompressed point
  const serverPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey));

  // Import subscriber's public key
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientKey },
      ephemeralKeyPair.privateKey,
      256
    )
  );

  // IKM = HKDF(auth, sharedSecret, "WebPush: info\0" + clientPub + serverPub, 32)
  const encoder = new TextEncoder();
  const authInfo = concatUint8(
    encoder.encode("WebPush: info\0"),
    clientPublicKey,
    serverPublicKeyRaw
  );
  const ikm = await hkdf(authSecret, sharedSecret, authInfo, 32);

  // Salt (random 16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // CEK = HKDF(salt, ikm, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo = encoder.encode("Content-Encoding: aes128gcm\0");
  const cek = await hkdf(salt, ikm, cekInfo, 16);

  // Nonce = HKDF(salt, ikm, "Content-Encoding: nonce\0", 12)
  const nonceInfo = encoder.encode("Content-Encoding: nonce\0");
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Pad plaintext: add \x02 delimiter (no padding)
  const paddedPlaintext = concatUint8(plaintext, new Uint8Array([2]));

  // Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      paddedPlaintext
    )
  );

  // Build aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const rs = new Uint8Array(4);
  const view = new DataView(rs.buffer);
  view.setUint32(0, 4096); // record size
  const idlen = new Uint8Array([65]); // server public key length

  const body = concatUint8(salt, rs, idlen, serverPublicKeyRaw, encrypted);

  return { ciphertext: body, serverPublicKey: serverPublicKeyRaw };
}

// ─── Send a single push ───────────────────────────────────

async function sendPush(
  subscription: any,
  payload: string,
  vapidPrivateKey: CryptoKey,
  vapidPublicKeyB64url: string
): Promise<{ success: boolean; statusCode?: number; expired?: boolean }> {
  try {
    const endpoint: string = subscription.endpoint;
    const p256dh: string = subscription.keys?.p256dh;
    const auth: string = subscription.keys?.auth;

    if (!p256dh || !auth) {
      console.error("Missing subscription keys");
      return { success: false, expired: true };
    }

    const url = new URL(endpoint);
    const audience = `${url.protocol}//${url.host}`;

    // VAPID JWT
    const jwt = await createVapidJwt(audience, "mailto:admin@auditbackend.app", vapidPrivateKey);

    // Encrypt payload per RFC 8291
    const { ciphertext } = await encryptPayload(
      new TextEncoder().encode(payload),
      p256dh,
      auth
    );

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapidPublicKeyB64url}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "Content-Length": String(ciphertext.byteLength),
        TTL: "86400",
        Urgency: "high",
      },
      body: ciphertext,
    });

    if (response.status === 201 || response.status === 200) {
      return { success: true, statusCode: response.status };
    }

    if (response.status === 404 || response.status === 410) {
      return { success: false, statusCode: response.status, expired: true };
    }

    const text = await response.text();
    console.error(`Push failed: ${response.status} ${text}`);
    return { success: false, statusCode: response.status };
  } catch (error) {
    console.error("Push send error:", error);
    return { success: false };
  }
}

// ─── Main handler ─────────────────────────────────────────

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
      vapidPrivateKey = await importVapidKeys(vapidPublicKeyRaw, vapidPrivateKeyRaw);
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
      targetUserIds = [user_id];
    } else if (push_notification_id) {
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

    // Fetch push subscriptions
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
      if (settingsKey && setting[settingsKey] === false) continue;

      const subscription = setting.push_subscription;
      if (!subscription || !subscription.endpoint) continue;

      const pushPayload = JSON.stringify({
        title: title || "Notification",
        message: message || "",
        url: clickUrl || "/",
        notification_id,
        push_notification_id,
      });

      const result = await sendPush(subscription, pushPayload, vapidPrivateKey, vapidPublicKeyRaw);

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
