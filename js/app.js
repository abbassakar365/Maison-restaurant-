/* Customer app: menu, reviews, reservations, profile, feedback */
'use strict';

const STATUS = { pending: 'Awaiting confirmation', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Completed', no_show: 'No-show' };
const DEPOSIT = { due: 'Deposit due', review: 'Deposit being verified', paid: 'Deposit paid', expired: 'Deposit expired' };
let setMenus = [];

/* ---------- header: active section + contact links ---------- */
function wireNav() {
  const links = $$('.nav a'), nav = $('.nav');
  const secs = ['menu', 'reviews', 'reserve', 'about', 'contact'].map(id => document.getElementById(id));
  let current = null, raf = 0;
  const update = () => {
    raf = 0;
    const line = $('.top').offsetHeight + innerHeight * 0.3;
    let best = null;
    secs.forEach(el => { if (el.getBoundingClientRect().top <= line) best = el.id; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) best = 'contact';
    if (best === current) return;
    current = best;
    links.forEach(a => { const on = a.dataset.sec === best; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current'); });
    const a = links.find(x => x.dataset.sec === best);
    if (a && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2, behavior: 'smooth' });
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  addEventListener('resize', update);
  update();
}
function wireContact() {
  $('#f-phone').href = 'tel:' + CONFIG.phone.replace(/[^+\d]/g, '');
  $('#f-map').href = CONFIG.mapsUrl;
  if (CONFIG.instagram) {
    const a = h('a', { class: 'soc', href: CONFIG.instagram, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Instagram' }, icon('instagram'));
    $('#f-insta').replaceWith(a);
  }
}

/* ---------- menu (edited by the team in the team app) ---------- */
// js/menu.js is the built-in copy, shown only if the live menu can't be loaded
let MENU_DATA = MENU.map(c => ({ ...c, items: c.items.map(([name, price, picture, ingredients, tags]) => ({ name, price, picture, ingredients, tags, photo_url: null })) }));
async function loadMenu() {
  const [{ data: cats, error: e1 }, { data: items, error: e2 }] = await Promise.all([
    sb.from('menu_categories').select('*').eq('active', true).order('sort'),
    sb.from('menu_items').select('*').eq('available', true).order('sort')
  ]);
  if (e1 || e2 || !cats || !cats.length) return;
  MENU_DATA = cats.map(c => ({ ...c, items: (items || []).filter(i => i.category_id === c.id) })).filter(c => c.items.length);
}
let currentCat = null;
function renderMenu(catId) {
  const cat = MENU_DATA.find(c => c.id === catId) || MENU_DATA[0];
  if (!cat) return;
  currentCat = cat.id;
  $$('#cats button').forEach(b => { b.setAttribute('aria-selected', String(b.dataset.cat === cat.id)); b.tabIndex = b.dataset.cat === cat.id ? 0 : -1; });
  $('#cat-note').textContent = (cat.note ? cat.note + ' · ' : '') + cat.items.length + ' items';
  $('#dishes').replaceChildren(...cat.items.map(it => {
    const art = it.photo_url ? h('img', { src: it.photo_url, alt: it.name, loading: 'lazy' }) : h('span', { class: 'emoji', 'aria-hidden': 'true' }, it.picture || '🍽️');
    const ingr = (it.ingredients || '').split(/,\s*/).filter(Boolean);
    const card = h('article', { class: 'dish', tabindex: '0', 'aria-expanded': 'false', style: '--tint:' + cat.tint },
      h('div', { class: 'art' }, art,
        h('div', { class: 'ingr' }, h('h4', {}, 'Ingredients'), ingr.length ? h('ul', {}, ingr.map(x => h('li', {}, x))) : h('p', { class: 'small' }, 'Ask our team for details.'))),
      h('div', { class: 'dish-info' },
        h('h3', {}, it.name),
        h('div', { class: 'dish-meta' },
          h('span', { class: 'tags' }, [...(it.tags || '')].map(t => TAGS[t] ? h('span', { class: 'tag ' + TAGS[t][1] }, TAGS[t][0]) : null)),
          h('b', { class: 'price' }, money(it.price)))));
    const toggle = () => {
      const open = !card.classList.contains('open');
      $$('.dish.open').forEach(d => { if (d !== card) { d.classList.remove('open'); d.setAttribute('aria-expanded', 'false'); } });
      card.classList.toggle('open', open); card.setAttribute('aria-expanded', String(open));
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    return card;
  }));
}
function renderCats() {
  $('#cats').replaceChildren(...MENU_DATA.map(c => h('button', { type: 'button', role: 'tab', dataset: { cat: c.id }, onclick: () => renderMenu(c.id) }, c.name, h('small', {}, c.items.length))));
  renderMenu(currentCat || (MENU_DATA[0] && MENU_DATA[0].id));
}
function wireMenu() {
  const cats = $('#cats');
  cats.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const btns = $$('button', cats), i = btns.indexOf(document.activeElement);
    const next = btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
    next.focus(); next.click();
  });
  renderCats();
  loadMenu().then(renderCats);
}

/* ---------- star pickers ---------- */
function starPicker(fieldset, name) {
  for (let i = 5; i >= 1; i--) {
    const id = name + '-' + i;
    fieldset.append(h('input', { type: 'radio', name, id, value: i, class: 'sr' }), h('label', { for: id, title: i + ' star' + (i > 1 ? 's' : '') }, '★'));
  }
  return () => { const c = $('input:checked', fieldset); return c ? +c.value : 0; };
}

/* ---------- reviews ---------- */
async function loadReviews() {
  const { data, error } = await sb.from('reviews').select('id, author, rating, body, created_at, user_id').order('created_at', { ascending: false }).limit(40);
  const list = $('#review-list');
  if (error) { list.replaceChildren(h('li', { class: 'empty' }, 'Reviews could not be loaded right now.')); return; }
  if (!data.length) { list.replaceChildren(h('li', { class: 'empty' }, 'No reviews yet — be the first!')); $('#avg').textContent = 'Be the first to leave a review.'; return; }
  const avg = data.reduce((s, r) => s + r.rating, 0) / data.length;
  $('#avg').textContent = `${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}  ${avg.toFixed(1)} from ${data.length} review${data.length > 1 ? 's' : ''}`;
  list.replaceChildren(...data.map(r => h('li', { class: 'review card' },
    h('div', { class: 'review-head' }, h('b', {}, r.author || 'Guest'), h('span', { class: 'rstars', 'aria-label': r.rating + ' out of 5' }, '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)), h('time', {}, fmtAgo(r.created_at))),
    h('p', {}, r.body),
    Auth.user && r.user_id === Auth.user.id ? h('button', { type: 'button', class: 'link small', onclick: async () => { await sb.from('reviews').delete().eq('id', r.id); loadReviews(); } }, 'Delete') : null)));
}
function wireReviews() {
  const getRating = starPicker($('#stars'), 'rv');
  const form = $('#review-form'), ta = $('#review-text'), msg = $('#review-msg');
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!Auth.user) { Auth.open('in'); return; }
    const body = ta.value.trim(), rating = getRating();
    msg.className = 'form-msg err';
    if (!rating) { msg.textContent = 'Choose a star rating.'; return; }
    if (body.length < 2) { msg.textContent = 'Write a few words.'; return; }
    msg.className = 'form-msg'; msg.textContent = 'Posting…';
    const { error } = await sb.from('reviews').insert({ rating, body });
    if (error) { msg.className = 'form-msg err'; msg.textContent = errText(error); return; }
    ta.value = ''; $$('#stars input').forEach(i => { i.checked = false; });
    msg.className = 'form-msg ok'; msg.textContent = 'Merci! Your review is posted.';
    loadReviews();
  });
}

/* ---------- reservation form ---------- */
const pad = n => String(n).padStart(2, '0');
function beirutISO(dateStr, timeStr) {
  // turn a Beirut wall-clock date + time into an exact instant
  const [y, m, d] = dateStr.split('-').map(Number), [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(new Date(guess)).find(p => p.type === 'timeZoneName').value;
  const mt = /GMT([+-])(\d{2}):?(\d{2})?/.exec(off);
  const mins = mt ? (mt[1] === '-' ? -1 : 1) * (+mt[2] * 60 + +(mt[3] || 0)) : 0;
  return new Date(guess - mins * 60000).toISOString();
}
function beirutToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); }

// restaurant rules — the database is the source of truth; these are only defaults until it answers
let SETTINGS = { open_time: '12:00', last_booking: '23:00', deposit_threshold: 300, deposit_percent: 25, total_tables: 25, seats_per_table: 4 };
const hhmm = t => String(t).slice(0, 5);
async function loadSettings() {
  const { data } = await sb.from('restaurant_settings').select('*').eq('id', 1).maybeSingle();
  if (data) SETTINGS = data;
  $$('[data-rule="hours"]').forEach(e => { e.textContent = `${hhmm(SETTINGS.open_time)} to ${hhmm(SETTINGS.last_booking)}`; });
  $$('[data-rule="deposit"]').forEach(e => { e.textContent = `over ${money(SETTINGS.deposit_threshold)} need a ${+SETTINGS.deposit_percent}% deposit`; });
  $$('[data-rule="percent"]').forEach(e => { e.textContent = +SETTINGS.deposit_percent + '%'; });
}
function fillTimes(avail) {
  const sel = $('#r-time'), keep = sel.value, [oh, om] = hhmm(SETTINGS.open_time).split(':').map(Number), [lh, lm] = hhmm(SETTINGS.last_booking).split(':').map(Number);
  const need = Math.max(1, Math.ceil((+$('#r-guests').value || 1) / SETTINGS.seats_per_table));
  const opts = [];
  for (let m = oh * 60 + om; m <= lh * 60 + lm; m += 30) {
    const t = pad(Math.floor(m / 60)) + ':' + pad(m % 60), free = avail ? avail[t] : null;
    const full = free != null && free < need;
    opts.push(h('option', { value: t, disabled: full }, t + (full ? ' — fully booked' : free != null && free <= 5 ? ` — ${free} table${free === 1 ? '' : 's'} left` : '')));
  }
  sel.replaceChildren(h('option', { value: '' }, 'Choose a time'), ...opts);
  if (keep && !(avail && avail[keep] != null && avail[keep] < need)) sel.value = keep;
}
// a list of days (today + 89) instead of a calendar, so nobody has to pick a year
function fillDates() {
  const [y, mo, d] = beirutToday().split('-').map(Number);
  const label = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const opts = [h('option', { value: '' }, 'Choose a day')];
  for (let i = 0; i < 90; i++) {
    const day = new Date(Date.UTC(y, mo - 1, d + i));
    const value = day.toISOString().slice(0, 10);
    opts.push(h('option', { value }, (i === 0 ? 'Today · ' : i === 1 ? 'Tomorrow · ' : '') + label.format(day)));
  }
  $('#r-date').replaceChildren(...opts);
}
let availFor = null, avail = null;
async function loadAvailability() {
  const d = $('#r-date').value;
  if (!d) { avail = null; fillTimes(null); return; }
  availFor = d;
  const { data } = await sb.rpc('slot_availability', { p_date: d });
  if (availFor !== d) return;
  avail = data ? Object.fromEntries(data.map(x => [x.slot, x.tables_free])) : null;
  fillTimes(avail);
}

function updateSummary() {
  const m = setMenus.find(x => x.id === $('#r-menu').value);
  const g = Math.max(1, Math.min(30, +$('#r-guests').value || 1));
  $('#summary').hidden = !m;
  $('#menu-courses').textContent = m ? m.courses : '';
  if (!m) return;
  const total = m.price * g, dep = total > +SETTINGS.deposit_threshold ? Math.round(total * SETTINGS.deposit_percent) / 100 : 0;
  $('#sum-total').textContent = `${money(total)}  (${money(m.price)} × ${g})`;
  $('#deposit-line').hidden = !dep; $('#deposit-note').hidden = !dep;
  $('#sum-deposit').textContent = money(dep);
}

async function wireReserve() {
  await loadSettings();
  fillTimes(null);
  $('#r-date').addEventListener('change', loadAvailability);
  $('#r-guests').addEventListener('input', () => fillTimes(avail));
  fillDates();
  $('#g-minus').addEventListener('click', () => { $('#r-guests').value = Math.max(1, (+$('#r-guests').value || 1) - 1); updateSummary(); fillTimes(avail); });
  $('#g-plus').addEventListener('click', () => { $('#r-guests').value = Math.min(30, (+$('#r-guests').value || 1) + 1); updateSummary(); fillTimes(avail); });
  ['#r-guests', '#r-menu'].forEach(s => $(s).addEventListener('input', updateSummary));

  const { data } = await sb.from('set_menus').select('*').order('sort');
  setMenus = data || [];
  $('#r-menu').append(...setMenus.map(m => h('option', { value: m.id }, `${m.name} — ${money(m.price)} / person`)));

  $('#res-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#res-msg');
    const name = $('#r-name').value.trim(), num = $('#r-phone').value.replace(/\D/g, '').replace(/^0+/, '');
    const guests = +$('#r-guests').value, date = $('#r-date').value, time = $('#r-time').value;
    const errs = {};
    if (name.length < 2) errs.name = 'Enter your full name.';
    if (num.length < 6 || num.length > 12) errs.phone = 'Enter a valid phone number.';
    if (!(guests >= 1 && guests <= 30)) errs.guests = 'Between 1 and 30 guests.';
    if (!date) errs.date = 'Choose a day.';
    if (!time) errs.time = 'Choose a time.';
    if (date && time && new Date(beirutISO(date, time)) < Date.now() + 3600e3) errs.time = 'Choose a time at least one hour from now.';
    ['name', 'phone', 'guests', 'date', 'time'].forEach(k => { $('#re-' + k).textContent = errs[k] || ''; });
    if (Object.keys(errs).length) { msg.className = 'form-msg err'; msg.textContent = 'Please check the highlighted fields.'; return; }
    if (!Auth.user) { msg.className = 'form-msg'; msg.textContent = 'Sign in or create an account to confirm — your details stay filled in.'; Auth.open('in'); return; }

    const go = $('#res-go'); go.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Sending your reservation…';
    const { data: r, error } = await sb.rpc('create_reservation', {
      p_full_name: name, p_phone: $('#r-cc').value + ' ' + num, p_guests: guests,
      p_at: beirutISO(date, time), p_set_menu: $('#r-menu').value || null, p_notes: $('#r-notes').value.trim() || null
    });
    go.disabled = false;
    loadAvailability();
    if (error) { msg.className = 'form-msg err'; msg.textContent = errText(error); return; }
    if (r.status === 'cancelled') {
      // fully booked: offer the best free times as one-tap choices
      msg.className = 'form-msg err';
      msg.replaceChildren(`Sorry, we are fully booked at ${time}. Choose one of the best free times:`);
      const { data: times } = await sb.rpc('suggest_times', { p_at: beirutISO(date, time), p_guests: guests, p_count: 3 });
      const box = h('div', { class: 'suggest' }, ...(times || []).map(t => {
        const d = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(t));
        const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
        return h('button', { type: 'button', class: 'btn small ghost-dark', onclick: async () => {
          $('#r-date').value = d; await loadAvailability(); $('#r-time').value = hm;
          msg.className = 'form-msg'; msg.textContent = `Selected ${fmtWhen(t)}. Press Confirm reservation to book it.`;
          $('#res-go').focus();
        } }, fmtWhen(t));
      }));
      msg.append(times && times.length ? box : h('div', {}, 'No free tables nearby. Please call us.'));
      loadMine();
      return;
    }
    msg.className = 'form-msg ok';
    msg.replaceChildren(r.status === 'confirmed' ? 'Your table is confirmed! Your code is ' : 'Reservation sent! Your code is ', h('b', {}, r.code),
      r.status === 'confirmed' ? '. See you soon.' : r.deposit_status === 'due' ? '. It is confirmed automatically once your deposit is paid.' : '. The team will confirm it shortly.',
      r.deposit_status === 'due' ? h('a', { class: 'btn gold small', href: 'pay.html?r=' + r.id }, `Pay ${money(r.deposit_amount)} deposit`) : null);
    $('#r-notes').value = '';
    loadMine();
  });
}

