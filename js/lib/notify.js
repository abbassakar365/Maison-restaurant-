/* In-page notifications: toasts, the chime and the vibration pattern. */
import { $, h } from './dom.js';
import { ROOT } from './supabase.js';

const TOAST_MS = 6000;

/** Show a toast. kind: 'info' | 'ok' | 'warn' | 'error'. onClick makes it tappable. */
export function toast(title, body, kind = 'info', onClick) {
  const box = $('#toasts');
  if (!box) return;
  const el = h('div', { class: 'toast ' + kind, role: kind === 'error' ? 'alert' : 'status' },
    h('img', { class: 'toast-icon', src: ROOT + 'icons/icon-192.png', alt: '', width: 36, height: 36 }),
    h('div', { class: 'toast-text' }, h('strong', {}, title), body ? h('span', {}, body) : null));
  if (onClick) {
    el.classList.add('clickable');
    el.addEventListener('click', () => { onClick(); el.remove(); });
  }
  box.append(el);
  setTimeout(() => el.classList.add('out'), TOAST_MS);
  setTimeout(() => el.remove(), TOAST_MS + 600);
}

let audio = null;
// browsers only allow sound after a user gesture: create the context on the first tap
document.addEventListener('pointerdown', () => {
  if (!audio) {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
  }
  if (audio && audio.state === 'suspended') audio.resume();
}, { passive: true });

/** A short two-note chime plus a vibration on phones. */
export function chime() {
  if (audio) {
    const t = audio.currentTime;
    for (const [freq, delay] of [[880, 0], [1318.5, 0.14]]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.6);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.65);
    }
  }
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
}
