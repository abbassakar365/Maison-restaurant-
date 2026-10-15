/* Maison Hamra service worker — shared by the customer app (scope ./) and the
   team app (team/sw.js imports this file, scope ./team/).
   Shows Web Push alerts even when the app is closed, and opens the right page on tap. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const ROOT = self.registration.scope.replace(/team\/$/, '');
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
    const open = wins.find(w => w.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); return open.navigate ? open.navigate(url) : null; }
    return self.clients.openWindow(url);
  })());
});
