/* Team dashboard: reservations, notifications, customers, no-show list, feedback */
'use strict';

const STATUS = { pending: 'Pending', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Completed', no_show: 'No-show' };
const DEPOSIT = { due: 'Deposit due', review: 'Deposit to verify', paid: 'Deposit paid', expired: 'Deposit expired' };
const BY = { customer: 'by customer', team: 'by team', system: 'auto · unpaid deposit' };
let res = [], customers = new Map(), filter = 'today', isStaff = false, resChannel = null, callChannel = null;

const localDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));
const live = r => r.status === 'pending' || r.status === 'confirmed';

function custFlag(p) {
  if (!p) return null;
  if (p.unpaid >= 3) return 'red';
  if (p.no_shows >= 3) return 'orange';
  return null;
}
function nameWithCounts(name, p) {
  const flag = custFlag(p);
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
  res = r || [];
  customers = new Map((p || []).map(x => [x.id, x]));
  renderRes(); renderCustomers(); renderNoShows();
}
let reloadTimer, callTimer;
const loadCallsSoon = () => { clearTimeout(callTimer); callTimer = setTimeout(loadCalls, 300); };
const reloadSoon = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(loadAll, 400); };

/* ---------- reservations ---------- */
function matches(r) {
  const today = localDay(Date.now()), day = localDay(r.reserved_at), future = new Date(r.reserved_at) >= Date.now() - 3 * 3600e3;
  switch (filter) {
    case 'today': return day === today;
    case 'upcoming': return live(r) && future;
    case 'action': return r.status === 'pending' || r.deposit_status === 'review' || (live(r) && new Date(r.reserved_at) <= Date.now() + 3600e3);
    case 'cancelled': return r.status === 'cancelled';
    case 'past': return !future || !live(r);
    default: return true;
  }
}
function renderRes() {
  const q = $('#res-search').value.trim().toLowerCase();
  let rows = res.filter(matches).filter(r => !q || [r.full_name, r.phone, r.code].some(v => (v || '').toLowerCase().includes(q)));
  if (filter === 'past' || filter === 'cancelled' || filter === 'all') rows = rows.slice().reverse();
  $('#res-count').textContent = rows.length + ' reservation' + (rows.length === 1 ? '' : 's');
  $('#res-list').replaceChildren(...(rows.length ? rows.map(resCard) : [h('li', { class: 'empty' }, 'Nothing here.')]));
}
function act(label, cls, fn) {
  return h('button', { type: 'button', class: 'btn small ' + cls, onclick: async e => {
    const b = e.currentTarget; b.disabled = true;
    const { error } = await fn();
    b.disabled = false;
    if (error) toast('Could not update', errText(error), 'error'); else reloadSoon();
  } }, label);
}
function resCard(r) {
  const p = customers.get(r.user_id);
  const canAttend = live(r) && new Date(r.reserved_at) <= Date.now() + 3600e3;
  return h('li', { class: 't-card s-' + r.status + (custFlag(p) ? ' flag-' + custFlag(p) : '') },
    h('div', { class: 't-main' },
      h('div', { class: 't-head' }, h('b', { class: 'code' }, r.code), h('span', { class: 'pill p-' + r.status }, STATUS[r.status]),
        r.deposit_status !== 'none' ? h('span', { class: 'pill dep-' + r.deposit_status }, DEPOSIT[r.deposit_status] + ' ' + money(r.deposit_amount)) : null,
        r.source === 'phone' ? h('span', { class: 'pill p-phone' }, 'By phone') : null),
      h('p', { class: 't-name' }, nameWithCounts(r.full_name, p)),
      h('p', {}, h('a', { href: 'tel:' + r.phone.replace(/[^+\d]/g, '') }, r.phone), ' · ', r.guests + ' guest' + (r.guests > 1 ? 's' : '') + ' · ' + (r.tables_needed || 1) + ' table' + ((r.tables_needed || 1) > 1 ? 's' : '')),
      h('p', { class: 't-when' }, fmtWhen(r.reserved_at)),
      r.set_menus ? h('p', {}, r.set_menus.name + ' · total ' + money(r.set_menu_total)) : null,
      r.deposit_status === 'due' && r.deposit_due ? h('p', { class: 'small warn' }, 'Deposit deadline ' + fmtWhen(r.deposit_due)) : null,
      r.payment_ref ? h('p', { class: 'small' }, 'Paid by ' + r.payment_method + ' · ref ' + r.payment_ref) : null,
      r.notes ? h('p', { class: 'small note' }, '“' + r.notes + '”') : null,
      h('div', { class: 'res-actions' },
        r.status === 'pending' ? act('Confirm', 'ok', () => sb.rpc('confirm_reservation', { p_id: r.id })) : null,
        r.deposit_status === 'review' || (r.deposit_status === 'due' && live(r)) ? act('Deposit received', 'gold', () => sb.rpc('verify_deposit', { p_id: r.id, p_ok: true })) : null,
        r.deposit_status === 'review' ? act('Payment not found', 'ghost-dark', () => sb.rpc('verify_deposit', { p_id: r.id, p_ok: false })) : null,
        live(r) ? h('span', { class: 'attend' + (canAttend ? '' : ' later') },
          h('span', { class: 'small' }, 'Did the guest come?'),
          canAttend ? act('Yes — complete', 'ok', () => sb.rpc('mark_attendance', { p_id: r.id, p_came: true })) : null,
          canAttend ? act('No-show', 'danger', () => sb.rpc('mark_attendance', { p_id: r.id, p_came: false })) : null,
          canAttend ? null : h('span', { class: 'small muted' }, 'available 1 h before')) : null,
        live(r) ? h('button', { type: 'button', class: 'btn small ghost-dark', onclick: () => askCancel(r) }, 'Cancel') : null)),
    r.status === 'cancelled' ? h('div', { class: 'cancel-mark big' }, 'Cancelled', h('small', {}, BY[r.cancelled_by] || ''), r.cancel_reason ? h('small', {}, r.cancel_reason) : null) : null);
}

