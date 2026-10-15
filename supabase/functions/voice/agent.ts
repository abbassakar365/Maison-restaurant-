// The phone Auto-pilot's conversation: one call to `runTurn` per thing the guest says.
// Claude decides what to say and which tool to use; the tools talk to the database.
import Anthropic from "npm:@anthropic-ai/sdk@0.132.1";
import type { Lang } from "./twiml.ts";

type Message = Anthropic.Beta.BetaMessageParam;
type ToolUse = Anthropic.Beta.BetaToolUseBlock;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

export const MODEL = "claude-opus-5-5";

// What the tools need from the outside world (the database, in production; fakes, in tests)
export type Deps = {
  claude: (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage>;
  checkAvailability: (at: string, guests: number) => Promise<unknown>;
  findReservation: (phone: string | null, code: string | null) => Promise<unknown>;
  book: (b: Booking) => Promise<unknown>;
};

export type Booking = {
  full_name: string; phone: string; at: string; guests: number; set_menu: string | null; notes: string | null;
};

export type CallState = {
  messages: Message[];
  context: string;      // fixed for the whole call, so the prompt prefix stays the same
  language: Lang;
  from: string | null;
  pending: Pending | null;
};

// A transfer waiting for the team to pick up: the results to send Claude once we know how it went
export type Pending = { transfer_id: string; reason: string; results: ToolResult[] };

export type Turn = {
  say: string;
  action: "listen" | "transfer" | "hangup";
  reason?: string;       // why the guest is being transferred (played to the team member)
  summary?: string;      // set when the call ends
  booked?: unknown;      // the reservation, when one was made this turn
  transcript: { who: "agent" | "guest" | "system"; text: string }[];
};

export const SYSTEM = `You are the virtual host who answers the phone at Maison Hamra, a French brasserie on Hamra Street in Beirut. The menu is 100% pork-free and alcohol-free.

You are speaking on a live phone call. Everything you write is read aloud by a text-to-speech voice, and the guest's words reach you through speech recognition, which can mishear names and numbers.

How to speak:
- Keep every reply short: one to three sentences, then stop and let the guest answer. Ask one question at a time.
- Plain spoken language only. No lists, headings, symbols, emoji or markdown.
- Say times and dates the way people say them out loud ("Friday the seventeenth at eight thirty in the evening").
- Reply in the guest's language: English, French or Lebanese Arabic. When the guest speaks French or Arabic, call set_language once so the voice and speech recognition switch too.
- Be warm and efficient, like a good maître d'.

What you can do:
1. Book a table. You need: the date, the time, the number of guests, the guest's full name, a phone number, whether they want one of the set menus or will order from the menu on the day, and any special requests (allergies, birthday, high chair, and so on).
   - Check the table with check_availability as soon as you know the date, time and number of guests. Never promise a table without checking. If it is not available, offer the suggested times.
   - The caller's number is given below. Ask whether it is the best number for the booking instead of asking them to read out a number.
   - Before booking, read back every detail in one sentence and ask the guest to confirm. Only call book_table after the guest clearly says yes, and set guest_confirmed to true.
   - After booking, tell the guest their reservation code, spelling it out character by character (for example "M H, dash, 7, K, 2, P, Q, 9"). Say whether it is confirmed or waiting for the team to confirm.
   - If a deposit is due, tell the guest the amount and the deadline, and that they can pay by bank transfer or Whish by putting the reservation code in the payment reference, using the details on the website's payment page. Unpaid deposits cancel the booking automatically at the deadline.
2. Check an existing reservation with find_reservation, by the caller's number or by the code the guest gives you.
3. Put the guest through to the team with transfer_to_team. Do this straight away when the guest asks for a person, a manager or the team, and also for anything you cannot handle: changing or cancelling a booking, groups over 30, private events, complaints, lost property, deposit refunds, or if you have misunderstood the guest twice.
4. Answer simple questions about the restaurant from the information below. If you don't know something, say so and offer to put them through to the team.

When the conversation is finished and the guest has said goodbye, say a short goodbye and call end_call with a one-line summary of the call for the team.

Never make up availability, prices, codes or policies. Never ask for card numbers or payment details over the phone.`;

const tool = (name: string, description: string, properties: Record<string, unknown>): Anthropic.Beta.BetaTool => ({
  name,
  description,
  strict: true,
  input_schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
});

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  tool("check_availability", "Check whether a table is free. Returns available true or false, the problem if any, and suggested free times.", {
    date: { type: "string", description: "Date in Beirut, YYYY-MM-DD" },
    time: { type: "string", description: "Time in Beirut, 24-hour HH:MM, on the hour or half hour" },
    guests: { type: "integer", description: "Number of guests" },
  }),
  tool("find_reservation", "Find the caller's upcoming reservations, by reservation code or by phone number.", {
    code: { type: ["string", "null"], description: "Reservation code like MH-7K2PQ9, or null" },
    phone: { type: ["string", "null"], description: "Phone number to search by, or null to use the caller's number" },
  }),
  tool("book_table", "Book the table. Only after reading the details back and the guest confirming them.", {
    full_name: { type: "string" },
    phone: { type: "string", description: "Phone number for the booking, with country code when known" },
    date: { type: "string", description: "YYYY-MM-DD" },
    time: { type: "string", description: "HH:MM, 24-hour" },
    guests: { type: "integer" },
    set_menu: { type: ["string", "null"], description: "Set menu id from the list below, or null for ordering from the menu on the day" },
    notes: { type: ["string", "null"], description: "Special requests, or null" },
    guest_confirmed: { type: "boolean", description: "True only if the guest said yes to the details you read back" },
  }),
  tool("transfer_to_team", "Put the call through to a person on the restaurant team.", {
    reason: { type: "string", description: "One short sentence for the team member who picks up, e.g. 'Guest wants to change tonight's booking MH-7K2PQ9'" },
  }),
  tool("set_language", "Switch the voice and speech recognition to the guest's language.", {
    language: { type: "string", enum: ["en", "fr", "ar"] },
  }),
  tool("end_call", "Hang up after saying goodbye.", {
    summary: { type: "string", description: "One line for the team's call log" },
  }),
];