/* ---------- my reservations ---------- */
let mine = [], feedbackDone = new Set();
async function loadMine() {
  if (!Auth.user) { mine = []; renderMine(); return; }
  const [{ data }, { data: fb }] = await Promise.all([
    sb.from('reservations').select('*, set_menus(name)').eq('user_id', Auth.user.id).order('reserved_at', { ascending: false }).limit(30),
    sb.from('feedback').select('reservation_id').eq('user_id', Auth.user.id)
  ]);
  mine = data || []; feedbackDone = new Set((fb || []).map(f => f.reservation_id));
  renderMine();
}
function resRow(r) {
  const live = r.status === 'pending' || r.status === 'confirmed';
  return h('li', { class: 'res s-' + r.status },
    h('div', { class: 'res-top' }, h('b', { class: 'code' }, r.code), h('span', { class: 'pill p-' + r.status }, STATUS[r.status])),
    h('p', {}, fmtWhen(r.reserved_at), ' · ', r.guests + (r.guests > 1 ? ' guests' : ' guest'), r.set_menus ? ' · ' + r.set_menus.name : ''),
    r.deposit_status !== 'none' ? h('p', { class: 'small dep d-' + r.deposit_status }, DEPOSIT[r.deposit_status] + ' · ' + money(r.deposit_amount),
      r.deposit_status === 'due' && r.deposit_due ? ' · before ' + fmtWhen(r.deposit_due) : '') : null,
    r.status === 'cancelled' ? h('p', { class: 'small muted' }, r.cancelled_by === 'system' ? 'Cancelled automatically — deposit not paid' : 'Cancelled by ' + (r.cancelled_by === 'team' ? 'the restaurant' : 'you'), r.cancel_reason ? ' · ' + r.cancel_reason : '') : null,
    h('div', { class: 'res-actions' },
      live && r.deposit_status === 'due' ? h('a', { class: 'btn gold small', href: 'pay.html?r=' + r.id }, 'Pay deposit') : null,
      live ? h('button', { type: 'button', class: 'btn ghost-dark small', onclick: () => askCancel(r) }, 'Cancel') : null,
      r.status === 'completed' && !feedbackDone.has(r.id) ? h('button', { type: 'button', class: 'btn small', onclick: () => openFeedback(r.id) }, 'Give feedback') : null));
}
function renderMine() {
  const signedIn = !!Auth.user;
  $('#mine-signed-out').hidden = signedIn; $('#mine-signin').hidden = signedIn;
  const rows = mine.map(resRow);
  $('#mine-list').replaceChildren(...(signedIn && !rows.length ? [h('li', { class: 'empty' }, 'No reservations yet.')] : rows));
  $('#acct-list').replaceChildren(...(mine.length ? mine.map(resRow) : [h('li', { class: 'empty' }, 'Your reservation codes will appear here.')]));
}

