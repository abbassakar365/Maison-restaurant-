/* Admin dashboard: reservations, notifications, customers, no-show list, feedback,
   menu editor, settings, Auto-pilot and phone calls. */
import { $, $$, h, setMessage } from '../lib/dom.js';
import { sb, assetUrl } from '../lib/supabase.js';
import { fmtWhen, fmtAgo, money, errText, beirutDay, hhmm, plural, telHref } from '../lib/format.js';
import { toast } from '../lib/notify.js';
import { Auth } from '../lib/auth.js';
import { Bell, closeBellPanel } from '../lib/bell.js';
import { bootShell } from '../lib/shell.js';
import { PHOTO_BY_NAME, TAGS, tagList } from '../menu-data.js';

const STATUS = { pending: 'Pending', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Completed', no_show: 'No-show' };
const DEPOSIT = { due: 'Deposit due', review: 'Deposit to verify', paid: 'Deposit paid', expired: 'Deposit expired' };
const CANCELLED_BY = { customer: 'by customer', team: 'by team', system: 'auto · unpaid deposit' };
const FLAG_LIMIT = 3;
const ATTENDANCE_WINDOW_MS = 3600e3;
const HOUR_MS = 3600e3;

let reservations = [];
let customers = new Map();
let filter = 'today';
let isStaff = false;
let resChannel = null;
let callChannel = null;

const isLive = (r) => r.status === 'pending' || r.status === 'confirmed';

function customerFlag(p) {
  if (!p) return null;
  if (p.unpaid >= FLAG_LIMIT) return 'red';
  if (p.no_shows >= FLAG_LIMIT) return 'orange';
  return null;
}

function nameWithCounts(name, p) {
  const flag = customerFlag(p);
  return h('span', { class: 'cust' + (flag ? ' ' + flag : '') }, name,
    p && p.no_shows ? h('span', { class: 'count c-ns', title: 'No-shows' }, 'No-show ×' + p.no_shows) : null,
    p && p.unpaid ? h('span', { class: 'count c-up', title: 'Unpaid deposits' }, 'Unpaid ×' + p.unpaid) : null);
}

/* ---------- data ---------- */
async function loadAll() {
  const [{ data: r }, { data: p }] = await Promise.all([
    sb.from('reservations').select('*, set_menus(name)').order('reserved_at', { ascending: true }).limit(1000),
    sb.from('profiles').select('*').limit(5000)
  ]);
  reservations = r || [];
  customers = new Map((p || []).map((x) => [x.id, x]));
  renderReservations();
  renderCustomers();
  renderNoShows();
}
const debounce = (fn, ms) => { let timer; return () => { clearTimeout(timer); timer = setTimeout(fn, ms); }; };
const reloadSoon = debounce(loadAll, 400);
const loadCallsSoon = debounce(() => loadCalls(), 300);

/* ---------- reservations ---------- */
function matchesFilter(r) {
  const today = beirutDay();
  const day = beirutDay(r.reserved_at);
  const future = new Date(r.reserved_at) >= Date.now() - 3 * HOUR_MS;
  switch (filter) {
    case 'today': return day === today;
    case 'upcoming': return isLive(r) && future;
    case 'action': return r.status === 'pending' || r.deposit_status === 'review' || (isLive(r) && new Date(r.reserved_at) <= Date.now() + ATTENDANCE_WINDOW_MS);
    case 'cancelled': return r.status === 'cancelled';
    case 'past': return !future || !isLive(r);
    default: return true;
  }
}

function renderReservations() {
  const q = $('#res-search').value.trim().toLowerCase();
  let rows = reservations.filter(matchesFilter).filter((r) => !q || [r.full_name, r.phone, r.code].some((v) => (v || '').toLowerCase().includes(q)));
  if (['past', 'cancelled', 'all'].includes(filter)) rows = rows.slice().reverse();
  $('#res-count').textContent = plural(rows.length, 'reservation');
  $('#res-list').replaceChildren(...(rows.length ? rows.map(reservationCard) : [h('li', { class: 'empty' }, 'Nothing here.')]));
}

/** A button that runs an RPC, shows errors and reloads the list on success. */
function action(label, cls, run) {
  return h('button', { type: 'button', class: 'btn small ' + cls, onclick: async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    const { error } = await run();
    button.disabled = false;
    if (error) toast('Could not update', errText(error), 'error'); else reloadSoon();
  } }, label);
}

