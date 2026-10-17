/* ===== Maison Hamra — settings: edit this file only ===== */
export const CONFIG = {
  // Supabase > Project Settings > API keys (publishable key — never the secret / service_role key)
  supabaseUrl: 'https://efwqkllaultepxprwert.supabase.co',
  supabaseKey: 'sb_publishable_RIp8fWM5JrW3UfxPJtCMKQ_KOz2WSVa',
  // Web Push public key (safe to share — the private key stays in Supabase Vault)
  vapidPublicKey: 'BInPR4nK3qzv12pQGVrHcu1PtwZff5fDQzIfeXVIdvh_i0HBqhfu7cnOLNN3u31LSu7U0yJ7iolPz53jw3gLoxg',

  name: 'Maison Hamra',
  tagline: 'Brasserie française · Beirut',
  phone: '+961 00 000 000',
  whatsapp: '96100000000',                 // international format, no +
  instagram: '',                            // e.g. 'https://instagram.com/maisonhamra' — icon shows without a link until set
  address: 'Hamra Street, Beirut, Lebanon',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Hamra+Street+Beirut',
  hours: 'Every day · 12:00 – 00:00',
  siteUrl: 'https://abbassakar365.github.io/Maison-restaurant-/',

  // Deposit payments. The deposit rule (25% over $300), opening hours and the 25 tables
  // are set by the team in the team app → Settings, not here.
  payments: {
    cardLink: '',                           // a hosted card checkout (Stripe / Areeba / your bank's payment link). Button hides while empty.
    bank: {
      bankName: 'YOUR BANK NAME',
      accountName: 'Maison Hamra SAL',
      iban: 'LB00 0000 0000 0000 0000 0000 0000',
      swift: 'XXXXLBBE',
      currency: 'USD'
    },
    whish: '+961 00 000 000'                // Whish Money number
  }
};
