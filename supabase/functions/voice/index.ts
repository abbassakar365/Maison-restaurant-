// Maison Hamra — phone Auto-pilot. Answers calls, books tables, puts guests through to the team.
//
// Phone provider: SignalWire (or Twilio; both speak the same call XML). In SignalWire:
//   My Resources → + Add → Script → cXML Script, Handle calls using: External URL,
//   Primary Script URL: https://efwqkllaultepxprwert.supabase.co/functions/v1/voice
//   then Phone Numbers → the number → Edit Settings → Inbound Call Settings → Assign Resource → that script.
//   (Twilio: "A call comes in" webhook = same URL, POST; status callback = same URL + ?step=status.)
// Every request must be signed by the provider (X-SignalWire-Signature or X-Twilio-Signature), checked
// with the key in Supabase Vault: `phone_signing_key` (SignalWire Signing Key) or `twilio_auth_token`.
// Claude's API key is in Vault as `anthropic_api_key`.
// The team turns the Auto-pilot on or off and sets the transfer number in the team app → Calls.
//
// Steps: start → (turn | silence)* → transfer → dial-done → … ; status runs when the call ends.
import Anthropic from "npm:@anthropic-ai/sdk@0.132.1";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { type CallState, type Deps, runTurn, type Turn } from "./agent.ts";
import { dial, empty, gather, hangup, type Lang, LINES, sayOnly, validSignature } from "./twiml.ts";

const BASE = "https://efwqkllaultepxprwert.supabase.co/functions/v1/voice";
const url = (step: string) => `${BASE}?step=${step}`;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Config = { anthropic: string | null; twilio: string | null; enabled: boolean; team_phone: string | null; language: Lang };
async function config(): Promise<Config> {
  const { data, error } = await sb.rpc("voice_config");
  if (error || !data) throw new Error("voice_config unavailable: " + error?.message);
  return data as Config;
}

let claudeClient: Anthropic | null = null;
function deps(cfg: Config, callSid: string): Deps {
  // Twilio waits up to 15 seconds for each answer, so fail fast and hand over to a person
  claudeClient ??= new Anthropic({ apiKey: cfg.anthropic!, timeout: 11_000, maxRetries: 0 });
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    claude: (p) => claudeClient!.beta.messages.create(p),
    checkAvailability: (at, guests) => rpc("phone_check", { p_at: at, p_guests: guests }),
    findReservation: (phone, code) => rpc("phone_lookup", { p_phone: phone ?? "", p_code: code }),
    book: (b) => rpc("phone_reservation", {
      p_call_sid: callSid, p_full_name: b.full_name, p_phone: b.phone, p_guests: b.guests, p_at: b.at,
      p_set_menu: b.set_menu, p_notes: b.notes,
    }),
  };
}

