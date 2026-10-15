// TwiML (Twilio's call instructions) and Twilio request signing.

export type Lang = "en" | "fr" | "ar";

// Speech recognition language, and the voice the Auto-pilot speaks with
export const VOICES: Record<Lang, { listen: string; say: string; voice: string }> = {
  en: { listen: "en-US", say: "en-US", voice: "Polly.Joanna-Neural" },
  fr: { listen: "fr-FR", say: "fr-FR", voice: "Polly.Lea-Neural" },
  ar: { listen: "ar-LB", say: "arb", voice: "Polly.Zeina" },
};

export const LINES: Record<string, Record<Lang, string>> = {
  greeting: {
    en: "Bonjour, thank you for calling Maison Hamra. I'm the restaurant's virtual host. I can book a table or check a reservation, or put you through to the team. How can I help?",
    fr: "Bonjour, merci d'appeler la Maison Hamra. Je suis l'hôte virtuel du restaurant. Je peux réserver une table, vérifier une réservation, ou vous passer l'équipe. Comment puis-je vous aider ?",
    ar: "بونجور، شكراً لاتصالك بميزون الحمرا. أنا المضيف الافتراضي للمطعم. بقدر احجزلك طاولة، او اتأكد من حجز، او حولك على الفريق. كيف بقدر ساعدك؟",
  },
  still_there: {
    en: "Sorry, I didn't catch that. Are you still there?",
    fr: "Pardon, je n'ai pas entendu. Vous êtes toujours là ?",
    ar: "عفواً، ما سمعتك منيح. بعدك معي؟",
  },
  goodbye: {
    en: "Thank you for calling Maison Hamra. Goodbye!",
    fr: "Merci d'avoir appelé la Maison Hamra. Au revoir !",
    ar: "شكراً لاتصالك بميزون الحمرا. مع السلامة!",
  },
  connecting: {
    en: "Please hold, I'm putting you through to the team now.",
    fr: "Un instant, je vous passe l'équipe.",
    ar: "لحظة من فضلك، عم حولك على الفريق.",
  },
  team_only: {
    en: "Thank you for calling Maison Hamra. Please hold while I put you through to the team.",
    fr: "Merci d'appeler la Maison Hamra. Un instant, je vous passe l'équipe.",
    ar: "شكراً لاتصالك بميزون الحمرا. لحظة من فضلك، عم حولك على الفريق.",
  },
  unavailable: {
    en: "Sorry, nobody can take your call right now. Please call back later, or book on our website. Goodbye.",
    fr: "Désolé, personne ne peut prendre votre appel pour le moment. Rappelez plus tard, ou réservez sur notre site. Au revoir.",
    ar: "عفواً، ما في حدا يرد هلق. فيك تتصل بعدين او تحجز عالموقع. مع السلامة.",
  },
  trouble: {
    en: "Sorry, I'm having trouble right now.",
    fr: "Désolé, j'ai un petit problème technique.",
    ar: "عفواً، عندي مشكلة تقنية هلق.",
  },
};

const xml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));

// Spoken text: no markdown, emoji or line breaks
export function speakable(s: string): string {
  return s
    .replace(/[*_#`>|~]/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
}

function say(text: string, lang: Lang): string {
  const v = VOICES[lang];
  return `<Say voice="${v.voice}" language="${v.say}">${xml(speakable(text))}</Say>`;
}

const doc = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;

// Speak, then listen for the guest's answer. If they say nothing, go to `onSilence`.
export function gather(text: string, lang: Lang, action: string, onSilence: string): string {
  const v = VOICES[lang];
  const model = lang === "en" ? ` speechModel="phone_call" enhanced="true"` : "";
  return doc(
    `<Gather input="speech" action="${xml(action)}" method="POST" language="${v.listen}" speechTimeout="auto" timeout="6" actionOnEmptyResult="false"${model}>` +
      say(text, lang) +
      `</Gather><Redirect method="POST">${xml(onSilence)}</Redirect>`,
  );
}

// Speak, then put the call through to the team phone. `whisper` is played to the team member first.
export function dial(text: string, lang: Lang, teamPhone: string, action: string, whisper: string): string {
  return doc(
    say(text, lang) +
      `<Dial action="${xml(action)}" method="POST" timeout="25" answerOnBridge="true">` +
      `<Number url="${xml(whisper)}" method="POST">${xml(teamPhone)}</Number></Dial>`,
  );
}

export function sayOnly(text: string, lang: Lang): string {
  return doc(say(text, lang));
}

export function hangup(text: string | null, lang: Lang): string {
  return doc((text ? say(text, lang) : "") + "<Hangup/>");
}

export const empty = () => doc("");

// https://www.twilio.com/docs/usage/security#validating-requests
export async function twilioSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