// Beirut wall-clock date and time → ISO timestamp with the right UTC offset (handles summer time)
export function beirutISO(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [hh, mm] = time.split(":").map(Number);
  if (hh > 23 || mm > 59) return null;
  const wall = Date.parse(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
  if (Number.isNaN(wall)) return null;
  const offsetAt = (t: number) => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Beirut", timeZoneName: "longOffset" })
      .formatToParts(new Date(t)).find((p) => p.type === "timeZoneName")!.value; // "GMT+03:00"
    const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  };
  let off = offsetAt(wall);
  off = offsetAt(wall - off * 60000);
  return new Date(wall - off * 60000).toISOString();
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^.*?ERROR:\s*/, "");

async function runTool(t: ToolUse, state: CallState, deps: Deps, out: Turn): Promise<ToolResult> {
  const input = t.input as Record<string, unknown>;
  const result = (content: unknown, isError = false): ToolResult => ({
    type: "tool_result", tool_use_id: t.id, content: typeof content === "string" ? content : JSON.stringify(content), is_error: isError,
  });
  try {
    switch (t.name) {
      case "check_availability": {
        const at = beirutISO(String(input.date), String(input.time));
        if (!at) return result("Use date YYYY-MM-DD and time HH:MM.", true);
        return result(await deps.checkAvailability(at, Number(input.guests)));
      }
      case "find_reservation": {
        const phone = (input.phone as string | null) ?? state.from;
        const found = await deps.findReservation(phone, (input.code as string | null) ?? null);
        return result(Array.isArray(found) && !found.length ? "No upcoming reservation found." : found);
      }
      case "book_table": {
        if (input.guest_confirmed !== true) return result("Read the details back and get the guest's yes first.", true);
        const at = beirutISO(String(input.date), String(input.time));
        if (!at) return result("Use date YYYY-MM-DD and time HH:MM.", true);
        const booked = await deps.book({
          full_name: String(input.full_name), phone: String(input.phone), at, guests: Number(input.guests),
          set_menu: (input.set_menu as string | null) || null, notes: (input.notes as string | null) || null,
        });
        out.booked = booked;
        out.transcript.push({ who: "system", text: "Booked: " + JSON.stringify(booked) });
        return result(booked);
      }
      case "set_language": {
        const lang = input.language as Lang;
        if (lang === "en" || lang === "fr" || lang === "ar") state.language = lang;
        return result("Language set to " + state.language + ".");
      }
      default:
        return result("Unknown tool.", true);
    }
  } catch (e) {
    return result(errorText(e), true);
  }
}