let cancelling = null;
function askCancel(r) {
  cancelling = r;
  $('#cancel-what').textContent = `${r.code} · ${r.full_name} · ${fmtWhen(r.reserved_at)}. The customer will be notified.`;
  $('#cancel-reason').value = ''; $('#cancel-msg').textContent = '';
  $('#cancel-dlg').showModal();
}

/* ---------- notifications tab ---------- */
function renderTeamNotifs() {
  const box = $('#team-notifs');
  if (box) box.replaceChildren(...(Bell.items.length ? Bell.items.map(n => Bell.row(n)) : [h('li', { class: 'empty' }, 'No notifications yet.')]));
}

/* ---------- customers & no-shows ---------- */
function renderCustomers() {
  const q = $('#cust-search').value.trim().toLowerCase();
  const counts = {};
  res.forEach(r => { counts[r.user_id] = (counts[r.user_id] || 0) + 1; });
  const list = [...customers.values()].filter(p => !q || [p.full_name, p.phone, p.email].some(v => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.unpaid + b.no_shows) - (a.unpaid + a.no_shows) || a.full_name.localeCompare(b.full_name));
  $('#cust-table tbody').replaceChildren(...list.map(p => h('tr', { class: custFlag(p) ? 'row-' + custFlag(p) : '' },
    h('td', { 'data-label': 'Customer' }, nameWithCounts(p.full_name, p), h('small', { class: 'muted block' }, p.email || '')),
    h('td', { 'data-label': 'Phone' }, p.phone ? h('a', { href: 'tel:' + p.phone.replace(/[^+\d]/g, '') }, p.phone) : '—'),
    h('td', { 'data-label': 'Reservations' }, counts[p.id] || 0),
    h('td', { 'data-label': 'No-shows' }, h('span', { class: 'num' + (p.no_shows >= 3 ? ' orange' : '') }, p.no_shows)),
    h('td', { 'data-label': 'Unpaid' }, h('span', { class: 'num' + (p.unpaid >= 3 ? ' red' : '') }, p.unpaid)))));
  if (!list.length) $('#cust-table tbody').replaceChildren(h('tr', {}, h('td', { colspan: 5, class: 'empty' }, 'No customers yet.')));
}
function renderNoShows() {
  const list = [...customers.values()].filter(p => p.no_shows || p.unpaid).sort((a, b) => (b.no_shows + b.unpaid) - (a.no_shows + a.unpaid));
  $('#noshow-list').replaceChildren(...(list.length ? list.map(p => {
    const misses = res.filter(r => r.user_id === p.id && (r.status === 'no_show' || r.cancelled_by === 'system')).reverse();
    return h('li', { class: 't-card' + (custFlag(p) ? ' flag-' + custFlag(p) : '') }, h('div', { class: 't-main' },
      h('p', { class: 't-name' }, nameWithCounts(p.full_name, p)),
      h('p', {}, p.phone ? h('a', { href: 'tel:' + p.phone.replace(/[^+\d]/g, '') }, p.phone) : '—', p.email ? ' · ' + p.email : ''),
      h('ul', { class: 'small miss' }, misses.slice(0, 6).map(r => h('li', {}, r.code + ' · ' + fmtWhen(r.reserved_at) + ' · ' + (r.status === 'no_show' ? 'did not come' : 'deposit not paid'))))));
  }) : [h('li', { class: 'empty' }, 'No no-shows or unpaid deposits so far.')]));
}