function reservationCard(r) {
  const p = customers.get(r.user_id);
  const flag = customerFlag(p);
  const canAttend = isLive(r) && new Date(r.reserved_at) <= Date.now() + ATTENDANCE_WINDOW_MS;
  const tables = r.tables_needed || 1;
  return h('li', { class: 't-card s-' + r.status + (flag ? ' flag-' + flag : '') },
    h('div', { class: 't-main' },
      h('div', { class: 't-head' },
        h('b', { class: 'code' }, r.code),
        h('span', { class: 'pill p-' + r.status }, STATUS[r.status]),
        r.deposit_status !== 'none' ? h('span', { class: 'pill dep-' + r.deposit_status }, DEPOSIT[r.deposit_status] + ' ' + money(r.deposit_amount)) : null,
        r.source === 'phone' ? h('span', { class: 'pill p-phone' }, 'By phone') : null),
      h('p', { class: 't-name' }, nameWithCounts(r.full_name, p)),
      h('p', {}, h('a', { href: telHref(r.phone) }, r.phone), ' · ', plural(r.guests, 'guest'), ' · ', plural(tables, 'table')),
      h('p', { class: 't-when' }, fmtWhen(r.reserved_at)),
      r.set_menus ? h('p', {}, r.set_menus.name + ' · total ' + money(r.set_menu_total)) : null,
      r.deposit_status === 'due' && r.deposit_due ? h('p', { class: 'small warn' }, 'Deposit deadline ' + fmtWhen(r.deposit_due)) : null,
      r.payment_ref ? h('p', { class: 'small' }, 'Paid by ' + r.payment_method + ' · ref ' + r.payment_ref) : null,
      r.notes ? h('p', { class: 'small note' }, '“' + r.notes + '”') : null,
      h('div', { class: 'res-actions' },
        r.status === 'pending' ? action('Confirm', 'ok', () => sb.rpc('confirm_reservation', { p_id: r.id })) : null,
        r.deposit_status === 'review' || (r.deposit_status === 'due' && isLive(r)) ? action('Deposit received', 'gold', () => sb.rpc('verify_deposit', { p_id: r.id, p_ok: true })) : null,
        r.deposit_status === 'review' ? action('Payment not found', 'outline', () => sb.rpc('verify_deposit', { p_id: r.id, p_ok: false })) : null,
        isLive(r) ? h('span', { class: 'attend' },
          h('span', { class: 'small' }, 'Did the guest come?'),
          canAttend ? action('Yes — complete', 'ok', () => sb.rpc('mark_attendance', { p_id: r.id, p_came: true })) : null,
          canAttend ? action('No-show', 'danger', () => sb.rpc('mark_attendance', { p_id: r.id, p_came: false })) : null,
          canAttend ? null : h('span', { class: 'small muted' }, 'available 1 h before')) : null,
        isLive(r) ? h('button', { type: 'button', class: 'btn small outline', onclick: () => askCancel(r) }, 'Cancel') : null)),
    r.status === 'cancelled'
      ? h('div', { class: 'cancel-mark big' }, 'Cancelled', h('small', {}, CANCELLED_BY[r.cancelled_by] || ''), r.cancel_reason ? h('small', {}, r.cancel_reason) : null)
      : null);
}

let cancelling = null;
function askCancel(r) {
  cancelling = r;
  $('#cancel-what').textContent = `${r.code} · ${r.full_name} · ${fmtWhen(r.reserved_at)}. The customer will be notified.`;
  $('#cancel-reason').value = '';
  setMessage($('#cancel-msg'), '');
  $('#cancel-dlg').showModal();
}

