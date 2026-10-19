/* Customer site (index.html): header, menu, reviews, reservations, profile and feedback. */
import { $, $$, h, icon, setFieldError, setMessage } from '../lib/dom.js';
import { CONFIG } from '../config.js';
import { sb, assetUrl } from '../lib/supabase.js';
import { fmtWhen, fmtAgo, money, errText, beirutISO, beirutDay, beirutTime, hhmm, pad2, plural, cleanPhone, telHref } from '../lib/format.js';
import { toast } from '../lib/notify.js';
import { Auth, COUNTRY_CODES } from '../lib/auth.js';
import { Bell, closeBellPanel } from '../lib/bell.js';
import { bootShell } from '../lib/shell.js';
import { TAGS, tagList, builtInMenu, PHOTO_BY_NAME, DESCRIPTION_BY_NAME } from '../menu-data.js';

const STATUS = { pending: 'Awaiting confirmation', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Completed', no_show: 'No-show' };
const DEPOSIT = { due: 'Deposit due', review: 'Deposit being verified', paid: 'Deposit paid', expired: 'Deposit expired' };
const MAX_GUESTS = 30;
const DAYS_AHEAD = 90;
const SLOT_MINUTES = 30;
const MIN_NOTICE_MS = 3600e3;

/* ---------- header: active section & contact links ---------- */
function wireNav() {
  const links = $$('.nav a');
  const nav = $('.nav');
  const sections = ['menu', 'reviews', 'reserve', 'about', 'contact'].map((id) => document.getElementById(id));
  let current = null;
  let frame = 0;
  const update = () => {
    frame = 0;
    const line = $('.top').offsetHeight + innerHeight * 0.3;
    let best = null;
    sections.forEach((el) => { if (el && el.getBoundingClientRect().top <= line) best = el.id; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) best = 'contact';
    if (best === current) return;
    current = best;
    links.forEach((a) => {
      const on = a.dataset.sec === best;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    const active = links.find((a) => a.dataset.sec === best);
    if (active && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' });
  };
  addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(update); }, { passive: true });
  addEventListener('resize', update);
  update();
}

function wireContact() {
  $$('[data-tel]').forEach((a) => { a.href = telHref(CONFIG.phone); });
  $$('[data-map]').forEach((a) => { a.href = CONFIG.mapsUrl; });
  if (CONFIG.whatsapp) $$('[data-whatsapp]').forEach((a) => { a.href = 'https://wa.me/' + CONFIG.whatsapp; });
  const insta = $('#f-insta');
  if (CONFIG.instagram && insta) {
    insta.replaceWith(h('a', { class: 'soc', href: CONFIG.instagram, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Instagram' }, icon('instagram')));
  }
}

/* ---------- menu ---------- */
let menu = builtInMenu();
let currentCat = null;

async function loadMenu() {
  const [{ data: cats, error: e1 }, { data: items, error: e2 }] = await Promise.all([
    sb.from('menu_categories').select('*').eq('active', true).order('sort'),
    sb.from('menu_items').select('*').eq('available', true).order('sort')
  ]);
  if (e1 || e2 || !cats || !cats.length) return;
  menu = cats.map((c) => ({ ...c, items: (items || []).filter((i) => i.category_id === c.id) })).filter((c) => c.items.length);
}

const photoFor = (item) => item.photo_url || PHOTO_BY_NAME.get(String(item.name).toLowerCase()) || null;
const descriptionFor = (item) => String(item.description || '').trim() || DESCRIPTION_BY_NAME.get(String(item.name).toLowerCase()) || '';

/** The dish photo (or the emoji placeholder when there is none / it fails to load). */
function artFor(item, tint, eager = false) {
  const photo = photoFor(item);
  const emoji = () => h('span', { class: 'emoji', 'aria-hidden': 'true' }, item.picture || '🍽️');
  if (!photo) return h('div', { class: 'art placeholder', style: '--tint:' + tint }, emoji());
  return h('div', { class: 'art' }, h('img', { src: assetUrl(photo), alt: '', loading: eager ? 'eager' : 'lazy', decoding: 'async', width: 800, height: 600,
    onerror: (e) => { e.currentTarget.parentElement.classList.add('placeholder'); e.currentTarget.replaceWith(emoji()); } }));
}

const tagBadge = (t) => h('span', { class: 'tag ' + TAGS[t].cls, title: TAGS[t].label, role: 'img', 'aria-label': TAGS[t].label }, icon(TAGS[t].icon));

function dishCard(item, cat) {
  return h('article', { class: 'dish', onclick: () => openDish(item, cat) },
    artFor(item, cat.tint),
    h('div', { class: 'dish-info' },
      h('h3', {}, item.name),
      h('div', { class: 'dish-meta' },
        h('span', { class: 'tags' }, tagList(item.tags).map(tagBadge)),
        h('b', { class: 'price' }, money(item.price))),
      h('button', { type: 'button', class: 'more', 'aria-haspopup': 'dialog', 'aria-label': 'Details: ' + item.name }, 'View details', icon('plus'))));
}

/** The dish details dialog: photo, description, labels and ingredients. */
function openDish(item, cat) {
  const dlg = $('#dish-dlg');
  $('#dd-photo').replaceChildren(artFor(item, cat.tint, true));
  $('#dd-cat').textContent = cat.name;
  $('#dd-name').textContent = item.name;
  $('#dd-price').textContent = money(item.price);
  const description = descriptionFor(item);
  $('#dd-desc').textContent = description;
  $('#dd-desc').hidden = !description;
  const tags = tagList(item.tags);
  $('#dd-tags').replaceChildren(...tags.map((t) => h('li', { class: 'tag ' + TAGS[t].cls }, icon(TAGS[t].icon), TAGS[t].label)));
  $('#dd-tags').hidden = !tags.length;
  const ingredients = String(item.ingredients || '').split(/,\s*/).filter(Boolean);
  $('#dd-ingr').replaceChildren(...(ingredients.length ? ingredients : ['Ask our team for details.']).map((x) => h('li', {}, x)));
  dlg.showModal();
  dlg.scrollTop = 0;
}

function renderMenu(catId) {
  const cat = menu.find((c) => c.id === catId) || menu[0];
  if (!cat) return;
  currentCat = cat.id;
  $$('#cats button').forEach((b) => {
    const on = b.dataset.cat === cat.id;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  $('#cat-note').textContent = (cat.note ? cat.note + ' · ' : '') + plural(cat.items.length, 'item');
  $('#dishes').replaceChildren(...cat.items.map((item) => dishCard(item, cat)));
}

function renderCategories() {
  $('#cats').replaceChildren(...menu.map((c) => h('button', { type: 'button', role: 'tab', dataset: { cat: c.id }, onclick: () => renderMenu(c.id) }, c.name, h('small', {}, c.items.length))));
  renderMenu(currentCat || (menu[0] && menu[0].id));
}

function wireMenu() {
  const cats = $('#cats');
  cats.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const buttons = $$('button', cats);
    const i = buttons.indexOf(document.activeElement);
    const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
    next.focus();
    next.click();
  });
  renderCategories();
  loadMenu().then(renderCategories);
}

/* ---------- star pickers ---------- */
function starPicker(fieldset, name) {
  for (let i = 5; i >= 1; i--) {
    const id = `${name}-${i}`;
    fieldset.append(h('input', { type: 'radio', name, id, value: i, class: 'sr' }), h('label', { for: id, title: plural(i, 'star') }, '★'));
  }
  return () => { const checked = $('input:checked', fieldset); return checked ? +checked.value : 0; };
}

/* ---------- reviews ---------- */
async function loadReviews() {
  const list = $('#review-list');
  const { data, error } = await sb.from('reviews').select('id, author, rating, body, created_at, user_id').order('created_at', { ascending: false }).limit(40);
  if (error) { list.replaceChildren(h('li', { class: 'empty' }, 'Reviews could not be loaded right now.')); return; }
  if (!data.length) {
    list.replaceChildren(h('li', { class: 'empty' }, 'No reviews yet — be the first!'));
    $('#avg').textContent = 'Be the first to leave a review.';
    return;
  }
  const avg = data.reduce((s, r) => s + r.rating, 0) / data.length;
  const rounded = Math.round(avg);
  $('#avg').textContent = `${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)}  ${avg.toFixed(1)} from ${plural(data.length, 'review')}`;
  list.replaceChildren(...data.map((r) => h('li', { class: 'review card' },
    h('div', { class: 'review-head' },
      h('b', {}, r.author || 'Guest'),
      h('span', { class: 'rstars', 'aria-label': r.rating + ' out of 5' }, '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)),
      h('time', {}, fmtAgo(r.created_at))),
    h('p', {}, r.body),
    Auth.user && r.user_id === Auth.user.id
      ? h('button', { type: 'button', class: 'link small', onclick: async () => { await sb.from('reviews').delete().eq('id', r.id); loadReviews(); } }, 'Delete')
      : null)));
}

function wireReviews() {
  const getRating = starPicker($('#stars'), 'rv');
  const form = $('#review-form');
  const textarea = $('#review-text');
  const msg = $('#review-msg');
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!Auth.user) { Auth.open('in'); return; }
    const body = textarea.value.trim();
    const rating = getRating();
    if (!rating) { setMessage(msg, 'Choose a star rating.', 'err'); return; }
    if (body.length < 2) { setMessage(msg, 'Write a few words.', 'err'); return; }
    setMessage(msg, 'Posting…');
    const { error } = await sb.from('reviews').insert({ rating, body });
    if (error) { setMessage(msg, errText(error), 'err'); return; }
    textarea.value = '';
    $$('#stars input').forEach((i) => { i.checked = false; });
    setMessage(msg, 'Merci! Your review is posted.', 'ok');
    loadReviews();
  });
}

/* ---------- reservation form ---------- */
// restaurant rules — the database is the source of truth; these are only defaults until it answers
let settings = { open_time: '12:00', last_booking: '23:00', deposit_threshold: 300, deposit_percent: 25, total_tables: 25, seats_per_table: 4 };
let setMenus = [];
let availability = null;
let availabilityFor = null;

async function loadSettings() {
  const { data } = await sb.from('restaurant_settings').select('*').eq('id', 1).maybeSingle();
  if (data) settings = data;
  $$('[data-rule="hours"]').forEach((el) => { el.textContent = `${hhmm(settings.open_time)} to ${hhmm(settings.last_booking)}`; });
  $$('[data-rule="deposit"]').forEach((el) => { el.textContent = `over ${money(settings.deposit_threshold)} need a ${+settings.deposit_percent}% deposit`; });
  $$('[data-rule="percent"]').forEach((el) => { el.textContent = +settings.deposit_percent + '%'; });
}

const guestCount = () => Math.max(1, Math.min(MAX_GUESTS, +$('#r-guests').value || 1));

function fillTimes() {
  const select = $('#r-time');
  const keep = select.value;
  const [oh, om] = hhmm(settings.open_time).split(':').map(Number);
  const [lh, lm] = hhmm(settings.last_booking).split(':').map(Number);
  const tablesNeeded = Math.max(1, Math.ceil(guestCount() / settings.seats_per_table));
  const options = [];
  for (let m = oh * 60 + om; m <= lh * 60 + lm; m += SLOT_MINUTES) {
    const t = pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
    const free = availability ? availability[t] : null;
    const full = free != null && free < tablesNeeded;
    const note = full ? ' — fully booked' : free != null && free <= 5 ? ` — ${plural(free, 'table')} left` : '';
    options.push(h('option', { value: t, disabled: full }, t + note));
  }
  select.replaceChildren(h('option', { value: '' }, 'Choose a time'), ...options);
  if (keep && !(availability && availability[keep] != null && availability[keep] < tablesNeeded)) select.value = keep;
}

// a list of days (today + 89) instead of a calendar, so nobody has to pick a year
function fillDates() {
  const [y, mo, d] = beirutDay().split('-').map(Number);
  const label = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const options = [h('option', { value: '' }, 'Choose a day')];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const day = new Date(Date.UTC(y, mo - 1, d + i));
    const prefix = i === 0 ? 'Today · ' : i === 1 ? 'Tomorrow · ' : '';
    options.push(h('option', { value: day.toISOString().slice(0, 10) }, prefix + label.format(day)));
  }
  $('#r-date').replaceChildren(...options);
}

async function loadAvailability() {
  const day = $('#r-date').value;
  if (!day) { availability = null; fillTimes(); return; }
  availabilityFor = day;
  const { data } = await sb.rpc('slot_availability', { p_date: day });
  if (availabilityFor !== day) return;
  availability = data ? Object.fromEntries(data.map((x) => [x.slot, x.tables_free])) : null;
  fillTimes();
}

function updateSummary() {
  const chosen = setMenus.find((m) => m.id === $('#r-menu').value);
  const guests = guestCount();
  $('#summary').hidden = !chosen;
  $('#menu-courses').textContent = chosen ? chosen.courses : '';
  if (!chosen) return;
  const total = chosen.price * guests;
  const deposit = total > +settings.deposit_threshold ? Math.round(total * settings.deposit_percent) / 100 : 0;
  $('#sum-total').textContent = `${money(total)}  (${money(chosen.price)} × ${guests})`;
  $('#deposit-line').hidden = !deposit;
  $('#deposit-note').hidden = !deposit;
  $('#sum-deposit').textContent = money(deposit);
}

function stepGuests(delta) {
  $('#r-guests').value = Math.max(1, Math.min(MAX_GUESTS, guestCount() + delta));
  updateSummary();
  fillTimes();
}

function validateReservation({ name, number, guests, date, time }) {
  const errors = {};
  if (name.length < 2) errors.name = 'Enter your full name.';
  if (number.length < 6 || number.length > 12) errors.phone = 'Enter a valid phone number.';
  if (!(guests >= 1 && guests <= MAX_GUESTS)) errors.guests = `Between 1 and ${MAX_GUESTS} guests.`;
  if (!date) errors.date = 'Choose a day.';
  if (!time) errors.time = 'Choose a time.';
  if (date && time && new Date(beirutISO(date, time)) < Date.now() + MIN_NOTICE_MS) errors.time = 'Choose a time at least one hour from now.';
  for (const key of ['name', 'phone', 'guests', 'date', 'time']) setFieldError('re-' + key, errors[key] || '');
  return Object.keys(errors).length === 0;
}

async function offerAlternatives(msg, { date, time, guests }) {
  setMessage(msg, '', 'err');
  msg.replaceChildren(`Sorry, we are fully booked at ${time}. Choose one of the best free times:`);
  const { data: times } = await sb.rpc('suggest_times', { p_at: beirutISO(date, time), p_guests: guests, p_count: 3 });
  if (!times || !times.length) { msg.append(h('div', {}, 'No free tables nearby. Please call us.')); return; }
  msg.append(h('div', { class: 'suggest' }, ...times.map((t) => h('button', { type: 'button', class: 'btn small outline', onclick: async () => {
    $('#r-date').value = beirutDay(t);
    await loadAvailability();
    $('#r-time').value = beirutTime(t);
    setMessage(msg, `Selected ${fmtWhen(t)}. Press Confirm reservation to book it.`);
    $('#res-go').focus();
  } }, fmtWhen(t)))));
}

async function submitReservation(e) {
  e.preventDefault();
  const msg = $('#res-msg');
  const name = $('#r-name').value.trim();
  const number = cleanPhone($('#r-phone').value);
  const guests = +$('#r-guests').value;
  const date = $('#r-date').value;
  const time = $('#r-time').value;
  if (!validateReservation({ name, number, guests, date, time })) { setMessage(msg, 'Please check the highlighted fields.', 'err'); return; }
  if (!Auth.user) { setMessage(msg, 'Sign in or create an account to confirm — your details stay filled in.'); Auth.open('in'); return; }

  const button = $('#res-go');
  button.disabled = true;
  setMessage(msg, 'Sending your reservation…');
  const { data: r, error } = await sb.rpc('create_reservation', {
    p_full_name: name,
    p_phone: $('#r-cc').value + ' ' + number,
    p_guests: guests,
    p_at: beirutISO(date, time),
    p_set_menu: $('#r-menu').value || null,
    p_notes: $('#r-notes').value.trim() || null
  });
  button.disabled = false;
  loadAvailability();
  if (error) { setMessage(msg, errText(error), 'err'); return; }
  if (r.status === 'cancelled') { await offerAlternatives(msg, { date, time, guests }); loadMine(); return; }
  setMessage(msg, '', 'ok');
  msg.replaceChildren(
    r.status === 'confirmed' ? 'Your table is confirmed! Your code is ' : 'Reservation sent! Your code is ',
    h('b', {}, r.code),
    r.status === 'confirmed' ? '. See you soon.' : r.deposit_status === 'due' ? '. It is confirmed automatically once your deposit is paid.' : '. The team will confirm it shortly.',
    r.deposit_status === 'due' ? h('a', { class: 'btn gold small', href: 'pay.html?r=' + r.id }, `Pay ${money(r.deposit_amount)} deposit`) : null);
  $('#r-notes').value = '';
  loadMine();
}

async function wireReserve() {
  await loadSettings();
  fillTimes();
  fillDates();
  $('#r-date').addEventListener('change', loadAvailability);
  $('#r-guests').addEventListener('input', () => { fillTimes(); updateSummary(); });
  $('#g-minus').addEventListener('click', () => stepGuests(-1));
  $('#g-plus').addEventListener('click', () => stepGuests(1));
  $('#r-menu').addEventListener('input', updateSummary);
  const { data } = await sb.from('set_menus').select('*').order('sort');
  setMenus = data || [];
  $('#r-menu').append(...setMenus.map((m) => h('option', { value: m.id }, `${m.name} — ${money(m.price)} / person`)));
  $('#res-form').addEventListener('submit', submitReservation);
}

/* ---------- my reservations ---------- */
let mine = [];
let feedbackDone = new Set();

async function loadMine() {
  if (!Auth.user) { mine = []; renderMine(); return; }
  const [{ data }, { data: fb }] = await Promise.all([
    sb.from('reservations').select('*, set_menus(name)').eq('user_id', Auth.user.id).order('reserved_at', { ascending: false }).limit(30),
    sb.from('feedback').select('reservation_id').eq('user_id', Auth.user.id)
  ]);
  mine = data || [];
  feedbackDone = new Set((fb || []).map((f) => f.reservation_id));
  renderMine();
}

function reservationRow(r) {
  const live = r.status === 'pending' || r.status === 'confirmed';
  const cancelledBy = r.cancelled_by === 'system' ? 'Cancelled automatically — deposit not paid' : 'Cancelled by ' + (r.cancelled_by === 'team' ? 'the restaurant' : 'you');
  return h('li', { class: 'res s-' + r.status },
    h('div', { class: 'res-top' }, h('b', { class: 'code' }, r.code), h('span', { class: 'pill p-' + r.status }, STATUS[r.status])),
    h('p', {}, fmtWhen(r.reserved_at), ' · ', plural(r.guests, 'guest'), r.set_menus ? ' · ' + r.set_menus.name : ''),
    r.deposit_status !== 'none'
      ? h('p', { class: 'small dep d-' + r.deposit_status }, DEPOSIT[r.deposit_status] + ' · ' + money(r.deposit_amount), r.deposit_status === 'due' && r.deposit_due ? ' · before ' + fmtWhen(r.deposit_due) : '')
      : null,
    r.status === 'cancelled' ? h('p', { class: 'small muted' }, cancelledBy, r.cancel_reason ? ' · ' + r.cancel_reason : '') : null,
    h('div', { class: 'res-actions' },
      live && r.deposit_status === 'due' ? h('a', { class: 'btn gold small', href: 'pay.html?r=' + r.id }, 'Pay deposit') : null,
      live ? h('button', { type: 'button', class: 'btn outline small', onclick: () => askCancel(r) }, 'Cancel') : null,
      r.status === 'completed' && !feedbackDone.has(r.id) ? h('button', { type: 'button', class: 'btn small', onclick: () => openFeedback(r.id) }, 'Give feedback') : null));
}

function renderMine() {
  const signedIn = !!Auth.user;
  $('#mine-signed-out').hidden = signedIn;
  $('#mine-signin').hidden = signedIn;
  const rows = mine.map(reservationRow);
  $('#mine-list').replaceChildren(...(signedIn && !rows.length ? [h('li', { class: 'empty' }, 'No reservations yet.')] : rows));
  $('#acct-list').replaceChildren(...(mine.length ? mine.map(reservationRow) : [h('li', { class: 'empty' }, 'Your reservation codes will appear here.')]));
}

let cancelling = null;
function askCancel(r) {
  cancelling = r;
  $('#cancel-what').textContent = `${r.code} · ${fmtWhen(r.reserved_at)} · ${plural(r.guests, 'guest')}. The team will be notified.`;
  $('#cancel-reason').value = '';
  setMessage($('#cancel-msg'), '');
  $('#cancel-dlg').showModal();
}
function wireCancel() {
  $('#cancel-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.rpc('cancel_reservation', { p_id: cancelling.id, p_reason: $('#cancel-reason').value.trim() || null });
    if (error) { setMessage($('#cancel-msg'), errText(error), 'err'); return; }
    $('#cancel-dlg').close();
    loadMine();
  });
}

/* ---------- after-visit feedback ---------- */
let feedbackFor = null;
let feedbackRating = () => 0;
function openFeedback(id) {
  if (!Auth.user) { Auth.open('in'); return; }
  feedbackFor = id;
  const r = mine.find((x) => x.id === id);
  $('#fb-what').textContent = r ? `${r.code} · ${fmtWhen(r.reserved_at)}` : '';
  setMessage($('#fb-msg'), '');
  $('#fb-dlg').showModal();
}
function wireFeedback() {
  feedbackRating = starPicker($('#fb-stars'), 'fb');
  $('#fb-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#fb-msg');
    const rating = feedbackRating();
    if (!rating) { setMessage(msg, 'Choose an overall rating.', 'err'); return; }
    const value = (id) => $('#' + id).value.trim() || null;
    const { error } = await sb.rpc('submit_feedback', { p_id: feedbackFor, p_rating: rating, p_loved: value('fb-loved'), p_service: value('fb-service'), p_food: value('fb-food'), p_place: value('fb-place'), p_other: value('fb-other') });
    if (error) { setMessage(msg, errText(error), 'err'); return; }
    $('#fb-form').reset();
    $('#fb-dlg').close();
    toast('Merci beaucoup!', 'Your feedback goes straight to the team.', 'ok');
    loadMine();
  });
}