async function loadFeedback() {
  const { data } = await sb.from('feedback').select('*, reservations(code, full_name, reserved_at)').order('created_at', { ascending: false }).limit(200);
  const rows = data || [];
  const part = (label, v) => v ? h('p', {}, h('b', {}, label + ': '), v) : null;
  $('#fb-list').replaceChildren(...(rows.length ? rows.map(f => h('li', { class: 't-card' }, h('div', { class: 't-main' },
    h('div', { class: 't-head' }, h('b', {}, f.reservations ? f.reservations.full_name : 'Guest'), h('span', { class: 'rstars' }, '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating)),
      h('span', { class: 'small muted' }, f.reservations ? f.reservations.code + ' · ' + fmtWhen(f.reservations.reserved_at) : '')),
    part('Loved', f.loved), part('Service', f.dislike_service), part('Food & beverages', f.dislike_food), part('Place', f.dislike_place), part('Other', f.dislike_other)))) :
    [h('li', { class: 'empty' }, 'No feedback yet.')]));
}

/* ---------- menu editor ---------- */
let meCats = [], meItems = [], meCat = null, editing = null, pendingPhoto = undefined;
const TAG_NAMES = { h: 'Halal', v: 'Vegetarian', s: 'Spicy' };
async function loadMenuEditor() {
  const [{ data: c }, { data: i }] = await Promise.all([
    sb.from('menu_categories').select('*').order('sort'),
    sb.from('menu_items').select('*').order('sort')
  ]);
  meCats = c || []; meItems = i || [];
  if (!meCats.some(x => x.id === meCat)) meCat = meCats[0] && meCats[0].id;
  renderMenuEditor();
}
function renderMenuEditor() {
  $('#me-cats').replaceChildren(...meCats.map(c => h('button', { type: 'button', role: 'tab', 'aria-pressed': String(c.id === meCat),
    onclick: () => { meCat = c.id; renderMenuEditor(); } }, c.name + (c.active ? '' : ' (hidden)'), ' ', h('small', {}, meItems.filter(i => i.category_id === c.id).length))));
  const cat = meCats.find(c => c.id === meCat);
  const box = $('#me-cat-edit');
  if (cat) {
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
          const n = meItems.filter(i => i.category_id === cat.id).length;
          if (n && !box.dataset.confirm) { box.dataset.confirm = '1'; msg.className = 'form-msg err'; msg.textContent = `This deletes the category and its ${n} dishes. Press again to confirm.`; return; }
          delete box.dataset.confirm;
          const { error } = await sb.from('menu_categories').delete().eq('id', cat.id);
          if (error) return toast('Could not delete', errText(error), 'error');
          meCat = null; loadMenuEditor();
        } }, 'Delete category'),
        h('button', { type: 'button', class: 'btn small', onclick: async () => {
          const { error } = await sb.from('menu_categories').update({ name: name.value.trim(), note: note.value.trim(), tint: tint.value, active: active.checked }).eq('id', cat.id);
          msg.className = 'form-msg ' + (error ? 'err' : 'ok'); msg.textContent = error ? errText(error) : 'Saved.';
          if (!error) loadMenuEditor();
        } }, 'Save category')));
  } else box.replaceChildren(h('p', { class: 'muted' }, 'No categories yet. Add one to start.'));
  const q = $('#me-search').value.trim().toLowerCase();
  const items = meItems.filter(i => q ? (i.name + ' ' + i.ingredients).toLowerCase().includes(q) : i.category_id === meCat);
  $('#me-list').replaceChildren(...(items.length ? items.map(it => h('li', { class: 'me-row' + (it.available ? '' : ' off') },
    h('span', { class: 'me-pic' }, it.photo_url ? h('img', { src: it.photo_url, alt: '' }) : it.picture),
    h('span', { class: 'me-main' }, h('b', {}, it.name), h('small', { class: 'muted' }, [...it.tags].map(t => TAG_NAMES[t]).join(' · ') || ' '), h('small', { class: 'muted ingr-line' }, it.ingredients)),
    h('b', { class: 'me-price' }, money(it.price)),
    h('label', { class: 'inline small' }, h('input', { type: 'checkbox', checked: it.available, onchange: async e => {
      const { error } = await sb.from('menu_items').update({ available: e.target.checked, updated_at: new Date().toISOString() }).eq('id', it.id);
      if (error) { toast('Could not update', errText(error), 'error'); e.target.checked = !e.target.checked; } else { it.available = e.target.checked; renderMenuEditor(); }
    } }), ' On the menu'),
    h('button', { type: 'button', class: 'btn small ghost-dark', onclick: () => openDish(it) }, 'Edit'))) :
    [h('li', { class: 'empty' }, q ? 'No dishes match.' : 'No dishes in this category yet.')]));
}
function previewPhoto(url, pic) {
  $('#d-preview').replaceChildren(url ? h('img', { src: url, alt: '' }) : h('span', {}, pic || '🍽️'));
  $('#d-photo-remove').hidden = !url;
}
function openDish(it) {
  editing = it || null; pendingPhoto = undefined;
  $('#dish-title').textContent = it ? 'Edit dish' : 'Add a dish';
  $('#d-cat').replaceChildren(...meCats.map(c => h('option', { value: c.id }, c.name)));
  $('#d-name').value = it ? it.name : '';
  $('#d-cat').value = it ? it.category_id : meCat;
  $('#d-price').value = it ? it.price : '';
  $('#d-pic').value = it ? it.picture : '🍽️';
  $('#d-ingr').value = it ? it.ingredients : '';
  ['h', 'v', 's'].forEach(t => { $('#d-' + t).checked = !!(it && it.tags.includes(t)); });
  $('#d-avail').checked = it ? it.available : true;
  $('#d-delete').hidden = !it; $('#d-msg').textContent = ''; $('#d-photo').value = '';
  previewPhoto(it && it.photo_url, $('#d-pic').value);
  $('#dish-dlg').showModal();
}
function wireMenuEditor() {
  $('#me-search').addEventListener('input', renderMenuEditor);
  $('#me-add').addEventListener('click', () => { if (!meCats.length) return toast('Add a category first', '', 'warn'); openDish(null); });
  $('#me-add-cat').addEventListener('click', async () => {
    const box = $('#me-cat-edit');
    const name = h('input', { maxlength: 60, placeholder: 'e.g. Breakfast', 'aria-label': 'New category name' });
    const msg = h('span', { class: 'form-msg' });
    box.replaceChildren(h('div', { class: 'cat-row' }, h('label', { class: 'grow' }, 'New category name', name)),
      h('div', { class: 'row-end' }, msg, h('button', { type: 'button', class: 'btn small ghost-dark', onclick: renderMenuEditor }, 'Cancel'),
        h('button', { type: 'button', class: 'btn small', onclick: async () => {
          const n = name.value.trim();
          const id = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'cat-' + Date.now().toString(36);
          if (!n) { msg.className = 'form-msg err'; msg.textContent = 'Enter a name.'; return; }
          const { error } = await sb.from('menu_categories').insert({ id: id.length < 2 ? id + '-1' : id, name: n, sort: meCats.length + 1 });
          if (error) { msg.className = 'form-msg err'; msg.textContent = /duplicate/i.test(error.message) ? 'A category with that name already exists.' : errText(error); return; }
          meCat = id; loadMenuEditor();
        } }, 'Add category')));
    name.focus();
  });
  $('#d-pic').addEventListener('input', () => { if (!(editing && editing.photo_url) && !pendingPhoto) previewPhoto(null, $('#d-pic').value); });
  $('#d-photo').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { $('#d-msg').className = 'form-msg err'; $('#d-msg').textContent = 'That photo is over 5 MB.'; e.target.value = ''; return; }
    pendingPhoto = f; previewPhoto(URL.createObjectURL(f));
  });
  $('#d-photo-remove').addEventListener('click', () => { pendingPhoto = null; previewPhoto(null, $('#d-pic').value); });
  $('#d-delete').addEventListener('click', async e => {
    const b = e.currentTarget;
    if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Press again to delete'; setTimeout(() => { delete b.dataset.confirm; b.textContent = 'Delete dish'; }, 4000); return; }
    const { error } = await sb.from('menu_items').delete().eq('id', editing.id);
    if (error) { $('#d-msg').className = 'form-msg err'; $('#d-msg').textContent = errText(error); return; }
    $('#dish-dlg').close(); loadMenuEditor();
  });
  $('#dish-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#d-msg'), name = $('#d-name').value.trim(), price = parseFloat($('#d-price').value);
    msg.className = 'form-msg err';
    if (!name) { msg.textContent = 'Enter a name.'; return; }
    if (!(price >= 0)) { msg.textContent = 'Enter a price.'; return; }
    msg.className = 'form-msg'; msg.textContent = 'Saving…';
    let photo_url = editing ? editing.photo_url : null;
    if (pendingPhoto) {
      const ext = pendingPhoto.type === 'image/png' ? 'png' : pendingPhoto.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${$('#d-cat').value}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await sb.storage.from('menu').upload(path, pendingPhoto, { contentType: pendingPhoto.type, cacheControl: '31536000' });
      if (error) { msg.className = 'form-msg err'; msg.textContent = 'Photo upload failed: ' + errText(error); return; }
      photo_url = sb.storage.from('menu').getPublicUrl(path).data.publicUrl;
    } else if (pendingPhoto === null) photo_url = null;
    const row = { name, category_id: $('#d-cat').value, price, picture: $('#d-pic').value.trim() || '🍽️', photo_url,
      ingredients: $('#d-ingr').value.trim(), tags: ['h', 'v', 's'].filter(t => $('#d-' + t).checked).join(''),
      available: $('#d-avail').checked, updated_at: new Date().toISOString() };
    const { error } = editing
      ? await sb.from('menu_items').update(row).eq('id', editing.id)
      : await sb.from('menu_items').insert({ ...row, sort: meItems.filter(i => i.category_id === row.category_id).length + 1 });
    if (error) { msg.className = 'form-msg err'; msg.textContent = errText(error); return; }
    $('#dish-dlg').close(); meCat = row.category_id; loadMenuEditor();
    toast('Saved', name + ' is updated on the menu.', 'ok');
  });
}