let cancelling = null;
function askCancel(r) {
  cancelling = r;
  $('#cancel-what').textContent = `${r.code} · ${fmtWhen(r.reserved_at)} · ${r.guests} guest(s). The team will be notified.`;
  $('#cancel-reason').value = ''; $('#cancel-msg').textContent = '';
  $('#cancel-dlg').showModal();
}
function wireCancel() {
  $('#cancel-form').addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await sb.rpc('cancel_reservation', { p_id: cancelling.id, p_reason: $('#cancel-reason').value.trim() || null });
    if (error) { $('#cancel-msg').className = 'form-msg err'; $('#cancel-msg').textContent = errText(error); return; }
    $('#cancel-dlg').close();
    loadMine();
  });
}

/* ---------- feedback ---------- */
let fbFor = null, fbRating;
function openFeedback(id) {
  if (!Auth.user) { Auth.open('in'); return; }
  fbFor = id;
  const r = mine.find(x => x.id === id);
  $('#fb-what').textContent = r ? `${r.code} · ${fmtWhen(r.reserved_at)}` : '';
  $('#fb-msg').textContent = '';
  $('#fb-dlg').showModal();
}
function wireFeedback() {
  fbRating = starPicker($('#fb-stars'), 'fb');
  $('#fb-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#fb-msg');
    if (!fbRating()) { msg.className = 'form-msg err'; msg.textContent = 'Choose an overall rating.'; return; }
    const v = id => $('#' + id).value.trim() || null;
    const { error } = await sb.rpc('submit_feedback', { p_id: fbFor, p_rating: fbRating(), p_loved: v('fb-loved'), p_service: v('fb-service'), p_food: v('fb-food'), p_place: v('fb-place'), p_other: v('fb-other') });
    if (error) { msg.className = 'form-msg err'; msg.textContent = errText(error); return; }
    $('#fb-form').reset();
    $('#fb-dlg').close();
    toast('Merci beaucoup!', 'Your feedback goes straight to the team.', 'ok');
    loadMine();
  });
}