function setFilter(value) {
  filter = value;
  $$('#res-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === value)));
  renderReservations();
}

/* ---------- notifications tab ---------- */
function renderTeamNotifications() {
  const box = $('#team-notifs');
  if (box) box.replaceChildren(...(Bell.items.length ? Bell.items.map((n) => Bell.row(n)) : [h('li', { class: 'empty' }, 'No notifications yet.')]));
}

/* ---------- customers & no-shows ---------- */
function renderCustomers() {
  const q = $('#cust-search').value.trim().toLowerCase();
  const counts = {};
  reservations.forEach((r) => { counts[r.user_id] = (counts[r.user_id] || 0) + 1; });
  const list = [...customers.values()]
    .filter((p) => !q || [p.full_name, p.phone, p.email].some((v) => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.unpaid + b.no_shows) - (a.unpaid + a.no_shows) || a.full_name.localeCompare(b.full_name));
  const body = $('#cust-table tbody');
  if (!list.length) { body.replaceChildren(h('tr', {}, h('td', { colspan: 5, class: 'empty' }, 'No customers yet.'))); return; }
  body.replaceChildren(...list.map((p) => h('tr', { class: customerFlag(p) ? 'row-' + customerFlag(p) : '' },
    h('td', { 'data-label': 'Customer' }, nameWithCounts(p.full_name, p), h('small', { class: 'muted block' }, p.email || '')),
    h('td', { 'data-label': 'Phone' }, p.phone ? h('a', { href: telHref(p.phone) }, p.phone) : '—'),
    h('td', { 'data-label': 'Reservations' }, counts[p.id] || 0),
    h('td', { 'data-label': 'No-shows' }, h('span', { class: 'num' + (p.no_shows >= FLAG_LIMIT ? ' orange' : '') }, p.no_shows)),
    h('td', { 'data-label': 'Unpaid' }, h('span', { class: 'num' + (p.unpaid >= FLAG_LIMIT ? ' red' : '') }, p.unpaid)))));
}

function renderNoShows() {
  const list = [...customers.values()].filter((p) => p.no_shows || p.unpaid).sort((a, b) => (b.no_shows + b.unpaid) - (a.no_shows + a.unpaid));
  $('#noshow-list').replaceChildren(...(list.length ? list.map((p) => {
    const misses = reservations.filter((r) => r.user_id === p.id && (r.status === 'no_show' || r.cancelled_by === 'system')).reverse();
    const flag = customerFlag(p);
    return h('li', { class: 't-card' + (flag ? ' flag-' + flag : '') }, h('div', { class: 't-main' },
      h('p', { class: 't-name' }, nameWithCounts(p.full_name, p)),
      h('p', {}, p.phone ? h('a', { href: telHref(p.phone) }, p.phone) : '—', p.email ? ' · ' + p.email : ''),
      h('ul', { class: 'small miss' }, misses.slice(0, 6).map((r) => h('li', {}, `${r.code} · ${fmtWhen(r.reserved_at)} · ${r.status === 'no_show' ? 'did not come' : 'deposit not paid'}`)))));
  }) : [h('li', { class: 'empty' }, 'No no-shows or unpaid deposits so far.')]));
}

async function loadFeedback() {
  const { data } = await sb.from('feedback').select('*, reservations(code, full_name, reserved_at)').order('created_at', { ascending: false }).limit(200);
  const rows = data || [];
  const part = (label, value) => (value ? h('p', {}, h('b', {}, label + ': '), value) : null);
  $('#fb-list').replaceChildren(...(rows.length ? rows.map((f) => h('li', { class: 't-card' }, h('div', { class: 't-main' },
    h('div', { class: 't-head' },
      h('b', {}, f.reservations ? f.reservations.full_name : 'Guest'),
      h('span', { class: 'rstars' }, '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating)),
      h('span', { class: 'small muted' }, f.reservations ? f.reservations.code + ' · ' + fmtWhen(f.reservations.reserved_at) : '')),
    part('Loved', f.loved), part('Service', f.dislike_service), part('Food & beverages', f.dislike_food), part('Place', f.dislike_place), part('Other', f.dislike_other))))
    : [h('li', { class: 'empty' }, 'No feedback yet.')]));
}

/* ---------- menu editor ---------- */
let menuCats = [];
let menuItems = [];
let menuCat = null;
let editing = null;
let pendingPhoto; // undefined = unchanged, null = removed, File = new upload

const photoFor = (item) => item.photo_url || PHOTO_BY_NAME.get(String(item.name).toLowerCase()) || null;
const photoView = (item) => (photoFor(item) ? h('img', { src: assetUrl(photoFor(item)), alt: '' }) : item.picture);

async function loadMenuEditor() {
  const [{ data: c }, { data: i }] = await Promise.all([
    sb.from('menu_categories').select('*').order('sort'),
    sb.from('menu_items').select('*').order('sort')
  ]);
  menuCats = c || [];
  menuItems = i || [];
  if (!menuCats.some((x) => x.id === menuCat)) menuCat = menuCats[0] && menuCats[0].id;
  renderMenuEditor();
}

function categoryEditor(cat) {
  const box = $('#me-cat-edit');
  const name = h('input', { value: cat.name, maxlength: 60, 'aria-label': 'Category name' });
  const note = h('input', { value: cat.note, maxlength: 140, 'aria-label': 'Category description', placeholder: 'Short description' });
  const tint = h('input', { type: 'color', value: cat.tint, 'aria-label': 'Picture background colour' });
  const active = h('input', { type: 'checkbox', checked: cat.active });
  const msg = h('span', { class: 'form-msg' });
  box.replaceChildren(
    h('div', { class: 'cat-row' },
      h('label', {}, 'Category', name), h('label', { class: 'grow' }, 'Description', note), h('label', {}, 'Colour', tint),
      h('label', { class: 'inline' }, active, ' Shown on the site')),
    h('div', { class: 'row-end' }, msg,
      h('button', { type: 'button', class: 'btn small danger', onclick: async () => {
        const n = menuItems.filter((i) => i.category_id === cat.id).length;
        if (n && !box.dataset.confirm) { box.dataset.confirm = '1'; setMessage(msg, `This deletes the category and its ${n} dishes. Press again to confirm.`, 'err'); return; }
        delete box.dataset.confirm;
        const { error } = await sb.from('menu_categories').delete().eq('id', cat.id);
        if (error) { toast('Could not delete', errText(error), 'error'); return; }
        menuCat = null;
        loadMenuEditor();
      } }, 'Delete category'),
      h('button', { type: 'button', class: 'btn small', onclick: async () => {
        const { error } = await sb.from('menu_categories').update({ name: name.value.trim(), note: note.value.trim(), tint: tint.value, active: active.checked }).eq('id', cat.id);
        setMessage(msg, error ? errText(error) : 'Saved.', error ? 'err' : 'ok');
        if (!error) loadMenuEditor();
      } }, 'Save category')));
}

function renderMenuEditor() {
  $('#me-cats').replaceChildren(...menuCats.map((c) => h('button', { type: 'button', role: 'tab', 'aria-pressed': String(c.id === menuCat),
    onclick: () => { menuCat = c.id; renderMenuEditor(); } }, c.name + (c.active ? '' : ' (hidden)'), ' ', h('small', {}, menuItems.filter((i) => i.category_id === c.id).length))));
  const cat = menuCats.find((c) => c.id === menuCat);
  if (cat) categoryEditor(cat); else $('#me-cat-edit').replaceChildren(h('p', { class: 'muted' }, 'No categories yet. Add one to start.'));
  const q = $('#me-search').value.trim().toLowerCase();
  const items = menuItems.filter((i) => (q ? (i.name + ' ' + i.ingredients).toLowerCase().includes(q) : i.category_id === menuCat));
  $('#me-list').replaceChildren(...(items.length ? items.map((item) => h('li', { class: 'me-row' + (item.available ? '' : ' off') },
    h('span', { class: 'me-pic' }, photoView(item)),
    h('span', { class: 'me-main' }, h('b', {}, item.name), h('small', { class: 'muted' }, tagList(item.tags).map((t) => TAGS[t].label).join(' · ') || ' '), h('small', { class: 'muted ingr-line' }, item.ingredients)),
    h('b', { class: 'me-price' }, money(item.price)),
    h('label', { class: 'inline small' }, h('input', { type: 'checkbox', checked: item.available, onchange: async (e) => {
      const { error } = await sb.from('menu_items').update({ available: e.target.checked, updated_at: new Date().toISOString() }).eq('id', item.id);
      if (error) { toast('Could not update', errText(error), 'error'); e.target.checked = !e.target.checked; }
      else { item.available = e.target.checked; renderMenuEditor(); }
    } }), ' On the menu'),
    h('button', { type: 'button', class: 'btn small outline', onclick: () => openDish(item) }, 'Edit')))
    : [h('li', { class: 'empty' }, q ? 'No dishes match.' : 'No dishes in this category yet.')]));
}

function previewPhoto(url, picture) {
  $('#d-preview').replaceChildren(url ? h('img', { src: url, alt: '' }) : h('span', {}, picture || '🍽️'));
  $('#d-photo-remove').hidden = !url;
}

function openDish(item) {
  editing = item || null;
  pendingPhoto = undefined;
  $('#dish-title').textContent = item ? 'Edit dish' : 'Add a dish';
  $('#d-cat').replaceChildren(...menuCats.map((c) => h('option', { value: c.id }, c.name)));
  $('#d-name').value = item ? item.name : '';
  $('#d-cat').value = item ? item.category_id : menuCat;
  $('#d-price').value = item ? item.price : '';
  $('#d-pic').value = item ? item.picture : '🍽️';
  $('#d-desc').value = item ? item.description || '' : '';
  $('#d-ingr').value = item ? item.ingredients : '';
  Object.keys(TAGS).forEach((t) => { $('#d-' + t).checked = !!(item && item.tags.includes(t)); });
  $('#d-avail').checked = item ? item.available : true;
  $('#d-delete').hidden = !item;
  setMessage($('#d-msg'), '');
  $('#d-photo').value = '';
  previewPhoto(item && photoFor(item) ? assetUrl(photoFor(item)) : null, $('#d-pic').value);
  $('#dish-dlg').showModal();
}

const slugify = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

function newCategoryEditor() {
  const box = $('#me-cat-edit');
  const name = h('input', { maxlength: 60, placeholder: 'e.g. Breakfast', 'aria-label': 'New category name' });
  const msg = h('span', { class: 'form-msg' });
  box.replaceChildren(h('div', { class: 'cat-row' }, h('label', { class: 'grow' }, 'New category name', name)),
    h('div', { class: 'row-end' }, msg,
      h('button', { type: 'button', class: 'btn small outline', onclick: renderMenuEditor }, 'Cancel'),
      h('button', { type: 'button', class: 'btn small', onclick: async () => {
        const n = name.value.trim();
        if (!n) { setMessage(msg, 'Enter a name.', 'err'); return; }
        let id = slugify(n) || 'cat-' + Date.now().toString(36);
        if (id.length < 2) id += '-1';
        const { error } = await sb.from('menu_categories').insert({ id, name: n, sort: menuCats.length + 1 });
        if (error) { setMessage(msg, /duplicate/i.test(error.message) ? 'A category with that name already exists.' : errText(error), 'err'); return; }
        menuCat = id;
        loadMenuEditor();
      } }, 'Add category')));
  name.focus();
}

async function uploadPhoto(file, categoryId) {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${categoryId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('menu').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) throw error;
  return sb.storage.from('menu').getPublicUrl(path).data.publicUrl;
}

async function saveDish(e) {
  e.preventDefault();
  const msg = $('#d-msg');
  const name = $('#d-name').value.trim();
  const price = parseFloat($('#d-price').value);
  if (!name) { setMessage(msg, 'Enter a name.', 'err'); return; }
  if (!(price >= 0)) { setMessage(msg, 'Enter a price.', 'err'); return; }
  setMessage(msg, 'Saving…');
  const categoryId = $('#d-cat').value;
  let photo_url = editing ? editing.photo_url : null;
  try {
    if (pendingPhoto) photo_url = await uploadPhoto(pendingPhoto, categoryId);
    else if (pendingPhoto === null) photo_url = null;
  } catch (error) {
    setMessage(msg, 'Photo upload failed: ' + errText(error), 'err');
    return;
  }
  const row = {
    name, category_id: categoryId, price, photo_url,
    picture: $('#d-pic').value.trim() || '🍽️',
    description: $('#d-desc').value.trim(),
    ingredients: $('#d-ingr').value.trim(),
    tags: Object.keys(TAGS).filter((t) => $('#d-' + t).checked).join(''),
    available: $('#d-avail').checked,
    updated_at: new Date().toISOString()
  };
  const { error } = editing
    ? await sb.from('menu_items').update(row).eq('id', editing.id)
    : await sb.from('menu_items').insert({ ...row, sort: menuItems.filter((i) => i.category_id === categoryId).length + 1 });
  if (error) { setMessage(msg, errText(error), 'err'); return; }
  $('#dish-dlg').close();
  menuCat = categoryId;
  loadMenuEditor();
  toast('Saved', name + ' is updated on the menu.', 'ok');
}

function wireMenuEditor() {
  $('#me-search').addEventListener('input', renderMenuEditor);
  $('#me-add').addEventListener('click', () => { if (!menuCats.length) { toast('Add a category first', '', 'warn'); return; } openDish(null); });
  $('#me-add-cat').addEventListener('click', newCategoryEditor);
  $('#d-pic').addEventListener('input', () => { if (!(editing && photoFor(editing)) && !pendingPhoto) previewPhoto(null, $('#d-pic').value); });
  $('#d-photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setMessage($('#d-msg'), 'That photo is over 5 MB.', 'err'); e.target.value = ''; return; }
    pendingPhoto = file;
    previewPhoto(URL.createObjectURL(file));
  });
  $('#d-photo-remove').addEventListener('click', () => { pendingPhoto = null; previewPhoto(null, $('#d-pic').value); });
  $('#d-delete').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    if (!button.dataset.confirm) {
      button.dataset.confirm = '1';
      button.textContent = 'Press again to delete';
      setTimeout(() => { delete button.dataset.confirm; button.textContent = 'Delete dish'; }, 4000);
      return;
    }
    const { error } = await sb.from('menu_items').delete().eq('id', editing.id);
    if (error) { setMessage($('#d-msg'), errText(error), 'err'); return; }
    $('#dish-dlg').close();
    loadMenuEditor();
  });
  $('#dish-form').addEventListener('submit', saveDish);
}