const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join(" ").trim();

/**
 * Advance the call by one step.
 * - `guestSaid`: what the guest just said, or null when resuming after a transfer nobody answered.
 * The caller saves `state` (it is updated in place) and turns the result into TwiML.
 */
export async function runTurn(state: CallState, guestSaid: string | null, deps: Deps, missedReason?: string): Promise<Turn> {
  const out: Turn = { say: "", action: "listen", transcript: [] };

  if (state.pending) {
    // the transfer didn't connect: tell Claude, together with any other results from that turn
    const p = state.pending;
    state.pending = null;
    state.messages.push({
      role: "user",
      content: [
        ...p.results,
        { type: "tool_result", tool_use_id: p.transfer_id, is_error: true,
          content: `Nobody on the team answered (${missedReason ?? "no answer"}). The team has been told to call the guest back on ${state.from ?? "their number"}. Apologise, offer to take a message for the team, or help with anything you can.` },
        ...(guestSaid ? [{ type: "text" as const, text: guestSaid }] : []),
      ],
    });
    out.transcript.push({ who: "system", text: "Transfer not answered" + (missedReason ? ` (${missedReason})` : "") });
  } else if (guestSaid !== null) {
    state.messages.push({ role: "user", content: guestSaid });
  } else {
    // a transfer that never reached Claude as a tool call (technical problem or refusal)
    state.messages.push({ role: "user", content: `(Note from the phone system: the guest could not be put through to the team — ${missedReason ?? "no answer"}. The team will call them back. Apologise and offer to take a message or help with anything you can.)` });
    out.transcript.push({ who: "system", text: "Transfer not answered" + (missedReason ? ` (${missedReason})` : "") });
  }
  if (guestSaid) out.transcript.push({ who: "guest", text: guestSaid });

  const spoken: string[] = [];
  for (let step = 0; step < 6; step++) {
    const res = await deps.claude({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },          // a phone call can't wait long for an answer
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM }, { type: "text", text: state.context }],
      tools: TOOLS,
      messages: state.messages,
    });

    if (res.stop_reason === "refusal") {
      // don't keep a declined turn in the history; hand the guest to a person
      return { ...out, say: spoken.join(" "), action: "transfer", reason: "The virtual host couldn't handle this request." };
    }
    state.messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    const text = textOf(res.content);
    if (text) spoken.push(text);

    const uses = res.content.filter((b): b is ToolUse => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) break;

    const results: ToolResult[] = [];
    let transfer: ToolUse | null = null, end: ToolUse | null = null;
    for (const u of uses) {
      if (u.name === "transfer_to_team") transfer = u;
      else if (u.name === "end_call") end = u;
      else results.push(await runTool(u, state, deps, out));
    }

    if (transfer) {
      const reason = String((transfer.input as Record<string, unknown>).reason ?? "");
      if (end) results.push({ type: "tool_result", tool_use_id: end.id, content: "Not ended: transferring instead." });
      state.pending = { transfer_id: transfer.id, reason, results };
      Object.assign(out, { action: "transfer", reason });
      break;
    }
    if (end) {
      results.push({ type: "tool_result", tool_use_id: end.id, content: "Call ended." });
      state.messages.push({ role: "user", content: results });
      Object.assign(out, { action: "hangup", summary: String((end.input as Record<string, unknown>).summary ?? "") });
      break;
    }
    state.messages.push({ role: "user", content: results });
  }

  out.say = spoken.join(" ");
  if (out.say) out.transcript.push({ who: "agent", text: out.say });
  return out;
}