/* ---------- account ---------- */
function renderAccount() {
  const u = Auth.user, p = Auth.profile;
  $('#account-label').textContent = u ? (p && p.full_name ? p.full_name.split(' ')[0] : 'Profile') : 'Sign in';
  $('#account').setAttribute('aria-label', u ? 'My profile' : 'Sign in');
  if (u && p) {
    $('#profile').replaceChildren(h('dt', {}, 'Name'), h('dd', {}, p.full_name), h('dt', {}, 'Phone'), h('dd', {}, p.phone || '—'), h('dt', {}, 'Email'), h('dd', {}, u.email));
    if (!$('#r-name').value) $('#r-name').value = p.full_name || '';
    if (!$('#r-phone').value && p.phone) {
      const m = /^(\+\d{1,4})\s*(.*)$/.exec(p.phone);
      if (m && COUNTRY_CODES.some(c => c[0] === m[1])) { $('#r-cc').value = m[1]; $('#r-phone').value = m[2]; }
      else $('#r-phone').value = p.phone;
    }
  }
}

function onNotificationOpen(n) {
  $('#notif-panel').hidden = true;
  if (n.kind === 'feedback' && n.reservation_id) openFeedback(n.reservation_id);
  else if ((n.kind === 'deposit_due' || n.kind === 'deposit_warning') && n.reservation_id) {
    try { sessionStorage.setItem('mh-pay-r', n.reservation_id); } catch (_) {}
    location.href = 'pay.html?r=' + n.reservation_id;
  }
  else document.getElementById('reserve').scrollIntoView({ behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', async () => {
  wireNav(); wireContact(); wireMenu(); wireReviews(); wireCancel(); wireFeedback();
  $('#account').addEventListener('click', () => Auth.user ? $('#acct-dlg').showModal() : Auth.open('in'));
  $('#mine-signin').addEventListener('click', () => Auth.open('in'));
  $('#sign-out').addEventListener('click', async () => { $('#acct-dlg').close(); await Auth.signOut(); });
  $$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
  document.addEventListener('mh:notification', () => loadMine());

  Auth.onChange(async user => {
    renderAccount();
    if (user) Bell.start(user, { onOpen: onNotificationOpen }); else Bell.stop();
    await loadMine();
    loadReviews();
    const fb = new URLSearchParams(location.search).get('feedback');
    if (fb && user) openFeedback(fb);
  });
  await wireReserve();
  await Auth.init();
});