// Facts the Auto-pilot needs for this call: today's date, opening hours, set menus, the caller
async function callContext(from: string | null): Promise<string> {
  const [{ data: s }, { data: menus }] = await Promise.all([
    sb.from("restaurant_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("set_menus").select("id, name, courses, price").eq("active", true).order("sort"),
  ]);
  const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Beirut", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(d);
  const now = new Date();
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Beirut", hour: "2-digit", minute: "2-digit" }).format(now);
  const week = Array.from({ length: 8 }, (_, i) => new Date(now.getTime() + i * 86400e3))
    .map((d, i) => `${i === 0 ? "Today" : i === 1 ? "Tomorrow" : ""} ${day(d)} = ${iso(d)}`.trim()).join("; ");
  const hhmm = (t: string | undefined, dflt: string) => (t ?? dflt).slice(0, 5);
  return [
    `Right now in Beirut it is ${day(now)}, ${time}. Dates: ${week}.`,
    `Caller's number: ${from || "hidden"}.`,
    `Restaurant: Hamra Street, Beirut. Open every day 12:00 to 00:00. Reservations from ${hhmm(s?.open_time, "12:00")} to ${hhmm(s?.last_booking, "23:00")}, on the hour or half hour, at least one hour ahead and up to 90 days ahead.`,
    `A table is held for ${s?.sitting_minutes ?? 120} minutes and seats ${s?.seats_per_table ?? 4}; bigger groups get several tables.`,
    `Set menus (price per person, USD): ${(menus ?? []).map((m) => `${m.name} (id ${m.id}), $${m.price}: ${m.courses}`).join(". ") || "none"}.`,
    `Deposit: when the set menu total is over $${s?.deposit_threshold ?? 300}, a ${s?.deposit_percent ?? 25}% deposit is due within 24 hours (or 2 hours before the table, whichever is first).`,
  ].join("\n");
}

type Row = {
  call_sid: string; from_number: string | null; status: string; reservation_id: string | null; language: Lang; messages: CallState["messages"];
  context: string; pending: CallState["pending"]; transcript: unknown[]; silences: number;
};
async function loadCall(sid: string): Promise<Row | null> {
  const { data } = await sb.from("calls").select("*").eq("call_sid", sid).maybeSingle();
  return data as Row | null;
}
async function saveCall(row: Row, state: CallState, turn: Partial<Turn>, extra: Record<string, unknown> = {}) {
  const at = new Date().toISOString();
  await sb.from("calls").update({
    messages: state.messages, language: state.language, pending: state.pending,
    transcript: [...row.transcript, ...(turn.transcript ?? []).map((t) => ({ ...t, at }))],
    ...(turn.summary ? { summary: turn.summary } : {}),
    ...extra,
  }).eq("call_sid", row.call_sid);
}
// How a finished call shows in the log: a missed transfer needs a call back, even if a table was booked
const finalStatus = (row: Row, bookedNow = false) =>
  row.status === "missed_transfer" ? "missed_transfer" : row.reservation_id || bookedNow ? "booked" : "ended";

const stateOf = (row: Row): CallState => ({
  messages: row.messages ?? [], context: row.context, language: row.language, from: row.from_number, pending: row.pending,
});

// Turn the Auto-pilot's decision into TwiML
async function respond(row: Row, state: CallState, turn: Turn, cfg: Config): Promise<string> {
  const lang = state.language;
  if (turn.action === "hangup") {
    await saveCall(row, state, turn, { status: finalStatus(row, !!turn.booked), ended_at: new Date().toISOString() });
    return hangup(turn.say || LINES.goodbye[lang], lang);
  }
  if (turn.action === "transfer") {
    if (!cfg.team_phone) {
      // no transfer number set: carry on as if nobody answered
      await saveCall(row, state, turn);
      return await missed(row.call_sid, "no team phone is set up", cfg, turn.say);
    }
    await saveCall(row, state, turn, { status: "transferring" });
    await sb.rpc("phone_event", { p_call_sid: row.call_sid, p_kind: "transfer", p_detail: turn.reason ?? "" });
    return dial(turn.say || LINES.connecting[lang], lang, cfg.team_phone, url("dial-done"), url("whisper"));
  }
  await saveCall(row, state, turn, { silences: 0, ...(turn.booked && row.status === "live" ? { status: "booked" } : {}) });
  return gather(turn.say || LINES.still_there[lang], lang, url("turn"), url("silence"));
}

// The transfer didn't connect: tell the team, then let the Auto-pilot continue the conversation
async function missed(sid: string, why: string, cfg: Config, before = ""): Promise<string> {
  const row = await loadCall(sid);
  if (!row) return hangup(null, "en");
  await sb.rpc("phone_event", { p_call_sid: sid, p_kind: "missed", p_detail: `Nobody answered (${why}). Please call back ${row.from_number ?? "the guest"}.` });
  const state = stateOf(row);
  await sb.from("calls").update({ status: "missed_transfer" }).eq("call_sid", sid);
  row.status = "missed_transfer";
  try {
    const turn = await runTurn(state, null, deps(cfg, sid), why);
    if (before) turn.say = `${before} ${turn.say}`.trim();
    if (turn.action === "transfer") turn.action = "listen"; // don't loop on a transfer nobody answers
    return await respond(row, state, turn, cfg);
  } catch (e) {
    console.error("missed-transfer turn failed", e);
    await saveCall(row, state, {}, { status: "missed_transfer", ended_at: new Date().toISOString() });
    return hangup(LINES.unavailable[state.language], state.language);
  }
}

async function handle(step: string, p: Record<string, string>, cfg: Config): Promise<string> {
  const sid = p.CallSid;
  switch (step) {
    case "start": {
      const lang = cfg.language ?? "en";
      const ai = cfg.enabled && !!cfg.anthropic;
      const context = ai ? await callContext(p.From || null) : "";
      await sb.from("calls").upsert({
        call_sid: sid, from_number: p.From || null, language: lang, context,
        status: ai ? "live" : cfg.team_phone ? "transferring" : "ended",
        transcript: [{ who: "system", text: ai ? "Answered by the Auto-pilot" : "Auto-pilot off: sent to the team", at: new Date().toISOString() }],
      }, { onConflict: "call_sid", ignoreDuplicates: true });
      if (ai) {
        const greeting = LINES.greeting[lang];
        await sb.from("calls").update({
          messages: [{ role: "user", content: "(The phone call has just been connected.)" }, { role: "assistant", content: greeting }],
          transcript: [
            { who: "system", text: "Answered by the Auto-pilot", at: new Date().toISOString() },
            { who: "agent", text: greeting, at: new Date().toISOString() },
          ],
        }).eq("call_sid", sid);
        return gather(greeting, lang, url("turn"), url("silence"));
      }
      if (cfg.team_phone) {
        await sb.rpc("phone_event", { p_call_sid: sid, p_kind: "transfer", p_detail: "Auto-pilot is off." });
        return dial(LINES.team_only[lang], lang, cfg.team_phone, url("dial-done"), url("whisper"));
      }
      return hangup(LINES.unavailable[lang], lang);
    }

    case "turn": {
      const row = await loadCall(sid);
      if (!row) return hangup(LINES.trouble.en, "en");
      const said = (p.SpeechResult ?? "").trim();
      if (!said) return await handle("silence", p, cfg);
      const state = stateOf(row);
      try {
        return await respond(row, state, await runTurn(state, said, deps(cfg, sid)), cfg);
      } catch (e) {
        console.error("turn failed", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
        const fail = stateOf(row); // the history as it was before this turn
        if (cfg.team_phone) {
          return await respond(row, fail, { say: LINES.trouble[fail.language] + " " + LINES.connecting[fail.language], action: "transfer", reason: "The virtual host had a technical problem.", transcript: [{ who: "guest", text: said }, { who: "system", text: "Technical problem, transferring" }] }, cfg);
        }
        await saveCall(row, fail, { transcript: [{ who: "guest", text: said }, { who: "system", text: "Technical problem" }] }, { status: "failed", ended_at: new Date().toISOString() });
        return hangup(LINES.trouble[fail.language] + " " + LINES.unavailable[fail.language], fail.language);
      }
    }

    case "silence": {
      const row = await loadCall(sid);
      if (!row) return hangup(null, "en");
      const lang = row.language;
      if (row.silences >= 2) {
        await sb.from("calls").update({ status: finalStatus(row), ended_at: new Date().toISOString(),
          transcript: [...row.transcript, { who: "system", text: "No answer from the guest, hung up", at: new Date().toISOString() }] }).eq("call_sid", sid);
        return hangup(LINES.goodbye[lang], lang);
      }
      await sb.from("calls").update({ silences: row.silences + 1 }).eq("call_sid", sid);
      return gather(LINES.still_there[lang], lang, url("turn"), url("silence"));
    }

    case "whisper": {
      // played to the team member who picks up, before the guest is connected
      const row = await loadCall(p.ParentCallSid || sid);
      const reason = row?.pending?.reason || "a guest asked to talk to the team";
      return sayOnly(`Maison Hamra call from the Auto-pilot: ${reason}`, "en");
    }

    case "dial-done": {
      const status = p.DialCallStatus ?? "";
      if (status === "completed" || status === "answered") {
        const row = await loadCall(sid);
        await sb.from("calls").update({
          status: row?.reservation_id ? "booked" : "transferred", pending: null, ended_at: new Date().toISOString(),
          transcript: [...(row?.transcript ?? []), { who: "system", text: "Talked with the team", at: new Date().toISOString() }],
        }).eq("call_sid", sid);
        return hangup(null, "en");
      }
      if (!cfg.enabled || !cfg.anthropic) {
        await sb.rpc("phone_event", { p_call_sid: sid, p_kind: "missed", p_detail: `Nobody answered (${status || "no answer"}).` });
        await sb.from("calls").update({ status: "missed_transfer", ended_at: new Date().toISOString() }).eq("call_sid", sid);
        return hangup(LINES.unavailable[cfg.language ?? "en"], cfg.language ?? "en");
      }
      return await missed(sid, status.replace("-", " ") || "no answer", cfg);
    }

    case "status": {
      const done = ["completed", "busy", "failed", "no-answer", "canceled"].includes(p.CallStatus);
      if (done) {
        const row = await loadCall(sid);
        if (row && (row.status === "live" || row.status === "transferring")) {
          await sb.from("calls").update({ status: p.CallStatus === "failed" ? "failed" : finalStatus(row), ended_at: new Date().toISOString() }).eq("call_sid", sid);
        } else if (row) {
          await sb.from("calls").update({ ended_at: new Date().toISOString() }).eq("call_sid", sid).is("ended_at", null);
        }
      }
      return empty();
    }
  }
  return hangup(null, "en");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const raw = await req.text();
  if (raw.length > 20000) return new Response("Too large", { status: 413 });
  const p = Object.fromEntries(new URLSearchParams(raw));
  const step = new URL(req.url).searchParams.get("step") ?? "start";

  let cfg: Config;
  try { cfg = await config(); } catch (e) { console.error(e); return new Response("Not configured", { status: 500 }); }
  if (!cfg.twilio) return new Response("Phone signing key missing in Vault (phone_signing_key)", { status: 503 });
  const given = req.headers.get("x-signalwire-signature") ?? req.headers.get("x-twilio-signature") ?? "";
  if (!await validSignature(cfg.twilio, given, BASE + new URL(req.url).search, p, raw)) return new Response("Invalid signature", { status: 403 });
  if (!p.CallSid) return new Response("Missing CallSid", { status: 400 });

  const xml = await handle(step, p, cfg);
  return new Response(xml, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
});