/* ---------- settings ---------- */
const SETTING_FIELDS = { 's-tables': 'total_tables', 's-seats': 'seats_per_table', 's-sitting': 'sitting_minutes', 's-open': 'open_time', 's-last': 'last_booking', 's-threshold': 'deposit_threshold', 's-percent': 'deposit_percent' };
const isTimeField = (key) => key === 'open_time' || key === 'last_booking';

async function loadSettingsTab() {
  const [{ data: st }, { data: sm }] = await Promise.all([
    sb.from('restaurant_settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('set_menus').select('*').order('sort')
  ]);
  if (st) Object.entries(SETTING_FIELDS).forEach(([id, key]) => { $('#' + id).value = isTimeField(key) ? hhmm(st[key]) : +st[key]; });
  $('#s-seats-txt').textContent = $('#s-seats').value;
  $('#setmenu-list').replaceChildren(...(sm || []).map((m) => {
    const name = h('input', { value: m.name, maxlength: 60, 'aria-label': 'Set menu name' });
    const courses = h('input', { value: m.courses, maxlength: 200, 'aria-label': 'Courses' });
    const price = h('input', { type: 'number', min: 1, step: 1, value: +m.price, 'aria-label': 'Price per person' });
    const active = h('input', { type: 'checkbox', checked: m.active });
    const msg = h('span', { class: 'form-msg' });
    return h('li', { class: 'card setmenu' },
      h('div', { class: 'cat-row' }, h('label', {}, 'Name', name), h('label', { class: 'grow' }, 'Courses', courses), h('label', {}, 'Price / person ($)', price),
        h('label', { class: 'inline' }, active, ' Offered')),
      h('div', { class: 'row-end' }, msg, h('button', { type: 'button', class: 'btn small', onclick: async () => {
        const { error } = await sb.from('set_menus').update({ name: name.value.trim(), courses: courses.value.trim(), price: +price.value, active: active.checked }).eq('id', m.id);
        setMessage(msg, error ? errText(error) : 'Saved.', error ? 'err' : 'ok');
      } }, 'Save')));
  }));
}

function wireSettings() {
  $('#s-seats').addEventListener('input', () => { $('#s-seats-txt').textContent = $('#s-seats').value; });
  $('#set-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#set-msg');
    const row = { updated_at: new Date().toISOString() };
    Object.entries(SETTING_FIELDS).forEach(([id, key]) => { row[key] = isTimeField(key) ? $('#' + id).value : +$('#' + id).value; });
    if (row.last_booking <= row.open_time) { setMessage(msg, 'Last booking must be after the first booking.', 'err'); return; }
    const { error } = await sb.from('restaurant_settings').update(row).eq('id', 1);
    if (error) setMessage(msg, /check/i.test(error.message) ? 'One of the values is out of range.' : errText(error), 'err');
    else setMessage(msg, 'Saved. The website uses the new settings straight away.', 'ok');
  });
}

