/* Shared by every page: Supabase client, helpers, icons, toasts, sound,
   the notification bell and the sign-in / sign-up dialog. */
'use strict';

// The team app keeps its own sign-in, separate from the customer site on the same device
const APP = document.body.classList.contains('team') ? 'team' : 'customer';
const ROOT = document.currentScript.src.replace(/js\/core\.js(\?.*)?$/, '');
const sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: APP === 'team' ? 'mh-team-auth' : 'mh-auth' }
});

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* Build DOM safely: h('p', {class: 'x'}, 'text', child) — strings become text nodes, never HTML */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

const TZ = 'Asia/Beirut';
const fmtWhen = d => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
const fmtAgo = d => {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(d));
};
const money = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
const errText = e => (e && (e.message || e.error_description)) || 'Something went wrong. Please try again.';

/* ---------- icons ---------- */
const ICONS = {
  bell: '<path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/>',
  user: '<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/>',
  phone: '<path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .57 3.6 1 1 0 0 1-.25 1z"/>',
  instagram: '<path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zm5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm0 2a2.5 2.5 0 1 0 2.5 2.5A2.5 2.5 0 0 0 12 9.5zm5.25-3.75a1 1 0 1 1-1 1 1 1 0 0 1 1-1z"/>',
  pin: '<path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z"/>',
  close: '<path d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4z"/>',
  lock: '<path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4zm2 11a2 2 0 1 1 2-2 2 2 0 0 1-2 2z"/>',
  bank: '<path d="M12 2 2 7v2h20V7zM4 11v7h3v-7zm6.5 0v7h3v-7zM17 11v7h3v-7zM2 20v2h20v-2z"/>',
  card: '<path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4H4V6h16zM4 12h16v6H4zm2 3h5v1.5H6z"/>',
  wallet: '<path d="M21 7H5a1 1 0 0 1 0-2h14V3H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zm-3 8a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 18 15z"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4z"/>',
  download: '<path d="M11 3h2v9.6l3.3-3.3 1.4 1.4L12 16.4l-5.7-5.7 1.4-1.4 3.3 3.3zM5 18h14v2H5z"/>',
  clock: '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 10.6 3.7 2.2-.8 1.3L11 13V7h2z"/>'
};
const icon = (name, cls = 'ico') => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', cls);
  s.innerHTML = ICONS[name] || '';
  return s;
};
function paintIcons(root = document) { $$('i[data-icon]', root).forEach(i => i.replaceWith(icon(i.dataset.icon, i.className || 'ico'))); }

/* ---------- toasts & sound ---------- */
function toast(title, body, kind = 'info', onClick) {
  const box = $('#toasts');
  if (!box) return;
  const t = h('div', { class: 'toast ' + kind, role: kind === 'error' ? 'alert' : 'status' },
    h('img', { class: 'toast-icon', src: ROOT + 'icons/icon-192.png', alt: '', width: 36, height: 36 }),
    h('div', { class: 'toast-text' }, h('strong', {}, title), body ? h('span', {}, body) : null));
  if (onClick) { t.classList.add('clickable'); t.addEventListener('click', () => { onClick(); t.remove(); }); }
  box.append(t);
  setTimeout(() => t.classList.add('out'), 6000);
  setTimeout(() => t.remove(), 6600);
}

let audio;
document.addEventListener('pointerdown', () => {
  if (!audio) try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
  if (audio && audio.state === 'suspended') audio.resume();
}, { passive: true });
function chime() {
  if (!audio) return;
  const t = audio.currentTime;
  [[880, 0], [1318.5, 0.14]].forEach(([f, d]) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.6);
    o.connect(g).connect(audio.destination); o.start(t + d); o.stop(t + d + 0.65);
  });
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
}

/* ---------- phone notifications: service worker + Web Push ----------
   With push on, alerts reach the phone even when the app is closed: the database
   hands each new notification to the `push` Edge Function, which sends it here. */
let swReg = null, pushOn = false;
const swReady = 'serviceWorker' in navigator
  ? navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(r => (swReg = r)).catch(() => null)
  : Promise.resolve(null);
const alertsOn = () => 'Notification' in window && Notification.permission === 'granted';
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const b64url = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };

