/* The notification bell: loads the signed-in user's (or the team's) notifications,
   listens for new ones in realtime and renders the dropdown panel. */
import { $, h } from './dom.js';
import { sb } from './supabase.js';
import { fmtAgo } from './format.js';
import { toast, chime } from './notify.js';
import { systemAlert, alertsAllowed, isPushOn, isIOS, enableAlerts } from './push.js';
import { Auth } from './auth.js';

const ERROR_KINDS = new Set(['cancelled', 'no_show']);
const WARN_KINDS = new Set(['deposit_due', 'deposit_warning', 'suggestion', 'call']);
const toastKind = (kind) => (ERROR_KINDS.has(kind) ? 'error' : WARN_KINDS.has(kind) ? 'warn' : 'ok');

export const Bell = {
  items: [],
  channel: null,
  staff: false,
  onOpen: null,

  /** Load notifications for `user` (or for the whole team when staff is true) and subscribe to new ones. */
  async start(user, { staff = false, onOpen } = {}) {
    this.stop();
    const wrap = $('.bell-wrap');
    if (wrap) wrap.hidden = false;
    this.staff = staff;
    this.onOpen = onOpen || null;
    let query = sb.from('notifications').select('*, reservations(code, status, cancelled_by)').order('created_at', { ascending: false }).limit(60);
    query = staff ? query.eq('for_staff', true) : query.eq('user_id', user.id);
    const { data } = await query;
    this.items = data || [];
    this.render();
    const filter = staff ? 'for_staff=eq.true' : 'user_id=eq.' + user.id;
    this.channel = sb.channel('notif-' + (staff ? 'team' : user.id))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter }, ({ new: n }) => this.receive(n))
      .subscribe();
  },

  async receive(n) {
    if (n.reservation_id) {
      const { data } = await sb.from('reservations').select('code, status, cancelled_by').eq('id', n.reservation_id).maybeSingle();
      n.reservations = data;
    }
    this.items.unshift(n);
    this.render();
    chime();
    toast(n.title, n.body, toastKind(n.kind), () => this.open(n));
    systemAlert(n.title, n.body, 'mh-' + n.id);
    document.dispatchEvent(new CustomEvent('mh:notification', { detail: n }));
  },

  /** Unsubscribe and hide the bell (signed out, or not on the team). */
  stop() {
    if (this.channel) sb.removeChannel(this.channel);
    this.channel = null;
    this.items = [];
    closeBellPanel();
    const wrap = $('.bell-wrap');
    if (wrap) wrap.hidden = true;
    this.render();
  },

  unread() { return this.items.filter((n) => !n.read_at).length; },

  render() {
    const unread = this.unread();
    const badge = $('#badge');
    if (badge) { badge.hidden = !unread; badge.textContent = unread > 99 ? '99+' : unread; }
    const bell = $('#bell');
    if (bell) bell.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
    const list = $('#notif-list');
    if (list) list.replaceChildren(...(this.items.length ? this.items.map((n) => this.row(n)) : [h('li', { class: 'empty' }, 'No notifications yet.')]));
    const alertsBtn = $('#alerts-btn');
    if (alertsBtn) alertsBtn.hidden = (alertsAllowed() && isPushOn()) || !('Notification' in window || isIOS);
    document.dispatchEvent(new CustomEvent('mh:bell-render'));
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
    if (!n.read_at) {
      n.read_at = new Date().toISOString();
      this.render();
      await sb.rpc('mark_read', { p_ids: [n.id] });
    }
    if (this.onOpen) this.onOpen(n);
  },

  async readAll() {
    const ids = this.items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    this.items.forEach((n) => { n.read_at = n.read_at || now; });
    this.render();
    await sb.rpc('mark_read', { p_ids: ids });
  }
};

/** Hook up the bell button, its panel and the "turn on alerts" button. */
export function wireBell() {
  const bell = $('#bell');
  const panel = $('#notif-panel');
  if (!bell || !panel) return;
  const close = () => { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); };
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!Auth.user) { Auth.open('in'); return; }
    panel.hidden = !panel.hidden;
    bell.setAttribute('aria-expanded', String(!panel.hidden));
  });
  document.addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  $('#read-all').addEventListener('click', () => Bell.readAll());
  $('#alerts-btn').addEventListener('click', async () => { await enableAlerts(Auth.user); Bell.render(); });
  document.addEventListener('mh:push', () => Bell.render());
}

export const closeBellPanel = () => { const panel = $('#notif-panel'); if (panel) panel.hidden = true; };
