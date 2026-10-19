// Maison Hamra — delivers every new notification as a phone push (Web Push),
// and also by email when a Resend API key is configured.
//
// Called by the database trigger `notifications_push` (see sql/schema.sql) with
// the header `x-push-secret`. VAPID keys and that secret live in Supabase Vault
// and are read through public.push_config(), which only the service role can call.
//
// Email (Resend): the API key is in Vault as `resend_api_key`. Customer notifications go
// to the customer's account email; team notifications go to every team member's email.
// Until a domain is verified in Resend, mail is sent from onboarding@resend.dev and Resend
// only delivers it to the Resend account owner's own address. After verifying a domain:
//   select vault.create_secret('Maison Hamra <reservations@your-domain.com>', 'email_from');
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

type Notification = {
  id: number; user_id: string | null; for_staff: boolean; reservation_id: string | null;
  kind: string; title: string; body: string;
};
type Config = { public: string; private: string; hook: string; subject: string; site: string; resend: string | null; email_from: string };

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let cfg: Config | null = null;
async function config(): Promise<Config> {
  if (cfg) return cfg;
  const { data, error } = await sb.rpc("push_config");
  if (error || !data?.private) throw new Error("push_config unavailable: " + (error?.message ?? "missing keys"));
  cfg = data as Config;
  webpush.setVapidDetails(cfg.subject, cfg.public, cfg.private);
  return cfg;
}

function linkFor(n: Notification, site: string): string {
  if (n.for_staff) return site + "admin/";
  if (n.kind === "feedback" && n.reservation_id) return site + "index.html?feedback=" + n.reservation_id;
  if ((n.kind === "deposit_due" || n.kind === "deposit_warning") && n.reservation_id) return site + "pay.html?r=" + n.reservation_id;
  return site + "index.html#reserve";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function sendEmail(c: Config, to: string, n: Notification, url: string) {
  const key = c.resend ?? Deno.env.get("RESEND_API_KEY");
  if (!key || !to) return "email off";
  const from = c.email_from;
  const html = `<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:auto;padding:28px 24px;color:#1c1917;background:#faf7f2;border:1px solid #e3dacb">
    <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#b3935a">Maison Hamra</p>
    <h2 style="margin:0 0 18px;font-weight:normal;font-size:26px">${esc(n.title)}</h2>
    <p style="font-family:Arial,sans-serif;line-height:1.6;color:#2d2722">${esc(n.body)}</p>
    <p style="margin:22px 0"><a href="${url}" style="display:inline-block;background:#1c1917;color:#fff;padding:12px 22px;border-radius:4px;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase">Open the app</a></p>
    <p style="font-family:Arial,sans-serif;font-size:12px;color:#776a5e;border-top:1px solid #e3dacb;padding-top:12px">Hamra Street, Beirut · +961 00 000 000</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: n.title, html, text: `${n.title}\n\n${n.body}\n\n${url}` }),
  });
  return r.ok ? "sent" : "failed " + r.status;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let c: Config;
  try { c = await config(); } catch (e) { return new Response(String(e), { status: 500 }); }
  if (req.headers.get("x-push-secret") !== c.hook) return new Response("Forbidden", { status: 403 });

  const { id } = await req.json().catch(() => ({ id: null }));
  const { data: n } = await sb.from("notifications").select("*").eq("id", id).maybeSingle<Notification>();
  if (!n) return new Response("Not found", { status: 404 });

  const url = linkFor(n, c.site);
  let userIds: string[] = [];
  if (n.for_staff) {
    const { data } = await sb.from("staff").select("user_id");
    userIds = (data ?? []).map((s) => s.user_id);
  } else if (n.user_id) userIds = [n.user_id];

  const { data: subs } = userIds.length
    ? await sb.from("push_subscriptions").select("*").in("user_id", userIds).eq("app", n.for_staff ? "team" : "customer")
    : { data: [] };

  const payload = JSON.stringify({ title: n.title, body: n.body, url, tag: "mh-" + n.id });
  let sent = 0, removed = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { await sb.from("push_subscriptions").delete().eq("id", s.id); removed++; }
    }
  }));

  // email: the customer, or every team member
  const emails: string[] = [];
  if (c.resend ?? Deno.env.get("RESEND_API_KEY")) {
    for (const uid of userIds) {
      const { data } = await sb.auth.admin.getUserById(uid);
      if (data.user?.email) emails.push(data.user.email);
    }
  }
  const email = emails.length ? (await Promise.all(emails.map((to) => sendEmail(c, to, n, url)))).join(",") : "email off";
  return Response.json({ sent, removed, email });
});