async function pushSubscribe() {
  const reg = await swReady;
  if (!reg || !('PushManager' in window) || !alertsOn() || !Auth.user) return false;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url(CONFIG.vapidPublicKey) });
    const j = sub.toJSON();
    const { error } = await sb.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_app: APP });
    pushOn = !error;
  } catch (_) { pushOn = false; }
  return pushOn;
}
async function pushUnsubscribe() {
  const reg = await swReady;
  const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await sb.rpc('remove_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => {});
  pushOn = false;
}
async function enableAlerts() {
  if (isIOS && !installed()) {
    toast('Add to Home Screen first', 'On iPhone, tap Share → Add to Home Screen, open Maison Hamra from there, then turn alerts on.', 'warn');
    return false;
  }
  if (!('Notification' in window)) { toast('Not supported', 'This browser cannot show phone alerts.', 'error'); return false; }
  const p = await Notification.requestPermission();
  if (p !== 'granted') { toast('Alerts blocked', 'Allow notifications for this site in your browser settings.', 'error'); return false; }
  const push = await pushSubscribe();
  chime();
  toast('Alerts on', push ? 'You will get updates on this phone even when the app is closed.' : 'You will get a pop-up and a sound while the app is open.', 'ok');
  return true;
}
function systemAlert(title, body, tag) {
  // when push is on, the service worker shows the alert — don't show it twice
  if (pushOn || !alertsOn() || document.visibilityState === 'visible' && document.hasFocus()) return;
  const opts = { body, tag, icon: ROOT + 'icons/icon-192.png', badge: ROOT + 'icons/badge-96.png', vibrate: [120, 60, 120] };
  if (swReg) swReg.showNotification(title, opts); else try { new Notification(title, opts); } catch (_) {}
}

/* ---------- install the app (customer site and team app) ----------
   Chrome / Edge / Samsung Internet offer a real install window; Safari on iPhone and
   Mac only allows "Add to Home Screen" / "Add to Dock" by hand, so we show the steps. */
let installEvent = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; updateInstall(); });
window.addEventListener('appinstalled', () => { installEvent = null; updateInstall(true); toast('Installed', 'Open it from your home screen or apps list.', 'ok'); });
function installSteps() {
  const ua = navigator.userAgent;
  if (isIOS) return 'On iPhone or iPad: open this page in Safari, tap the Share button (the square with an arrow), then “Add to Home Screen”.';
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) return 'On Mac with Safari: choose File → “Add to Dock”.';
  if (/Firefox/.test(ua)) return /Android/.test(ua) ? 'In Firefox: tap the ⋮ menu, then “Install” or “Add to Home screen”.' : 'Firefox on computers can’t install apps. Open this page in Chrome or Edge and press the button again.';
  if (/Android/.test(ua)) return 'Tap your browser’s ⋮ menu, then “Install app” or “Add to Home screen”.';
  return 'In Chrome or Edge, click the install icon at the right end of the address bar, or open the ⋮ menu → “Install”.';
}
function updateInstall(justInstalled) {
  $$('[data-install]').forEach(btn => {
    const label = $('span', btn), done = justInstalled || installed();
    btn.disabled = done;
    if (done) label.textContent = 'Installed on this device';
    const help = btn.closest('.install-card').querySelector('.install-help');
    if (help && done) help.hidden = true;
  });
}
function wireInstall() {
  $$('[data-install]').forEach(btn => btn.addEventListener('click', async () => {
    const help = btn.closest('.install-card').querySelector('.install-help');
    if (installEvent) {
      installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      installEvent = null;
      if (outcome !== 'accepted' && help) { help.hidden = false; help.textContent = 'No problem — you can install it any time from this button.'; }
      return;
    }
    if (help) { help.hidden = false; help.textContent = installSteps(); }
  }));
  updateInstall();
}

