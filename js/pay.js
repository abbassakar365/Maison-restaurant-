/* Deposit payment page: pay.html?r=<reservation id>  ·  pay.html#bank shows bank details only */
'use strict';

const rid = (() => {
  const q = new URLSearchParams(location.search).get('r');
  try { if (q) sessionStorage.setItem('mh-pay-r', q); return q || (location.hash === '#bank' ? null : sessionStorage.getItem('mh-pay-r')); } catch (_) { return q; }
})();
let resv = null, tick = null;

function copyRow(label, value) {
  const b = h('button', { type: 'button', class: 'link small', onclick: async () => {
    try { await navigator.clipboard.writeText(value.replace(/\s/g, label === 'IBAN' ? '' : ' ')); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); } catch (_) {}
  } }, 'Copy');
  return [h('dt', {}, label), h('dd', {}, h('span', {}, value), b)];
}

function fillStatic() {
  const p = CONFIG.payments, bk = p.bank;
  $('#bank-details').replaceChildren(...copyRow('Bank', bk.bankName), ...copyRow('Account name', bk.accountName), ...copyRow('IBAN', bk.iban), ...copyRow('SWIFT', bk.swift), ...copyRow('Currency', bk.currency));
  $('#whish-no').textContent = p.whish;
  if (p.cardLink) { $('#card-link').hidden = false; $('#card-soon').hidden = true; }
}

function renderDue() {
  const info = $('#pay-info');
  if (!rid) { info.textContent = 'Use these details to pay a reservation deposit. Open “Pay deposit” from your reservation to see the amount and deadline.'; return; }
  if (!Auth.user) { info.replaceChildren('Sign in to see your deposit. ', h('button', { type: 'button', class: 'link', onclick: () => Auth.open('in') }, 'Sign in')); return; }
  if (!resv) { info.textContent = 'We could not find this reservation on your account.'; return; }
  info.hidden = true;
  $('#due-card').hidden = false;
  $('#due-amount').textContent = money(resv.deposit_amount);
  $('#due-what').textContent = `Reservation ${resv.code} · ${resv.guests} guest(s) · ${fmtWhen(resv.reserved_at)} · set menu total ${money(resv.set_menu_total)}`;
  const labels = { due: 'Waiting for payment', review: 'Payment reported — the team is verifying it', paid: 'Deposit paid — thank you!', expired: 'Deadline passed — reservation cancelled', none: 'No deposit needed' };
  $('#due-status').textContent = resv.status === 'cancelled' && resv.deposit_status !== 'expired' ? 'Reservation cancelled' : labels[resv.deposit_status];
  $('#due-status').className = 'pill dep-' + resv.deposit_status;
  $('#paid-form').hidden = !(resv.deposit_status === 'due' && (resv.status === 'pending' || resv.status === 'confirmed'));
  const cl = $('#card-link');
  if (CONFIG.payments.cardLink) {
    const u = new URL(CONFIG.payments.cardLink);
    u.searchParams.set('client_reference_id', resv.code);
    cl.href = u.toString();
  }
  clearInterval(tick);
  const cd = $('#countdown');
  const step = () => {
    if (resv.deposit_status !== 'due' || !resv.deposit_due) { cd.textContent = ''; return; }
    const ms = new Date(resv.deposit_due) - Date.now();
    if (ms <= 0) { cd.textContent = 'The deadline has passed.'; return; }
    const hh = Math.floor(ms / 3600e3), mm = Math.floor(ms % 3600e3 / 60e3), ss = Math.floor(ms % 60e3 / 1e3);
    cd.replaceChildren(h('i', { 'data-icon': 'clock' }), ` Time left to pay: ${hh}h ${String(mm).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s · deadline ${fmtWhen(resv.deposit_due)}`);
    paintIcons(cd);
  };
  step(); tick = setInterval(step, 1000);
}

async function load() {
  resv = null;
  if (rid && Auth.user) {
    const { data } = await sb.from('reservations').select('*').eq('id', rid).maybeSingle();
    resv = data;
  }
  renderDue();
}

document.addEventListener('DOMContentLoaded', async () => {
  fillStatic();
  $('#paid-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#paid-msg');
    const { data, error } = await sb.rpc('report_payment', { p_id: resv.id, p_method: $('#pm').value, p_ref: $('#pref').value.trim() });
    if (error) { msg.className = 'form-msg err'; msg.textContent = errText(error); return; }
    resv = data; renderDue();
    toast('Thank you!', 'The team has been notified and will verify your payment.', 'ok');
  });
  document.addEventListener('mh:notification', load);
  Auth.onChange(user => { if (user) Bell.start(user, { onOpen: () => { location.href = 'index.html#reserve'; } }); else Bell.stop(); load(); });
  await Auth.init();
  if (location.hash === '#bank') setTimeout(() => document.getElementById('bank').scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
});