/* ---------- settings ---------- */
const SET_FIELDS = { 's-tables': 'total_tables', 's-seats': 'seats_per_table', 's-sitting': 'sitting_minutes', 's-open': 'open_time', 's-last': 'last_booking', 's-threshold': 'deposit_threshold', 's-percent': 'deposit_percent' };
async function loadSettingsTab() {
  const [{ data: st }, { data: sm }] = await Promise.all([
    sb.from('restaurant_settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('set_menus').select('*').order('sort')
  ]);
  if (st) Object.entries(SET_FIELDS).forEach(([id, k]) => { $('#' + id).value = /time/.test(k) || k === 'open_time' || k === 'last_booking' ? String(st[k]).slice(0, 5) : +st[k]; });
  $('#s-seats-txt').textContent = $('#s-seats').value;
  $('#setmenu-list').replaceChildren(...(sm || []).map(m => {
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
        msg.className = 'form-msg ' + (error ? 'err' : 'ok'); msg.textContent = error ? errText(error) : 'Saved.';
      } }, 'Save')));
  }));
}
function wireSettings() {
  $('#s-seats').addEventListener('input', () => { $('#s-seats-txt').textContent = $('#s-seats').value; });
  $('#set-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#set-msg'), row = { updated_at: new Date().toISOString() };
    Object.entries(SET_FIELDS).forEach(([id, k]) => { row[k] = k === 'open_time' || k === 'last_booking' ? $('#' + id).value : +$('#' + id).value; });
    if (row.last_booking <= row.open_time) { msg.className = 'form-msg err'; msg.textContent = 'Last booking must be after the first booking.'; return; }
    const { error } = await sb.from('restaurant_settings').update(row).eq('id', 1);
    msg.className = 'form-msg ' + (error ? 'err' : 'ok');
    msg.textContent = error ? (/check/i.test(error.message) ? 'One of the values is out of range.' : errText(error)) : 'Saved. The website uses the new settings straight away.';
  });
}

