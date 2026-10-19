/* Sign in, sign up, password reset and the signed-in user's profile.
   Drives the #auth-dlg dialog that every page includes. */
import { $, $$, setFieldError, setMessage } from './dom.js';
import { sb } from './supabase.js';
import { errText, cleanPhone } from './format.js';
import { toast } from './notify.js';
import { pushSubscribe, pushUnsubscribe } from './push.js';

export const COUNTRY_CODES = [
  ['+961', 'LB'], ['+963', 'SY'], ['+962', 'JO'], ['+964', 'IQ'], ['+966', 'SA'], ['+971', 'AE'], ['+974', 'QA'],
  ['+965', 'KW'], ['+20', 'EG'], ['+90', 'TR'], ['+33', 'FR'], ['+44', 'GB'], ['+49', 'DE'], ['+1', 'US/CA']
];

export function fillCountryCodes(select) {
  select.replaceChildren(...COUNTRY_CODES.map(([code, label]) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = `${label} ${code}`;
    return opt;
  }));
}

const TITLES = { in: 'Welcome back', up: 'Create your account', reset: 'Choose a new password', forgot: 'Reset your password' };
const BUTTONS = { in: 'Sign in', up: 'Create account', reset: 'Save new password', forgot: 'Send reset link' };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const Auth = {
  user: null,
  profile: null,
  mode: 'in',
  recovering: /type=recovery/.test(location.hash),
  listeners: [],

  /** fn(user, profile) runs after every sign-in, sign-out and profile change. */
  onChange(fn) { this.listeners.push(fn); },
  emit() { this.listeners.forEach((fn) => fn(this.user, this.profile)); },

  async loadProfile() {
    if (!this.user) { this.profile = null; return; }
    const { data } = await sb.from('profiles').select('*').eq('id', this.user.id).maybeSingle();
    this.profile = data || { full_name: this.user.user_metadata?.full_name || this.user.email, phone: this.user.user_metadata?.phone || '' };
  },

  async init() {
    const dialog = $('#auth-dlg');
    if (dialog) this.wire(dialog);
    const { data } = await sb.auth.getSession();
    this.user = data.session ? data.session.user : null;
    await this.loadProfile();
    this.emit();
    this.afterSignIn();
    // Supabase calls inside this callback must be deferred, or the auth lock deadlocks
    sb.auth.onAuthStateChange((event, session) => setTimeout(async () => {
      if (event === 'PASSWORD_RECOVERY') { this.recovering = true; this.open('reset'); return; }
      const before = this.user && this.user.id;
      this.user = session ? session.user : null;
      if ((this.user && this.user.id) === before && event !== 'USER_UPDATED') return;
      if (/access_token|type=signup/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
      await this.loadProfile();
      this.emit();
      this.afterSignIn();
    }, 0));
    if (this.recovering) this.open('reset');
  },

  afterSignIn() {
    if (!this.user) return;
    pushSubscribe(this.user).then(() => document.dispatchEvent(new CustomEvent('mh:push')));
  },

  open(mode = 'in') {
    const dialog = $('#auth-dlg');
    if (!dialog) return;
    this.set(mode);
    if (!dialog.open) dialog.showModal();
  },

  set(mode) {
    this.mode = mode;
    const form = $('#auth-form');
    const up = mode === 'up', reset = mode === 'reset', forgot = mode === 'forgot';
    $('#auth-title').textContent = TITLES[mode];
    $('#auth-tabs').hidden = reset || forgot;
    $$('#auth-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    $$('.only-up', form).forEach((el) => { el.hidden = !up; });
    $('#a-email-row').hidden = reset;
    $('#a-pass-row').hidden = forgot;
    $('#a-forgot').hidden = mode !== 'in';
    $('#a-pass').autocomplete = mode === 'in' ? 'current-password' : 'new-password';
    $('#a-pass-label').textContent = mode === 'in' ? 'Password' : 'Password (at least 8 characters)';
    $('#auth-go').textContent = BUTTONS[mode];
    setMessage($('#auth-msg'), '');
    $$('.field-err', form).forEach((el) => { el.textContent = ''; });
  },

  wire(dialog) {
    $$('#auth-tabs button').forEach((b) => b.addEventListener('click', () => this.set(b.dataset.mode)));
    $('#a-forgot').addEventListener('click', () => this.set('forgot'));
    $('#auth-close').addEventListener('click', () => dialog.close());
    $('#a-eye').addEventListener('click', (e) => {
      const input = $('#a-pass');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      e.currentTarget.textContent = show ? 'Hide' : 'Show';
    });
    $('#auth-form').addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
  },

  validate(mode, { email, pass, name, number }) {
    const errors = {};
    if (mode !== 'reset' && !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
    if (mode === 'in' && !pass) errors.pass = 'Enter your password.';
    if ((mode === 'up' || mode === 'reset') && pass.length < 8) errors.pass = 'Use at least 8 characters.';
    if (mode === 'up' && name.length < 2) errors.name = 'Enter your full name.';
    if (mode === 'up' && (number.length < 6 || number.length > 12)) errors.phone = 'Enter a valid phone number.';
    for (const key of ['email', 'pass', 'name', 'phone']) setFieldError('e-' + key, errors[key] || '');
    return Object.keys(errors).length === 0;
  },

  async submit() {
    const mode = this.mode;
    const msg = $('#auth-msg');
    const email = $('#a-email').value.trim();
    const pass = $('#a-pass').value;
    const name = $('#a-name').value.trim();
    const number = cleanPhone($('#a-phone').value);
    const phone = $('#a-cc').value + ' ' + number;
    if (!this.validate(mode, { email, pass, name, number })) return;

    const button = $('#auth-go');
    button.disabled = true;
    setMessage(msg, 'Please wait…');
    const redirectTo = location.origin + location.pathname;
    try {
      if (mode === 'up') {
        const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: redirectTo, data: { full_name: name, phone } } });
        if (error) throw error;
        if (data.session) { $('#auth-dlg').close(); toast('Bienvenue!', 'Your account is ready.', 'ok'); }
        else { this.set('in'); setMessage(msg, 'Account created. Check your email to confirm, then sign in.', 'ok'); }
      } else if (mode === 'forgot') {
        await sb.auth.resetPasswordForEmail(email, { redirectTo });
        setMessage(msg, 'If this email has an account, a reset link is on its way.', 'ok');
      } else if (mode === 'reset') {
        const { error } = await sb.auth.updateUser({ password: pass });
        if (error) throw error;
        this.recovering = false;
        history.replaceState(null, '', location.pathname);
        $('#auth-dlg').close();
        toast('Password updated', 'You are signed in.', 'ok');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        $('#auth-dlg').close();
      }
    } catch (e) {
      setMessage(msg, errText(e), 'err');
    } finally {
      button.disabled = false;
    }
  },

  async signOut() {
    await pushUnsubscribe().catch(() => {});
    await sb.auth.signOut();
  }
};
