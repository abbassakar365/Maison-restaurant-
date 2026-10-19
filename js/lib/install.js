/* "Install the app" buttons. Chrome, Edge and Samsung Internet offer a real install window;
   Safari on iPhone and Mac only allows "Add to Home Screen" / "Add to Dock" by hand, so we
   show the steps instead. */
import { $, $$ } from './dom.js';
import { toast } from './notify.js';
import { isIOS, isInstalled, inCustomerAppWindow } from './push.js';

let installEvent = null;

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; updateInstallButtons(); });
window.addEventListener('appinstalled', () => {
  installEvent = null;
  updateInstallButtons(true);
  toast('Installed', 'Open it from your home screen or apps list.', 'ok');
});

function installSteps() {
  if (inCustomerAppWindow()) return 'This window is the Maison Hamra guest app. Open this admin page in Chrome or Edge (not from the guest app) and press the button again to install MH Admin as its own app.';
  const ua = navigator.userAgent;
  if (isIOS) return 'On iPhone or iPad: open this page in Safari, tap the Share button (the square with an arrow), then “Add to Home Screen”.';
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) return 'On Mac with Safari: choose File → “Add to Dock”.';
  if (/Firefox/.test(ua)) return /Android/.test(ua) ? 'In Firefox: tap the ⋮ menu, then “Install” or “Add to Home screen”.' : 'Firefox on computers can’t install apps. Open this page in Chrome or Edge and press the button again.';
  if (/Android/.test(ua)) return 'Tap your browser’s ⋮ menu, then “Install app” or “Add to Home screen”.';
  return 'In Chrome or Edge, click the install icon at the right end of the address bar, or open the ⋮ menu → “Install”.';
}

function updateInstallButtons(justInstalled = false) {
  for (const btn of $$('[data-install]')) {
    const label = $('span', btn);
    const done = justInstalled || isInstalled();
    btn.disabled = done;
    if (done && label) label.textContent = 'Installed on this device';
    const help = btn.closest('.install-card')?.querySelector('.install-help');
    if (help && done) help.hidden = true;
  }
}

export function wireInstall() {
  for (const btn of $$('[data-install]')) {
    btn.addEventListener('click', async () => {
      const help = btn.closest('.install-card')?.querySelector('.install-help');
      if (installEvent) {
        installEvent.prompt();
        const { outcome } = await installEvent.userChoice;
        installEvent = null;
        if (outcome !== 'accepted' && help) { help.hidden = false; help.textContent = 'No problem — you can install it any time from this button.'; }
        return;
      }
      if (help) { help.hidden = false; help.textContent = installSteps(); }
    });
  }
  updateInstallButtons();
}