/* ---------- account ---------- */
function renderAccount() {
  const user = Auth.user;
  const profile = Auth.profile;
  $('#account-label').textContent = user ? (profile && profile.full_name ? profile.full_name.split(' ')[0] : 'Profile') : 'Sign in';
  $('#account').setAttribute('aria-label', user ? 'My profile' : 'Sign in');
  if (!user || !profile) return;
  $('#profile').replaceChildren(h('dt', {}, 'Name'), h('dd', {}, profile.full_name), h('dt', {}, 'Phone'), h('dd', {}, profile.phone || '—'), h('dt', {}, 'Email'), h('dd', {}, user.email));
  if (!$('#r-name').value) $('#r-name').value = profile.full_name || '';
  if (!$('#r-phone').value && profile.phone) {
    const match = /^(\+\d{1,4})\s*(.*)$/.exec(profile.phone);
    if (match && COUNTRY_CODES.some((c) => c[0] === match[1])) { $('#r-cc').value = match[1]; $('#r-phone').value = match[2]; }
    else $('#r-phone').value = profile.phone;
  }
}

function onNotificationOpen(n) {
  closeBellPanel();
  if (n.kind === 'feedback' && n.reservation_id) { openFeedback(n.reservation_id); return; }
  if ((n.kind === 'deposit_due' || n.kind === 'deposit_warning') && n.reservation_id) {
    try { sessionStorage.setItem('mh-pay-r', n.reservation_id); } catch { /* storage blocked */ }
    location.href = 'pay.html?r=' + n.reservation_id;
    return;
  }
  document.getElementById('reserve').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- boot ---------- */
async function main() {
  bootShell();
  wireNav();
  wireContact();
  wireMenu();
  wireReviews();
  wireCancel();
  wireFeedback();
  $('#account').addEventListener('click', () => (Auth.user ? $('#acct-dlg').showModal() : Auth.open('in')));
  $('#mine-signin').addEventListener('click', () => Auth.open('in'));
  $('#sign-out').addEventListener('click', async () => { $('#acct-dlg').close(); await Auth.signOut(); });
  document.addEventListener('mh:notification', () => loadMine());

  Auth.onChange(async (user) => {
    renderAccount();
    if (user) Bell.start(user, { onOpen: onNotificationOpen }); else Bell.stop();
    await loadMine();
    loadReviews();
    const feedbackId = new URLSearchParams(location.search).get('feedback');
    if (feedbackId && user) openFeedback(feedbackId);
  });
  await wireReserve();
  await Auth.init();
}

main();
