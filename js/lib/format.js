/* Formatting helpers: dates in Beirut time, money and error text. */

export const TZ = 'Asia/Beirut';

const whenFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
});
const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });
const isoDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "Sat, 18 Oct 2026, 20:30" in Beirut time. */
export const fmtWhen = (date) => whenFormat.format(new Date(date));

/** Relative time for lists: "just now", "5 min ago", "3 h ago", then a short date. */
export function fmtAgo(date) {
  const seconds = (Date.now() - new Date(date)) / 1000;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' h ago';
  return dayFormat.format(new Date(date));
}

/** YYYY-MM-DD of an instant, in Beirut time. */
export const beirutDay = (date = Date.now()) => isoDayFormat.format(new Date(date));

/** HH:MM of an instant, in Beirut time. */
export const beirutTime = (date) => timeFormat.format(new Date(date));

/** Turn a Beirut wall-clock date ("2026-10-18") and time ("20:30") into an ISO instant. */
export function beirutISO(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetName = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(guess)).find((p) => p.type === 'timeZoneName').value;
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(offsetName);
  const minutes = match ? (match[1] === '-' ? -1 : 1) * (+match[2] * 60 + +(match[3] || 0)) : 0;
  return new Date(guess - minutes * 60000).toISOString();
}

export const pad2 = (n) => String(n).padStart(2, '0');

/** "HH:MM" from a Postgres time value such as "12:00:00". */
export const hhmm = (t) => String(t).slice(0, 5);

/** "$1,234" or "$12.50". */
export const money = (n) =>
  '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });

/** A readable message from a Supabase / Auth error. */
export const errText = (e) => (e && (e.message || e.error_description)) || 'Something went wrong. Please try again.';

/** "3 guests", "1 guest" */
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Digits only, no leading zeros: how phone numbers are stored next to a country code. */
export const cleanPhone = (raw) => raw.replace(/\D/g, '').replace(/^0+/, '');

/** A tel: link for a stored phone number. */
export const telHref = (phone) => 'tel:' + String(phone).replace(/[^+\d]/g, '');
