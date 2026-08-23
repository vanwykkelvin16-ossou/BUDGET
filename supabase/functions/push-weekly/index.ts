// Weekly "come back" nudge. Sends a payload-less Web Push (the message
// itself lives in the service worker, public/push-sw.js) to every
// subscription belonging to a user who has not logged anything for a week.
//
// Authenticated by a shared token held in push_config, supplied by the
// scheduled runner public.run_weekly_push(). JWT verification is off
// because the caller is Postgres, not a signed-in user.
//
//   body {}            -> only lapsed users (the scheduled behaviour)
//   body {force:true}  -> every subscription, ignoring activity (testing)
//
// Demo profiles never reach Supabase (they live in a local sandbox), so
// every row in profiles is a real account.
//
// Deploy: supabase functions deploy push-weekly --no-verify-jwt
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const IDLE_DAYS = 7
const JSON_HEADERS = { "Content-Type": "application/json" }

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ""
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromB64url(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/")
  const padded = t + "=".repeat((4 - (t.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

/** Length-safe compare so the token can't be guessed a byte at a time. */
function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** VAPID JWT proving we own the keypair the browser subscribed with. */
async function vapidToken(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const pub = fromB64url(publicKey) // 0x04 || X(32) || Y(32)
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC", crv: "P-256", ext: true,
      d: privateKey,
      x: b64url(pub.slice(1, 33)),
      y: b64url(pub.slice(33, 65)),
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  )

  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })))
  const body = b64url(new TextEncoder().encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })))
  const input = `${header}.${body}`
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input),
  )
  return `${input}.${b64url(sig)}`
}

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: cfg } = await admin
    .from("push_config")
    .select("public_key, private_key, subject, cron_token")
    .eq("id", 1).maybeSingle()

  if (!cfg) {
    return new Response(JSON.stringify({ error: "no VAPID keys - call push-key first" }), {
      status: 500, headers: JSON_HEADERS,
    })
  }

  if (!sameToken(req.headers.get("x-cron-token") ?? "", cfg.cron_token ?? "")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: JSON_HEADERS,
    })
  }

  let force = false
  try { force = Boolean((await req.json())?.force) } catch { /* empty body */ }

  // Who to nudge: nobody who has been active in the last week.
  let targets: string[] | null = null
  if (!force) {
    const cutoff = new Date(Date.now() - IDLE_DAYS * 86_400_000).toISOString().slice(0, 10)
    const { data: idle, error: idleErr } = await admin
      .from("profiles").select("id")
      .or(`last_log_date.is.null,last_log_date.lt.${cutoff}`)
    if (idleErr) {
      return new Response(JSON.stringify({ error: idleErr.message }), {
        status: 500, headers: JSON_HEADERS,
      })
    }
    targets = (idle ?? []).map((p) => p.id)
    if (targets.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "everyone active" }), {
        headers: JSON_HEADERS,
      })
    }
  }

  let q = admin.from("push_subscriptions").select("endpoint, user_id")
  if (targets) q = q.in("user_id", targets)
  const { data: subs, error: subErr } = await q
  if (subErr) {
    return new Response(JSON.stringify({ error: subErr.message }), {
      status: 500, headers: JSON_HEADERS,
    })
  }

  let sent = 0, expired = 0, failed = 0
  for (const sub of subs ?? []) {
    try {
      const jwt = await vapidToken(sub.endpoint, cfg.public_key, cfg.private_key, cfg.subject)
      const res = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          Authorization: `vapid t=${jwt}, k=${cfg.public_key}`,
          TTL: "86400",
        },
      })
      if (res.status === 404 || res.status === 410) {
        // Browser threw the subscription away - stop tracking it.
        await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint)
        expired++
      } else if (res.ok) {
        await admin.from("push_subscriptions")
          .update({ last_sent_at: new Date().toISOString() }).eq("endpoint", sub.endpoint)
        sent++
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }

  return new Response(JSON.stringify({ sent, expired, failed }), { headers: JSON_HEADERS })
})