/* ---------- auto-pilot ---------- */
const AP_LABEL = { confirmed: 'Confirmed', needs_team: 'Left for the team', deposit_verified: 'Deposit verified', deposit_check: 'Payment to check', full_declined: 'Full — declined', full_released: 'Full — released', phone_booked: 'Phone booking', call_transfer: 'Call transferred', call_missed: 'Missed transfer' };
async function loadAutopilot() {
  const [{ data: st }, { data: log }, { data: pays }] = await Promise.all([
    sb.from('restaurant_settings').select('auto_confirm, auto_deposits, auto_full').eq('id', 1).maybeSingle(),
    sb.from('automation_log').select('*, reservations(code)').order('created_at', { ascending: false }).limit(80),
    sb.from('payments').select('*').order('received_at', { ascending: false }).limit(10)
  ]);
  if (st) { $('#ap-confirm').checked = st.auto_confirm; $('#ap-deposits').checked = st.auto_deposits; $('#ap-full').checked = st.auto_full; }
  $('#ap-log').replaceChildren(...((log || []).length ? log.map(l => h('li', { class: 'ap-row a-' + l.action },
    h('span', { class: 'pill' }, AP_LABEL[l.action] || l.action),
    h('span', { class: 'ap-detail' }, l.detail),
    h('time', { class: 'small muted' }, fmtAgo(l.created_at)))) : [h('li', { class: 'empty' }, 'Nothing yet. Actions appear here as bookings and payments arrive.')]));
  $('#ap-payments').replaceChildren(...((pays || []).length ? pays.map(p => h('li', {},
    h('b', {}, money(p.amount)), ' · ', p.reference || '—', ' · ', p.payer_name || 'no name', ' · ', p.provider,
    h('small', { class: 'block ' + (p.result === 'verified' ? 'ok-t' : 'warn') }, p.result === 'verified' ? 'Verified automatically' : p.result))) : [h('li', { class: 'empty' }, 'No payments received yet.')]));
}
function wireAutopilot() {
  $('#ap-form').addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await sb.from('restaurant_settings').update({ auto_confirm: $('#ap-confirm').checked, auto_deposits: $('#ap-deposits').checked, auto_full: $('#ap-full').checked, updated_at: new Date().toISOString() }).eq('id', 1);
    $('#ap-msg').className = 'form-msg ' + (error ? 'err' : 'ok'); $('#ap-msg').textContent = error ? errText(error) : 'Saved.';
  });
  $('#ap-test').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#t-msg'), code = $('#t-code').value.trim().toUpperCase(), amount = parseFloat($('#t-amount').value);
    if (!/^MH-[A-Z0-9]{6}$/.test(code)) { msg.className = 'form-msg err'; msg.textContent = 'Enter a code like MH-ABC123.'; return; }
    if (!(amount > 0)) { msg.className = 'form-msg err'; msg.textContent = 'Enter the amount.'; return; }
    const { data, error } = await sb.rpc('simulate_payment', { p_code: code, p_payer: $('#t-name').value.trim(), p_amount: amount });
    if (error) { msg.className = 'form-msg err'; msg.textContent = errText(error); return; }
    msg.className = 'form-msg ' + (data === 'verified' ? 'ok' : 'err');
    msg.textContent = data === 'verified' ? 'Verified: the deposit is marked paid and the booking confirmed.' : 'Not accepted: ' + data + '. The team was asked to check.';
    loadAutopilot(); reloadSoon();
  });
}

