/* Phone notifications: service worker registration and Web Push.
   With push on, alerts reach the phone even when the app is closed: the database hands
   each new notification to the `push` Edge Function, which sends it to the subscriptions
   saved here. */
import { CONFIG } from '../config.js';
import { sb, APP, ROOT } from './supabase.js';
import { toast, chime } from './notify.js';

export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const alertsAllowed = () => 'Notification' in window && Notification.permission === 'granted';

let registration = null;
let pushOn = false;
export const isPushOn = () => pushOn;

const swUrl = ROOT + (APP === 'team' ? 'team/sw.js' : 'sw.js');
export const swReady = 'serviceWorker' in navigator
  ? navigator.serviceWorker.register(swUrl).then(() => navigator.serviceWorker.ready).then((r) => (registration = r)).catch(() => null)
  : Promise.resolve(null);

const base64UrlToBytes = (s) => {
  const padded = s + '='.repeat((4 - s.length % 4) % 4);
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** Register this device for push and save the subscription for the signed-in user. */
export async function pushSubscribe(user) {
  const reg = await swReady;
  if (!reg || !('PushManager' in window) || !alertsAllowed() || !user) return false;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(CONFIG.vapidPublicKey) });
    const json = sub.toJSON();
    const { error } = await sb.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_app: APP });
    pushOn = !error;
  } catch {
    pushOn = false;
  }
  return pushOn;
}

export async function pushUnsubscribe() {
  const reg = await swReady;
  const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await sb.rpc('remove_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => {});
  pushOn = false;
}

/** Ask for notification permission, then subscribe. Returns true when alerts are on. */
export async function enableAlerts(user) {
  if (isIOS && !isInstalled()) {
    toast('Add to Home Screen first', 'On iPhone, tap Share → Add to Home Screen, open Maison Hamra from there, then turn alerts on.', 'warn');
    return false;
  }
  if (!('Notification' in window)) {
    toast('Not supported', 'This browser cannot show phone alerts.', 'error');
    return false;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('Alerts blocked', 'Allow notifications for this site in your browser settings.', 'error');
    return false;
  }
  const push = await pushSubscribe(user);
  chime();
  toast('Alerts on', push ? 'You will get updates on this phone even when the app is closed.' : 'You will get a pop-up and a sound while the app is open.', 'ok');
  return true;
}

/** A system notification while the tab is in the background (push handles the closed-app case). */
export function systemAlert(title, body, tag) {
  if (pushOn || !alertsAllowed() || (document.visibilityState === 'visible' && document.hasFocus())) return;
  const options = { body, tag, icon: ROOT + 'icons/icon-192.png', badge: ROOT + 'icons/badge-96.png', vibrate: [120, 60, 120] };
  if (registration) registration.showNotification(title, options);
  else try { new Notification(title, options); } catch { /* not allowed here */ }
}
