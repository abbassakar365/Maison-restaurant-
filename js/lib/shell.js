/* Boots the parts every page shares: icons, config text, dialogs, the bell and install buttons. */
import { $, $$, paintIcons } from './dom.js';
import { CONFIG } from '../config.js';
import { fillCountryCodes } from './auth.js';
import { wireBell } from './bell.js';
import { wireInstall } from './install.js';

export function bootShell() {
  paintIcons();
  $$('select.cc').forEach(fillCountryCodes);
  $$('[data-cfg]').forEach((el) => { el.textContent = CONFIG[el.dataset.cfg] ?? ''; });
  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());
  // dialogs: close buttons and a click on the backdrop
  $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
  // remember which reservation a "Pay deposit" link is for (read by the pay page)
  document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest('a[href*="pay.html?r="]');
    if (link) try { sessionStorage.setItem('mh-pay-r', new URL(link.href).searchParams.get('r')); } catch { /* storage blocked */ }
  }, true);
  wireBell();
  wireInstall();
}