/* ---------- auto-pilot ---------- */
const AUTOPILOT_LABELS = { confirmed: 'Confirmed', needs_team: 'Left for the team', deposit_verified: 'Deposit verified', deposit_check: 'Payment to check', full_declined: 'Full — declined', full_released: 'Full — released', phone_booked: 'Phone booking', call_transfer: 'Call transferred', call_missed: 'Missed transfer' };

async function loadAutopilot() {
  const [{ data: st }, { data: log }, { data: pays }] = await Promise.all([
    sb.from('restaurant_settings').select('auto_confirm, auto_deposits, auto_full').eq('id', 1).maybeSingle(),
    sb.from('automation_log').select('*, reservations(code)').order('created_at', { ascending: false }).limit(80),
    sb.from('payments').select('*').order('received_at', { ascending: false }).limit(10)
  ]);
  if (st) { $('#ap-confirm').checked = st.auto_confirm; $('#ap-deposits').checked = st.auto_deposits; $('#ap-full').checked = st.auto_full; }
  $('#ap-log').replaceChildren(...((log || []).length ? log.map((l) => h('li', { class: 'ap-row a-' + l.action },
    h('span', { class: 'pill' }, AUTOPILOT_LABELS[l.action] || l.action),
    h('span', { class: 'ap-detail' }, l.detail),
    h('time', { class: 'small muted' }, fmtAgo(l.created_at))))
    : [h('li', { class: 'empty' }, 'Nothing yet. Actions appear here as bookings and payments arrive.')]));
  $('#ap-payments').replaceChildren(...((pays || []).length ? pays.map((p) => h('li', {},
    h('b', {}, money(p.amount)), ' · ', p.reference || '—', ' · ', p.payer_name || 'no name', ' · ', p.provider,
    h('small', { class: 'block ' + (p.result === 'verified' ? 'ok-t' : 'warn') }, p.result === 'verified' ? 'Verified automatically' : p.result)))
    : [h('li', { class: 'empty' }, 'No payments received yet.')]));
}

