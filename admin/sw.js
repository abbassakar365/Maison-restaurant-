/* MH Admin service worker — the admin app's own worker, scoped to /admin/ and separate from
   the customer app's (../sw.js), so the two install and update as different apps.
   Shows Web Push alerts with the admin icon even when the app is closed, and opens the admin
   page on tap. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const SCOPE = self.registration.scope;                    // …/admin/
const ICON = new URL('../icons/admin-192.png', SCOPE).href; // large colour picture in the alert
const BADGE = new URL('../icons/badge-96.png', SCOPE).href; // small one-colour symbol in the status bar

// Pages opened by the admin app carry this marker, so the page knows it runs in MH Admin
// (and not in the customer app's window, whose scope also covers /admin/).
const inAdminApp = (url) => {
  const u = new URL(url, SCOPE);
  if (u.href.startsWith(SCOPE)) u.searchParams.set('source', 'admin-app');
  return u.href;
};

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    // the open app already chimes and shows a pop-up — skip the system alert while it is in front
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(d.title || 'MH Admin', {
      body: d.body || '', tag: d.tag, renotify: !!d.tag, icon: ICON, badge: BADGE,
      vibrate: [120, 60, 120], data: { url: d.url || SCOPE }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || SCOPE;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find(w => w.url.startsWith(SCOPE));
    if (open) { await open.focus(); return open.navigate ? open.navigate(url) : null; }
    return self.clients.openWindow(inAdminApp(url));
  })());
});

// Page loads go to the network as usual; when the device is offline, show a short notice
// instead of the browser's error page. Having this handler also lets every browser offer
// "Install app" (Samsung Internet and older Chrome require one).
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>Offline · MH Admin</title><body style="font-family:Georgia,serif;background:#1c1917;color:#faf7f2;'
  + 'display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center">'
  + '<div><h1 style="font-weight:normal">You are offline</h1><p>Check your connection, then pull to refresh.</p></div>';
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