/* ---------- phone calls ---------- */
const CALL_STATUS = { live: 'Live now', booked: 'Booked', transferring: 'Putting through', transferred: 'Talked with the team', missed_transfer: 'Call back', ended: 'Ended', failed: 'Problem' };
const WHO = { guest: 'Guest', agent: 'Auto-pilot', system: '' };
let calls = [], callFilter = 'all';
const openCalls = new Set();
async function loadCalls() {
  const [{ data: st }, { data }] = await Promise.all([
    sb.from('phone_settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('calls').select('id, from_number, status, language, summary, transcript, started_at, ended_at, reservations(code)').order('started_at', { ascending: false }).limit(100)
  ]);
  if (st && document.activeElement?.closest('#ph-form') == null) { $('#ph-enabled').checked = st.enabled; $('#ph-team').value = st.team_phone || ''; $('#ph-lang').value = st.language; }
  calls = data || [];
  renderCalls();
}
function callMatches(c) {
  switch (callFilter) {
    case 'live': return c.status === 'live' || c.status === 'transferring';
    case 'booked': return c.status === 'booked';
    case 'team': return c.status === 'missed_transfer' || c.status === 'transferred' || c.status === 'failed';
    default: return true;
  }
}
function duration(c) {
  if (!c.ended_at) return '';
  const s = Math.max(0, Math.round((new Date(c.ended_at) - new Date(c.started_at)) / 1000));
  return ' · ' + (s >= 60 ? Math.floor(s / 60) + ' min ' : '') + (s % 60) + ' s';
}
function renderCalls() {
  const rows = calls.filter(callMatches);
  $('#call-list').replaceChildren(...(rows.length ? rows.map(c => {
    const said = (c.transcript || []);
    const last = c.summary || [...said].reverse().find(t => t.who === 'guest')?.text || '';
    const d = h('details', { class: 'call c-' + c.status },
      h('summary', {},
        h('span', { class: 'pill' }, CALL_STATUS[c.status] || c.status),
        h('span', { class: 'call-who' }, c.from_number ? h('a', { href: 'tel:' + c.from_number, onclick: e => e.stopPropagation() }, c.from_number) : 'Hidden number',
          c.reservations ? ' · ' + c.reservations.code : ''),
        h('time', { class: 'small muted' }, fmtAgo(c.started_at) + duration(c)),
        last ? h('span', { class: 'call-sum', dir: 'auto' }, last) : null),
      h('ul', { class: 'transcript' }, ...said.map(t => h('li', { class: 't-' + t.who, dir: 'auto' }, WHO[t.who] ? h('b', {}, WHO[t.who]) : null, t.text))));
    d.open = openCalls.has(c.id);
    d.addEventListener('toggle', () => { d.open ? openCalls.add(c.id) : openCalls.delete(c.id); });
    return h('li', {}, d);
  }) : [h('li', { class: 'empty' }, callFilter === 'all' ? 'No calls yet. Calls appear here as soon as the phone number is connected.' : 'Nothing here.')]));
}
function wireCalls() {
  $$('#call-filter button').forEach(b => b.addEventListener('click', () => {
    callFilter = b.dataset.f;
    $$('#call-filter button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderCalls();
  }));
  $('#ph-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#ph-msg'), raw = $('#ph-team').value.trim(), team = raw ? '+' + raw.replace(/\D/g, '') : null;
    if (team && !/^\+[0-9]{7,15}$/.test(team)) { msg.className = 'form-msg err'; msg.textContent = 'Enter the number with the country code, like +961 3 123 456.'; return; }
    const { error } = await sb.from('phone_settings').update({ enabled: $('#ph-enabled').checked, team_phone: team, language: $('#ph-lang').value, updated_at: new Date().toISOString() }).eq('id', 1);
    msg.className = 'form-msg ' + (error ? 'err' : 'ok');
    msg.textContent = error ? errText(error) : team ? 'Saved.' : 'Saved. Without a team phone, guests who ask for a person get a call back instead.';
    if (!error) $('#ph-team').value = team || '';
  });
}