function wireAutopilot() {
  $('#ap-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.from('restaurant_settings').update({ auto_confirm: $('#ap-confirm').checked, auto_deposits: $('#ap-deposits').checked, auto_full: $('#ap-full').checked, updated_at: new Date().toISOString() }).eq('id', 1);
    setMessage($('#ap-msg'), error ? errText(error) : 'Saved.', error ? 'err' : 'ok');
  });
  $('#ap-test').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#t-msg');
    const code = $('#t-code').value.trim().toUpperCase();
    const amount = parseFloat($('#t-amount').value);
    if (!/^MH-[A-Z0-9]{6}$/.test(code)) { setMessage(msg, 'Enter a code like MH-ABC123.', 'err'); return; }
    if (!(amount > 0)) { setMessage(msg, 'Enter the amount.', 'err'); return; }
    const { data, error } = await sb.rpc('simulate_payment', { p_code: code, p_payer: $('#t-name').value.trim(), p_amount: amount });
    if (error) { setMessage(msg, errText(error), 'err'); return; }
    if (data === 'verified') setMessage(msg, 'Verified: the deposit is marked paid and the booking confirmed.', 'ok');
    else setMessage(msg, 'Not accepted: ' + data + '. The team was asked to check.', 'err');
    loadAutopilot();
    reloadSoon();
  });
}

