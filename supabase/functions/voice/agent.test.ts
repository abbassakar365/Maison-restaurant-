// deno test supabase/functions/voice/agent.test.ts
// Simulated calls: Claude and the database are replaced with scripted fakes.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { createHmac } from "node:crypto";
import type Anthropic from "npm:@anthropic-ai/sdk@0.132.1";
import { beirutISO, type Booking, type CallState, type Deps, runTurn, TOOLS } from "./agent.ts";
import { dial, gather, hangup, speakable, twilioSignature, validSignature } from "./twiml.ts";

type Block = Anthropic.Beta.BetaContentBlock;
const text = (t: string): Block => ({ type: "text", text: t, citations: null }) as Block;
const use = (id: string, name: string, input: unknown): Block => ({ type: "tool_use", id, name, input }) as Block;
const reply = (content: Block[], stop: string = content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn") =>
  ({ id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason: stop, usage: {} }) as unknown as Anthropic.Beta.BetaMessage;

function fakes(script: Anthropic.Beta.BetaMessage[]) {
  const seen: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const booked: Booking[] = [];
  const deps: Deps = {
    claude: (p) => { seen.push(structuredClone(p)); const r = script.shift(); if (!r) throw new Error("script ended"); return Promise.resolve(r); },
    checkAvailability: (at, guests) => Promise.resolve({ available: guests <= 8, when: at, suggestions: guests <= 8 ? [] : ["Fri 17 Oct 2026 21:00"] }),
    findReservation: (phone, code) => Promise.resolve(code === "MH-AAAAAA" || phone === "+96170000000" ? [{ code: "MH-AAAAAA", status: "confirmed" }] : []),
    book: (b) => { booked.push(b); return Promise.resolve({ code: "MH-7K2PQ9", status: "confirmed", deposit: 0 }); },
  };
  return { deps, seen, booked };
}

const newCall = (): CallState => ({
  messages: [{ role: "user", content: "(The phone call has just been connected.)" }, { role: "assistant", content: "Bonjour, how can I help?" }],
  context: "Right now in Beirut it is Thursday 16 October 2026, 15:00.", language: "en", from: "+96170000000", pending: null,
});

// every tool_use must be answered by a tool_result in the very next message
function assertValidHistory(messages: CallState["messages"]) {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "assistant" || typeof m.content === "string") continue;
    const ids = m.content.filter((b) => b.type === "tool_use").map((b) => (b as { id: string }).id);
    if (!ids.length) continue;
    const next = messages[i + 1];
    assert(next && next.role === "user" && typeof next.content !== "string", `tool_use at ${i} has no tool_result after it`);
    const answered = (next.content as { type: string; tool_use_id?: string }[]).filter((b) => b.type === "tool_result").map((b) => b.tool_use_id);
    assertEquals(answered.sort(), ids.sort());
  }
}

Deno.test("books a table only after the guest confirms, then gives the code", async () => {
  const state = newCall();
  const { deps, seen, booked } = fakes([
    reply([use("t1", "check_availability", { date: "2026-10-17", time: "20:30", guests: 4 })]),
    reply([text("Good news, we have a table for four on Friday at eight thirty. May I have your name?")]),
    reply([text("Thank you. So that's Rania Khoury, four guests, Friday the seventeenth at eight thirty, no set menu, on this number. Shall I book it?")]),
    reply([use("t2", "book_table", { full_name: "Rania Khoury", phone: "+96170000000", date: "2026-10-17", time: "20:30", guests: 4, set_menu: null, notes: null, guest_confirmed: true })]),
    reply([text("You're booked. Your code is M H, dash, 7, K, 2, P, Q, 9.")]),
  ]);

  let t = await runTurn(state, "A table for four tomorrow at 8:30 please", deps);
  assertEquals(t.action, "listen");
  assertMatch(t.say, /table for four/);
  t = await runTurn(state, "Rania Khoury, and this number is fine, no set menu", deps);
  assertMatch(t.say, /Shall I book it/);
  assertEquals(booked.length, 0);
  t = await runTurn(state, "Yes please", deps);
  assertEquals(booked.length, 1);
  assertEquals(booked[0].at, "2026-10-17T17:30:00.000Z"); // 20:30 in Beirut (UTC+3 in October)
  assertEquals(booked[0].set_menu, null);
  assertMatch(t.say, /7, K, 2, P, Q, 9/);
  assert(t.booked);

  // the request Claude gets: model, low effort, fallback, the call's context, the tools
  assertEquals(seen[0].model, "claude-opus-5-5");
  assertEquals(seen[0].output_config?.effort, "low");
  assertEquals(seen[0].fallbacks, "default");
  assertEquals((seen[0].system as { text: string }[])[1].text, state.context);
  assertEquals(seen[0].tools?.length, TOOLS.length);
  assertValidHistory(state.messages);
});

Deno.test("refuses to book when the guest hasn't confirmed", async () => {
  const state = newCall();
  const { deps, booked } = fakes([
    reply([use("t1", "book_table", { full_name: "Sami", phone: "+96170000000", date: "2026-10-17", time: "20:00", guests: 2, set_menu: null, notes: null, guest_confirmed: false })]),
    reply([text("Just to confirm, two guests tomorrow at eight. Is that right?")]),
  ]);
  const t = await runTurn(state, "Book it for two tomorrow at 8", deps);
  assertEquals(booked.length, 0);
  assertMatch(t.say, /Is that right/);
  const results = state.messages[4].content as { is_error?: boolean }[];
  assertEquals(results[0].is_error, true);
});

