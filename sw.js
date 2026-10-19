/* Maison Hamra service worker — the customer app's (scope ./). The admin app has its
   own worker, admin/sw.js, scoped to ./admin/.
   Shows Web Push alerts even when the app is closed, and opens the right page on tap. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const ROOT = self.registration.scope;
const ICON = ROOT + 'icons/icon-192.png';   // large colour picture in the alert
const BADGE = ROOT + 'icons/badge-96.png';  // small one-colour symbol in the phone's status bar

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    // the open app already chimes and shows a pop-up — skip the system alert while it is in front
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(d.title || 'Maison Hamra', {
      body: d.body || '', tag: d.tag, renotify: !!d.tag, icon: ICON, badge: BADGE,
      vibrate: [120, 60, 120], data: { url: d.url || self.registration.scope }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find(w => w.url.startsWith(ROOT) && !w.url.startsWith(ROOT + 'admin/'));
    if (open) { await open.focus(); return open.navigate ? open.navigate(url) : null; }
    return self.clients.openWindow(url);
  })());
});

// Page loads go to the network as usual; when the phone is offline, show a short notice
// instead of the browser's error page. Having this handler also lets every browser offer
// "Install app" (Samsung Internet and older Chrome require one).
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>Offline · Maison Hamra</title><body style="font-family:Georgia,serif;background:#faf7f2;color:#1c1917;'
  + 'display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center">'
  + '<div><h1 style="font-weight:normal">You are offline</h1><p>Check your connection, then pull to refresh.</p></div>';
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