/* ---------- notification bell ---------- */
const Bell = {
  items: [], channel: null, staff: false, onOpen: null,
  async start(user, { staff = false, onOpen } = {}) {
    this.stop();
    this.staff = staff; this.onOpen = onOpen || null;
    let q = sb.from('notifications').select('*, reservations(code, status, cancelled_by)').order('created_at', { ascending: false }).limit(60);
    q = staff ? q.eq('for_staff', true) : q.eq('user_id', user.id);
    const { data } = await q;
    this.items = data || [];
    this.render();
    const filter = staff ? 'for_staff=eq.true' : 'user_id=eq.' + user.id;
    this.channel = sb.channel('notif-' + (staff ? 'team' : user.id))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter }, async ({ new: n }) => {
        if (n.reservation_id) {
          const { data: r } = await sb.from('reservations').select('code, status, cancelled_by').eq('id', n.reservation_id).maybeSingle();
          n.reservations = r;
        }
        this.items.unshift(n);
        this.render();
        chime();
        toast(n.title, n.body, n.kind === 'cancelled' || n.kind === 'no_show' ? 'error' : ['deposit_due', 'deposit_warning', 'suggestion', 'call'].includes(n.kind) ? 'warn' : 'ok', () => this.open(n));
        systemAlert(n.title, n.body, 'mh-' + n.id);
        document.dispatchEvent(new CustomEvent('mh:notification', { detail: n }));
      })
      .subscribe();
  },
  stop() {
    if (this.channel) sb.removeChannel(this.channel);
    this.channel = null; this.items = []; this.render();
  },
  unread() { return this.items.filter(n => !n.read_at).length; },
  render() {
    const badge = $('#badge'), list = $('#notif-list');
    const n = this.unread();
    if (badge) { badge.hidden = !n; badge.textContent = n > 99 ? '99+' : n; }
    const bell = $('#bell');
    if (bell) bell.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications');
    if (!list) return;
    list.replaceChildren(...(this.items.length ? this.items.map(x => this.row(x)) : [h('li', { class: 'empty' }, 'No notifications yet.')]));
    const al = $('#alerts-btn');
    if (al) al.hidden = (alertsOn() && pushOn) || !('Notification' in window || isIOS);
  },
  row(n) {
    const r = n.reservations;
    const cancelled = n.kind === 'cancelled' || (r && r.status === 'cancelled' && n.kind === 'new');
    const by = r && r.cancelled_by;
    return h('li', { class: 'notif' + (n.read_at ? '' : ' unread') + ' k-' + n.kind },
      h('button', { type: 'button', class: 'notif-main', onclick: () => this.open(n) },
        h('span', { class: 'notif-title' }, n.title),
        h('span', { class: 'notif-body' }, n.body),
        h('span', { class: 'notif-time' }, fmtAgo(n.created_at))),
      cancelled ? h('span', { class: 'cancel-mark' }, 'Cancelled', by ? h('small', {}, by === 'system' ? 'auto · unpaid' : 'by ' + by) : null) : null);
  },
  async open(n) {
    if (!n.read_at) { n.read_at = new Date().toISOString(); this.render(); await sb.rpc('mark_read', { p_ids: [n.id] }); }
    if (this.onOpen) this.onOpen(n);
  },
  async readAll() {
    const ids = this.items.filter(n => !n.read_at).map(n => n.id);
    if (!ids.length) return;
    this.items.forEach(n => { n.read_at = n.read_at || new Date().toISOString(); });
    this.render();
    await sb.rpc('mark_read', { p_ids: ids });
  }
};

function wireBell() {
  const bell = $('#bell'), panel = $('#notif-panel');
  if (!bell || !panel) return;
  const close = () => { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); };
  bell.addEventListener('click', e => {
    e.stopPropagation();
    if (!Auth.user) { Auth.open('in'); return; }
    panel.hidden = !panel.hidden;
    bell.setAttribute('aria-expanded', String(!panel.hidden));
  });
  document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  $('#read-all').addEventListener('click', () => Bell.readAll());
  $('#alerts-btn').addEventListener('click', async () => { await enableAlerts(); Bell.render(); });
}