/* ---------- tabs ---------- */
function showTab(name) {
  if (!isStaff) return;
  $$('.tab').forEach(t => { t.hidden = t.id !== 'tab-' + name; });
  $$('#team-tabs a').forEach(a => { const on = a.dataset.tab === name; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  if (name === 'feedback') loadFeedback();
  if (name === 'notifications') renderTeamNotifs();
  if (name === 'menu') loadMenuEditor();
  if (name === 'settings') loadSettingsTab();
  if (name === 'autopilot') loadAutopilot();
  if (name === 'calls') loadCalls();
}
const currentTab = () => (location.hash.slice(1) || 'reservations');

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
  $('#gate').hidden = isStaff; $('#team-tabs').hidden = !isStaff;
  $('#gate-msg').textContent = user && !isStaff ? `${user.email} is not on the team list. Ask the manager to add you, then sign in again.` : '';
  $('#gate-signin').hidden = !!user;
  if (!isStaff) { $$('.tab').forEach(t => { t.hidden = true; }); Bell.stop(); if (!user) Auth.open('in'); return; }
  Bell.start(user, { staff: true, onOpen: n => { $('#notif-panel').hidden = true; if (n.reservations) { $('#res-search').value = n.reservations.code; setFilter('all'); location.hash = 'reservations'; } } });
  resChannel = sb.channel('team-res').on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, reloadSoon).subscribe();
  callChannel = sb.channel('team-calls').on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => { if (!$('#tab-calls').hidden) loadCallsSoon(); }).subscribe();
  await loadAll();
  showTab(currentTab());
}
function setFilter(f) {
  filter = f;
  $$('#res-filter button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
  renderRes();
}

document.addEventListener('DOMContentLoaded', async () => {
  $('#gate-signin').addEventListener('click', () => Auth.open('in'));
  wireMenuEditor(); wireSettings(); wireAutopilot(); wireCalls();
  $('#team-out').addEventListener('click', () => Auth.signOut());
  $$('#res-filter button').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.f)));
  $('#res-search').addEventListener('input', renderRes);
  $('#cust-search').addEventListener('input', renderCustomers);
  window.addEventListener('hashchange', () => showTab(currentTab()));
  $$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $('#cancel-form').addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await sb.rpc('cancel_reservation', { p_id: cancelling.id, p_reason: $('#cancel-reason').value.trim() || null });
    if (error) { $('#cancel-msg').className = 'form-msg err'; $('#cancel-msg').textContent = errText(error); return; }
    $('#cancel-dlg').close(); reloadSoon();
  });
  document.addEventListener('mh:notification', () => { renderTeamNotifs(); reloadSoon(); if (!$('#tab-autopilot').hidden) loadAutopilot(); if (!$('#tab-calls').hidden) loadCallsSoon(); });
  // keep the notifications tab in step with the bell (read state, new items)
  const origRender = Bell.render.bind(Bell);
  Bell.render = () => { origRender(); if (!$('#tab-notifications').hidden) renderTeamNotifs(); };
  setInterval(() => { if (isStaff) renderRes(); }, 60000);  // attendance buttons unlock as time passes
  // live calls: refresh the transcript even if the realtime feed is quiet
  setInterval(() => { if (isStaff && !$('#tab-calls').hidden && calls.some(c => c.status === 'live' || c.status === 'transferring')) loadCalls(); }, 8000);
  Auth.onChange(onUser);
  await Auth.init();
});
