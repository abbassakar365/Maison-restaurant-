// Maison Hamra — receives payment confirmations from the bank / payment provider
// and lets the database verify the deposit automatically (public.record_payment).
//
// URL:     https://efwqkllaultepxprwert.supabase.co/functions/v1/payment-webhook
// Method:  POST, JSON body
// Header:  x-mh-signature: <hex HMAC-SHA256 of the raw body, keyed with the signing secret>
//          (the secret is in Supabase Vault as `payment_webhook_secret`)
// Body:    { "provider": "bank", "transaction_id": "TX123", "reference": "MH-ABC123",
//            "payer_name": "Rania Khoury", "amount": 78.75, "currency": "USD", "status": "succeeded" }
//   Common alternative field names are accepted too (id, description, client_reference_id,
//   customer_name, …). Amounts are in dollars, not cents.
//
// A payment is accepted only if the reservation code is in the reference, the payer name
// matches the reservation name, the amount covers the deposit, the currency is USD, and the
// transaction was not already used. Anything else is sent to the team to check by hand.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let secret: string | null = null;
async function getSecret(): Promise<string> {
  if (secret) return secret;
  const { data, error } = await sb.rpc("payment_webhook_secret");
  if (error || !data) throw new Error("signing secret unavailable");
  secret = data as string;
  return secret;
}

async function hmacHex(key: string, body: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return null;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const raw = await req.text();
  if (raw.length > 20000) return new Response("Too large", { status: 413 });

  let key: string;
  try { key = await getSecret(); } catch (e) { return new Response(String(e), { status: 500 }); }
  const given = (req.headers.get("x-mh-signature") ?? "").replace(/^sha256=/, "").trim().toLowerCase();
  if (!given || !safeEqual(given, await hmacHex(key, raw))) return new Response("Invalid signature", { status: 401 });

  let b: Record<string, unknown>;
  try { b = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const args = {
    p_provider: String(pick(b, "provider", "source") ?? "bank"),
    p_txn: String(pick(b, "transaction_id", "id", "payment_id", "reference_number") ?? ""),
    p_reference: String(pick(b, "reference", "description", "client_reference_id", "order_id", "note", "memo") ?? ""),
    p_payer: pick(b, "payer_name", "customer_name", "name", "sender_name") as string | null,
    p_amount: Number(pick(b, "amount", "amount_paid", "total") ?? 0),
    p_currency: String(pick(b, "currency") ?? "USD"),
    p_status: String(pick(b, "status", "payment_status") ?? ""),
  };
  if (!args.p_txn) return new Response("Missing transaction id", { status: 400 });

  const { data, error } = await sb.rpc("record_payment", args);
  if (error) return new Response("Error: " + error.message, { status: 500 });
  return Response.json({ result: data });
});
