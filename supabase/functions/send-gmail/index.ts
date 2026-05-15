import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1'

const SENDER_NAME = 'BAT Audit'
const SENDER_EMAIL = 'Zamop.audit@gmail.com'
const REPLY_TO = 'Zamop.audit@gmail.com'

function b64url(input: string): string {
  // Encode UTF-8 string as base64url
  const bytes = new TextEncoder().encode(input)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function buildMime(opts: {
  to: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  subject: string
  text?: string
  html?: string
}): string {
  const toList = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to
  const ccList = opts.cc ? (Array.isArray(opts.cc) ? opts.cc.join(', ') : opts.cc) : ''
  const bccList = opts.bcc ? (Array.isArray(opts.bcc) ? opts.bcc.join(', ') : opts.bcc) : ''

  const boundary = `bnd_${crypto.randomUUID().replace(/-/g, '')}`
  const headers = [
    `From: "${SENDER_NAME}" <${SENDER_EMAIL}>`,
    `Reply-To: ${REPLY_TO}`,
    `To: ${toList}`,
    ccList ? `Cc: ${ccList}` : '',
    bccList ? `Bcc: ${bccList}` : '',
    `Subject: ${opts.subject}`,
    'MIME-Version: 1.0',
  ].filter(Boolean)

  const text = opts.text ?? (opts.html ? opts.html.replace(/<[^>]+>/g, '') : '')
  const html = opts.html

  if (html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    return [
      headers.join('\r\n'),
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      text,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      html,
      '',
      `--${boundary}--`,
      '',
    ].join('\r\n')
  }

  headers.push('Content-Type: text/plain; charset="UTF-8"')
  return [headers.join('\r\n'), '', text, ''].join('\r\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    const GOOGLE_MAIL_API_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured')
    if (!GOOGLE_MAIL_API_KEY) throw new Error('GOOGLE_MAIL_API_KEY is not configured')

    const body = await req.json().catch(() => ({}))
    const { to, cc, bcc, subject, text, html } = body ?? {}
    if (!to || !subject || (!text && !html)) {
      return new Response(
        JSON.stringify({ error: 'to, subject, and text|html are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const raw = b64url(buildMime({ to, cc, bcc, subject, text, html }))

    const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': GOOGLE_MAIL_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Gmail send failed [${res.status}]`, details: data }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ success: true, id: data?.id, threadId: data?.threadId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})