/* ---------- phone calls ---------- */
const CALL_STATUS = { live: 'Live now', booked: 'Booked', transferring: 'Putting through', transferred: 'Talked with the team', missed_transfer: 'Call back', ended: 'Ended', failed: 'Problem' };
const SPEAKER = { guest: 'Guest', agent: 'Auto-pilot', system: '' };
let calls = [];
let callFilter = 'all';
const openCalls = new Set();

async function loadCalls() {
  const [{ data: st }, { data }] = await Promise.all([
    sb.from('phone_settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('calls').select('id, from_number, status, language, summary, transcript, started_at, ended_at, reservations(code)').order('started_at', { ascending: false }).limit(100)
  ]);
  // don't overwrite the form while someone is typing in it
  if (st && document.activeElement?.closest('#ph-form') == null) {
    $('#ph-enabled').checked = st.enabled;
    $('#ph-team').value = st.team_phone || '';
    $('#ph-lang').value = st.language;
  }
  calls = data || [];
  renderCalls();
}

function callMatches(c) {
  switch (callFilter) {
    case 'live': return c.status === 'live' || c.status === 'transferring';
    case 'booked': return c.status === 'booked';
    case 'team': return ['missed_transfer', 'transferred', 'failed'].includes(c.status);
    default: return true;
  }
}

function callDuration(c) {
  if (!c.ended_at) return '';
  const s = Math.max(0, Math.round((new Date(c.ended_at) - new Date(c.started_at)) / 1000));
  return ' · ' + (s >= 60 ? Math.floor(s / 60) + ' min ' : '') + (s % 60) + ' s';
}

function renderCalls() {
  const rows = calls.filter(callMatches);
  $('#call-list').replaceChildren(...(rows.length ? rows.map((c) => {
    const said = c.transcript || [];
    const last = c.summary || [...said].reverse().find((t) => t.who === 'guest')?.text || '';
    const details = h('details', { class: 'call c-' + c.status },
      h('summary', {},
        h('span', { class: 'pill' }, CALL_STATUS[c.status] || c.status),
        h('span', { class: 'call-who' }, c.from_number ? h('a', { href: 'tel:' + c.from_number, onclick: (e) => e.stopPropagation() }, c.from_number) : 'Hidden number', c.reservations ? ' · ' + c.reservations.code : ''),
        h('time', { class: 'small muted' }, fmtAgo(c.started_at) + callDuration(c)),
        last ? h('span', { class: 'call-sum', dir: 'auto' }, last) : null),
      h('ul', { class: 'transcript' }, ...said.map((t) => h('li', { class: 't-' + t.who, dir: 'auto' }, SPEAKER[t.who] ? h('b', {}, SPEAKER[t.who]) : null, t.text))));
    details.open = openCalls.has(c.id);
    details.addEventListener('toggle', () => { if (details.open) openCalls.add(c.id); else openCalls.delete(c.id); });
    return h('li', {}, details);
  }) : [h('li', { class: 'empty' }, callFilter === 'all' ? 'No calls yet. Calls appear here as soon as the phone number is connected.' : 'Nothing here.')]));
}

function wireCalls() {
  $$('#call-filter button').forEach((b) => b.addEventListener('click', () => {
    callFilter = b.dataset.f;
    $$('#call-filter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderCalls();
  }));
  $('#ph-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#ph-msg');
    const raw = $('#ph-team').value.trim();
    const team = raw ? '+' + raw.replace(/\D/g, '') : null;
    if (team && !/^\+[0-9]{7,15}$/.test(team)) { setMessage(msg, 'Enter the number with the country code, like +961 3 123 456.', 'err'); return; }
    const { error } = await sb.from('phone_settings').update({ enabled: $('#ph-enabled').checked, team_phone: team, language: $('#ph-lang').value, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) { setMessage(msg, errText(error), 'err'); return; }
    setMessage(msg, team ? 'Saved.' : 'Saved. Without a team phone, guests who ask for a person get a call back instead.', 'ok');
    $('#ph-team').value = team || '';
  });
}

/* ---------- tabs ---------- */
const TAB_LOADERS = { feedback: loadFeedback, notifications: renderTeamNotifications, menu: loadMenuEditor, settings: loadSettingsTab, autopilot: loadAutopilot, calls: loadCalls };
const currentTab = () => location.hash.slice(1) || 'reservations';
const tabVisible = (name) => !$('#tab-' + name).hidden;

function showTab(name) {
  if (!isStaff) return;
  $$('.tab').forEach((t) => { t.hidden = t.id !== 'tab-' + name; });
  $$('#team-tabs a').forEach((a) => {
    const on = a.dataset.tab === name;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (TAB_LOADERS[name]) TAB_LOADERS[name]();
}

/* ---------- access ---------- */
async function onUser(user) {
  isStaff = false;
  if (resChannel) { sb.removeChannel(resChannel); resChannel = null; }
  if (callChannel) { sb.removeChannel(callChannel); callChannel = null; }
  $('#team-out').hidden = !user;
  if (user) {
    const { data } = await sb.from('staff').select('user_id').eq('user_id', user.id).maybeSingle();
    isStaff = !!data;
  }
  $('#gate').hidden = isStaff;
  $('#team-tabs').hidden = !isStaff;
  $('#gate-msg').textContent = user && !isStaff ? `${user.email} is not on the team list. Ask the manager to add you, then sign in again.` : '';
  $('#gate-signin').hidden = !!user;
  if (!isStaff) {
    $$('.tab').forEach((t) => { t.hidden = true; });
    Bell.stop();
    if (!user) Auth.open('in');
    return;
  }
  Bell.start(user, { staff: true, onOpen: (n) => {
    closeBellPanel();
    if (n.reservations) { $('#res-search').value = n.reservations.code; setFilter('all'); location.hash = 'reservations'; }
  } });
  resChannel = sb.channel('team-res').on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, reloadSoon).subscribe();
  callChannel = sb.channel('team-calls').on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => { if (tabVisible('calls')) loadCallsSoon(); }).subscribe();
  await loadAll();
  showTab(currentTab());
}

/* ---------- boot ---------- */
async function main() {
  bootShell();
  $('#gate-signin').addEventListener('click', () => Auth.open('in'));
  wireMenuEditor();
  wireSettings();
  wireAutopilot();
  wireCalls();
  $('#team-out').addEventListener('click', () => Auth.signOut());
  $$('#res-filter button').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.f)));
  $('#res-search').addEventListener('input', renderReservations);
  $('#cust-search').addEventListener('input', renderCustomers);
  window.addEventListener('hashchange', () => showTab(currentTab()));
  $('#cancel-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.rpc('cancel_reservation', { p_id: cancelling.id, p_reason: $('#cancel-reason').value.trim() || null });
    if (error) { setMessage($('#cancel-msg'), errText(error), 'err'); return; }
    $('#cancel-dlg').close();
    reloadSoon();
  });
  document.addEventListener('mh:notification', () => {
    renderTeamNotifications();
    reloadSoon();
    if (tabVisible('autopilot')) loadAutopilot();
    if (tabVisible('calls')) loadCallsSoon();
  });
  // keep the notifications tab in step with the bell (read state, new items)
  document.addEventListener('mh:bell-render', () => { if (isStaff && tabVisible('notifications')) renderTeamNotifications(); });
  // attendance buttons unlock as time passes
  setInterval(() => { if (isStaff) renderReservations(); }, 60000);
  // live calls: refresh the transcript even if the realtime feed is quiet
  setInterval(() => { if (isStaff && tabVisible('calls') && calls.some((c) => c.status === 'live' || c.status === 'transferring')) loadCalls(); }, 8000);
  Auth.onChange(onUser);
  await Auth.init();
}

main();
