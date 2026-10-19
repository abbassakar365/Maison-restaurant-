/* Deposit payment page: pay.html?r=<reservation id>  ·  pay.html#bank shows the bank details only. */
import { $, h, paintIcons, setMessage } from '../lib/dom.js';
import { CONFIG } from '../config.js';
import { sb } from '../lib/supabase.js';
import { fmtWhen, money, errText, plural, pad2 } from '../lib/format.js';
import { toast } from '../lib/notify.js';
import { Auth } from '../lib/auth.js';
import { Bell } from '../lib/bell.js';
import { bootShell } from '../lib/shell.js';

const STATUS_LABELS = {
  due: 'Waiting for payment',
  review: 'Payment reported — the team is verifying it',
  paid: 'Deposit paid — thank you!',
  expired: 'Deadline passed — reservation cancelled',
  none: 'No deposit needed'
};

/** The reservation id: from the URL, or remembered from the link the guest tapped on the site. */
const reservationId = (() => {
  const fromQuery = new URLSearchParams(location.search).get('r');
  try {
    if (fromQuery) sessionStorage.setItem('mh-pay-r', fromQuery);
    return fromQuery || (location.hash === '#bank' ? null : sessionStorage.getItem('mh-pay-r'));
  } catch {
    return fromQuery;
  }
})();

let reservation = null;
let countdownTimer = null;

function copyRow(label, value) {
  const button = h('button', { type: 'button', class: 'link small', onclick: async () => {
    try {
      await navigator.clipboard.writeText(value.replace(/\s/g, label === 'IBAN' ? '' : ' '));
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy'; }, 1500);
    } catch { /* clipboard blocked */ }
  } }, 'Copy');
  return [h('dt', {}, label), h('dd', {}, h('span', {}, value), button)];
}

function fillStatic() {
  const { bank, whish, cardLink } = CONFIG.payments;
  $('#bank-details').replaceChildren(
    ...copyRow('Bank', bank.bankName), ...copyRow('Account name', bank.accountName), ...copyRow('IBAN', bank.iban),
    ...copyRow('SWIFT', bank.swift), ...copyRow('Currency', bank.currency));
  $('#whish-no').textContent = whish;
  if (cardLink) { $('#card-link').hidden = false; $('#card-soon').hidden = true; }
}

function startCountdown() {
  clearInterval(countdownTimer);
  const el = $('#countdown');
  const tick = () => {
    if (!reservation || reservation.deposit_status !== 'due' || !reservation.deposit_due) { el.textContent = ''; return; }
    const ms = new Date(reservation.deposit_due) - Date.now();
    if (ms <= 0) { el.textContent = 'The deadline has passed.'; return; }
    const hh = Math.floor(ms / 3600e3), mm = Math.floor((ms % 3600e3) / 60e3), ss = Math.floor((ms % 60e3) / 1e3);
    el.replaceChildren(h('i', { 'data-icon': 'clock' }), ` Time left to pay: ${hh}h ${pad2(mm)}m ${pad2(ss)}s · deadline ${fmtWhen(reservation.deposit_due)}`);
    paintIcons(el);
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function render() {
  const info = $('#pay-info');
  if (!reservationId) { info.hidden = false; info.textContent = 'Use these details to pay a reservation deposit. Open “Pay deposit” from your reservation to see the amount and deadline.'; return; }
  if (!Auth.user) { info.hidden = false; info.replaceChildren('Sign in to see your deposit. ', h('button', { type: 'button', class: 'link', onclick: () => Auth.open('in') }, 'Sign in')); return; }
  if (!reservation) { info.hidden = false; info.textContent = 'We could not find this reservation on your account.'; return; }
  info.hidden = true;
  const r = reservation;
  $('#due-card').hidden = false;
  $('#due-amount').textContent = money(r.deposit_amount);
  $('#due-what').textContent = `Reservation ${r.code} · ${plural(r.guests, 'guest')} · ${fmtWhen(r.reserved_at)} · set menu total ${money(r.set_menu_total)}`;
  const status = $('#due-status');
  status.textContent = r.status === 'cancelled' && r.deposit_status !== 'expired' ? 'Reservation cancelled' : STATUS_LABELS[r.deposit_status];
  status.className = 'pill dep-' + r.deposit_status;
  $('#paid-form').hidden = !(r.deposit_status === 'due' && (r.status === 'pending' || r.status === 'confirmed'));
  if (CONFIG.payments.cardLink) {
    const url = new URL(CONFIG.payments.cardLink);
    url.searchParams.set('client_reference_id', r.code);
    $('#card-link').href = url.toString();
  }
  startCountdown();
}

async function load() {
  reservation = null;
  if (reservationId && Auth.user) {
    const { data } = await sb.from('reservations').select('*').eq('id', reservationId).maybeSingle();
    reservation = data;
  }
  render();
}

async function main() {
  bootShell();
  fillStatic();
  $('#paid-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#paid-msg');
    const { data, error } = await sb.rpc('report_payment', { p_id: reservation.id, p_method: $('#pm').value, p_ref: $('#pref').value.trim() });
    if (error) { setMessage(msg, errText(error), 'err'); return; }
    reservation = data;
    render();
    toast('Thank you!', 'The team has been notified and will verify your payment.', 'ok');
  });
  document.addEventListener('mh:notification', load);
  Auth.onChange((user) => {
    if (user) Bell.start(user, { onOpen: () => { location.href = 'index.html#reserve'; } }); else Bell.stop();
    load();
  });
  await Auth.init();
  if (location.hash === '#bank') setTimeout(() => document.getElementById('bank').scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}

main();
