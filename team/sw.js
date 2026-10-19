/* The team app moved to /admin/. This replaces the old service worker so phones that installed it stop using it. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister()));