/* ---------- auth ---------- */
const Auth = {
  user: null, profile: null, mode: 'in', recovering: /type=recovery/.test(location.hash), listeners: [],
  onChange(fn) { this.listeners.push(fn); },
  emit() { this.listeners.forEach(fn => fn(this.user, this.profile)); },
  async loadProfile() {
    if (!this.user) { this.profile = null; return; }
    const { data } = await sb.from('profiles').select('*').eq('id', this.user.id).maybeSingle();
    this.profile = data || { full_name: this.user.user_metadata?.full_name || this.user.email, phone: this.user.user_metadata?.phone || '' };
  },
  async init() {
    const dlg = $('#auth-dlg');
    if (dlg) this.wire(dlg);
    const { data } = await sb.auth.getSession();
    this.user = data.session ? data.session.user : null;
    await this.loadProfile();
    this.emit();
    if (this.user) pushSubscribe().then(() => Bell.render());
    // Supabase calls inside this callback must be deferred, or the auth lock deadlocks
    sb.auth.onAuthStateChange((ev, session) => setTimeout(async () => {
      if (ev === 'PASSWORD_RECOVERY') { this.recovering = true; this.open('reset'); return; }
      const before = this.user && this.user.id;
      this.user = session ? session.user : null;
      if ((this.user && this.user.id) === before && ev !== 'USER_UPDATED') return;
      if (/access_token|type=signup/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
      await this.loadProfile();
      this.emit();
      if (this.user) pushSubscribe().then(() => Bell.render());
    }, 0));
    if (this.recovering) this.open('reset');
  },
  open(mode = 'in') {
    const dlg = $('#auth-dlg');
    if (!dlg) return;
    this.set(mode);
    if (!dlg.open) dlg.showModal();
  },
  set(mode) {
    this.mode = mode;
    const f = $('#auth-form');
    const up = mode === 'up', reset = mode === 'reset', forgot = mode === 'forgot';
    $('#auth-title').textContent = { in: 'Welcome back', up: 'Create your account', reset: 'Choose a new password', forgot: 'Reset your password' }[mode];
    $('#auth-tabs').hidden = reset || forgot;
    $$('#auth-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    $$('.only-up', f).forEach(e => { e.hidden = !up; });
    $('#a-email-row').hidden = reset;
    $('#a-pass-row').hidden = forgot;
    $('#a-forgot').hidden = mode !== 'in';
    $('#a-pass').autocomplete = mode === 'in' ? 'current-password' : 'new-password';
    $('#a-pass-label').textContent = mode === 'in' ? 'Password' : 'Password (at least 8 characters)';
    $('#auth-go').textContent = { in: 'Sign in', up: 'Create account', reset: 'Save new password', forgot: 'Send reset link' }[mode];
    $('#auth-msg').textContent = ''; $('#auth-msg').className = 'form-msg';
    $$('.field-err', f).forEach(e => { e.textContent = ''; });
  },
  wire(dlg) {
    $$('#auth-tabs button').forEach(b => b.addEventListener('click', () => this.set(b.dataset.mode)));
    $('#a-forgot').addEventListener('click', () => this.set('forgot'));
    $('#auth-close').addEventListener('click', () => dlg.close());
    $('#a-eye').addEventListener('click', e => {
      const p = $('#a-pass'), show = p.type === 'password';
      p.type = show ? 'text' : 'password'; e.currentTarget.textContent = show ? 'Hide' : 'Show';
    });
    $('#auth-form').addEventListener('submit', e => { e.preventDefault(); this.submit(); });
  },
  async submit() {
    const mode = this.mode, msg = $('#auth-msg');
    const email = $('#a-email').value.trim(), pass = $('#a-pass').value;
    const name = $('#a-name').value.trim(), num = $('#a-phone').value.replace(/\D/g, '').replace(/^0+/, ''), phone = $('#a-cc').value + ' ' + num;
    const errs = {};
    if (mode !== 'reset' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = 'Enter a valid email address.';
    if (mode === 'in' && !pass) errs.pass = 'Enter your password.';
    if ((mode === 'up' || mode === 'reset') && pass.length < 8) errs.pass = 'Use at least 8 characters.';
    if (mode === 'up' && name.length < 2) errs.name = 'Enter your full name.';
    if (mode === 'up' && (num.length < 6 || num.length > 12)) errs.phone = 'Enter a valid phone number.';
    ['email', 'pass', 'name', 'phone'].forEach(k => { $('#e-' + k).textContent = errs[k] || ''; });
    if (Object.keys(errs).length) return;
    const go = $('#auth-go'); go.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Please wait…';
    const back = location.origin + location.pathname;
    try {
      if (mode === 'up') {
        const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: back, data: { full_name: name, phone } } });
        if (error) throw error;
        if (data.session) { $('#auth-dlg').close(); toast('Bienvenue!', 'Your account is ready.', 'ok'); }
        else { this.set('in'); msg.className = 'form-msg ok'; msg.textContent = 'Account created. Check your email to confirm, then sign in.'; }
      } else if (mode === 'forgot') {
        await sb.auth.resetPasswordForEmail(email, { redirectTo: back });
        msg.className = 'form-msg ok'; msg.textContent = 'If this email has an account, a reset link is on its way.';
      } else if (mode === 'reset') {
        const { error } = await sb.auth.updateUser({ password: pass });
        if (error) throw error;
        this.recovering = false; history.replaceState(null, '', location.pathname);
        $('#auth-dlg').close(); toast('Password updated', 'You are signed in.', 'ok');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        $('#auth-dlg').close();
      }
    } catch (e) {
      msg.className = 'form-msg err'; msg.textContent = errText(e);
    } finally { go.disabled = false; }
  },
  async signOut() { await pushUnsubscribe().catch(() => {}); await sb.auth.signOut(); }
};

/* shared country codes for phone inputs */
const COUNTRY_CODES = [['+961', 'LB'], ['+963', 'SY'], ['+962', 'JO'], ['+964', 'IQ'], ['+966', 'SA'], ['+971', 'AE'], ['+974', 'QA'], ['+965', 'KW'], ['+20', 'EG'], ['+90', 'TR'], ['+33', 'FR'], ['+44', 'GB'], ['+49', 'DE'], ['+1', 'US/CA']];
function fillCountryCodes(sel) { sel.replaceChildren(...COUNTRY_CODES.map(([c, n]) => h('option', { value: c }, n + ' ' + c))); }

// remember which reservation a "Pay deposit" link is for (read by pay.js)
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href*="pay.html?r="]');
  if (a) try { sessionStorage.setItem('mh-pay-r', new URL(a.href).searchParams.get('r')); } catch (_) {}
}, true);

document.addEventListener('DOMContentLoaded', () => {
  paintIcons();
  $$('select.cc').forEach(fillCountryCodes);
  $$('[data-cfg]').forEach(e => { e.textContent = CONFIG[e.dataset.cfg]; });
  const y = $('#year'); if (y) y.textContent = new Date().getFullYear();
  wireBell();
  wireInstall();
});