Deno.test("offers other times when the slot is full", async () => {
  const state = newCall();
  const { deps, seen } = fakes([
    reply([use("t1", "check_availability", { date: "2026-10-17", time: "20:00", guests: 12 })]),
    reply([text("Eight o'clock is full for twelve, but nine o'clock is free. Would that work?")]),
  ]);
  const t = await runTurn(state, "Twelve people tomorrow at 8", deps);
  assertMatch(t.say, /nine/);
  const result = (seen[1].messages.at(-1)!.content as { content: string }[])[0].content;
  assertMatch(result, /"available":false/);
  assertMatch(result, /21:00/);
});

Deno.test("finds an existing reservation by the caller's number", async () => {
  const state = newCall();
  const { deps, seen } = fakes([
    reply([use("t1", "find_reservation", { code: null, phone: null })]),
    reply([text("Yes, I can see reservation M H dash A A A A A A, confirmed.")]),
  ]);
  await runTurn(state, "Do I have a booking?", deps);
  assertMatch((seen[1].messages.at(-1)!.content as { content: string }[])[0].content, /MH-AAAAAA/);
});

Deno.test("transfers to the team when asked, and resumes if nobody answers", async () => {
  const state = newCall();
  const { deps } = fakes([
    reply([text("Of course, one moment."), use("t1", "transfer_to_team", { reason: "Guest wants to talk to the manager" })]),
    reply([text("I'm sorry, the team couldn't pick up. They'll call you back shortly. Can I take a message?")]),
  ]);
  let t = await runTurn(state, "Can I talk to someone from the team?", deps);
  assertEquals(t.action, "transfer");
  assertEquals(t.reason, "Guest wants to talk to the manager");
  assertEquals(t.say, "Of course, one moment.");
  assert(state.pending);

  t = await runTurn(state, null, deps, "no answer");
  assertEquals(state.pending, null);
  assertEquals(t.action, "listen");
  assertMatch(t.say, /call you back/);
  assertValidHistory(state.messages);
});

Deno.test("switches language and ends the call", async () => {
  const state = newCall();
  const { deps } = fakes([
    reply([use("t1", "set_language", { language: "fr" })]),
    reply([text("Bien sûr, pour combien de personnes ?")]),
    reply([text("Au revoir !"), use("t2", "end_call", { summary: "Asked about opening hours" })]),
  ]);
  await runTurn(state, "Bonjour, je voudrais réserver", deps);
  assertEquals(state.language, "fr");
  const t = await runTurn(state, "Merci, au revoir", deps);
  assertEquals(t.action, "hangup");
  assertEquals(t.summary, "Asked about opening hours");
  assertValidHistory(state.messages);
});

Deno.test("hands the guest to a person when Claude declines", async () => {
  const state = newCall();
  const { deps } = fakes([reply([], "refusal")]);
  const t = await runTurn(state, "something odd", deps);
  assertEquals(t.action, "transfer");
  assertEquals(state.messages.at(-1)!.role, "user"); // the declined turn isn't kept
});

Deno.test("Beirut times handle summer and winter", () => {
  assertEquals(beirutISO("2026-07-01", "20:00"), "2026-07-01T17:00:00.000Z");
  assertEquals(beirutISO("2026-12-01", "20:00"), "2026-12-01T18:00:00.000Z");
  assertEquals(beirutISO("2026-12-01", "8pm"), null);
});

Deno.test("TwiML: speech is escaped and readable", () => {
  const xml = gather("**Table** for 2 & <b>you</b> 🎉", "en", "https://x/voice?step=turn&a=1", "https://x/voice?step=silence");
  assert(xml.includes("Table for 2 &amp; &lt;byou&lt;/b"));
  assert(!xml.includes("<b") && !xml.includes("🎉"));
  assert(xml.includes('action="https://x/voice?step=turn&amp;a=1"'));
  assert(xml.includes('language="en-US"'));
  assert(dial("Hold on", "fr", "+9611000000", "https://x/d", "https://x/w").includes("<Number"));
  assert(hangup(null, "ar").endsWith("<Hangup/></Response>"));
  assertEquals(speakable("Hello\n\n- one"), "Hello - one");
});

Deno.test("Twilio signature matches the reference algorithm", async () => {
  const params = { CallSid: "CA123", From: "+96170000000", SpeechResult: "table for two" };
  const url = "https://efwqkllaultepxprwert.supabase.co/functions/v1/voice?step=turn";
  const data = url + Object.keys(params).sort().map((k) => k + params[k as keyof typeof params]).join("");
  const expected = createHmac("sha1", "secret-token").update(data).digest("base64");
  assertEquals(await twilioSignature("secret-token", url, params), expected);
});

Deno.test("SignalWire and Twilio signatures are accepted, wrong ones refused", async () => {
  const params = { CallSid: "CA123", From: "+96170000000" };
  const url = "https://efwqkllaultepxprwert.supabase.co/functions/v1/voice?step=start";
  const raw = new URLSearchParams(params).toString();
  const compat = createHmac("sha1", "signing-key").update(url + "CallSidCA123From+96170000000").digest("base64");
  const hex = createHmac("sha1", "signing-key").update(url + raw).digest("hex");
  const withPort = createHmac("sha1", "signing-key")
    .update(url.replace(".co/", ".co:443/") + "CallSidCA123From+96170000000").digest("base64");
  assertEquals(await validSignature("signing-key", compat, url, params, raw), true);
  assertEquals(await validSignature("signing-key", hex, url, params, raw), true);
  assertEquals(await validSignature("signing-key", withPort, url, params, raw), true);
  assertEquals(await validSignature("other-key", compat, url, params, raw), false);
  assertEquals(await validSignature("signing-key", "", url, params, raw), false);
});
