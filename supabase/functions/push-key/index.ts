// Returns the app's VAPID public key, generating the keypair on first
// call. The public key is meant to ship in the client bundle; the private
// key is written straight into push_config (service role only) and never
// leaves the server.
//
// Deploy: supabase functions deploy push-key --no-verify-jwt
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ""
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: existing } = await admin
    .from("push_config").select("public_key").eq("id", 1).maybeSingle()

  if (existing?.public_key) {
    return new Response(JSON.stringify({ publicKey: existing.public_key }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    })
  }

  // First call: mint a P-256 keypair in VAPID's raw/base64url shape.
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair

  const publicKey = b64url(await crypto.subtle.exportKey("raw", pair.publicKey))
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey)
  const privateKey = jwk.d as string // already base64url

  const { error } = await admin.from("push_config")
    .upsert({ id: 1, public_key: publicKey, private_key: privateKey })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ publicKey }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  })
})
