/* DOM helpers shared by every page: query shortcuts, a safe element builder
   and the inline SVG icon set. */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/**
 * Build an element: h('p', { class: 'x', onclick: fn }, 'text', child).
 * Strings become text nodes, never HTML, so user content is always safe.
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

const ICON_PATHS = {
  bell: 'M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1z',
  user: 'M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z',
  phone: 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .57 3.6 1 1 0 0 1-.25 1z',
  instagram: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zm5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm0 2a2.5 2.5 0 1 0 2.5 2.5A2.5 2.5 0 0 0 12 9.5zm5.25-3.75a1 1 0 1 1-1 1 1 1 0 0 1 1-1z',
  pin: 'M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z',
  close: 'M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4z',
  lock: 'M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4zm2 11a2 2 0 1 1 2-2 2 2 0 0 1-2 2z',
  bank: 'M12 2 2 7v2h20V7zM4 11v7h3v-7zm6.5 0v7h3v-7zM17 11v7h3v-7zM2 20v2h20v-2z',
  card: 'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4H4V6h16zM4 12h16v6H4zm2 3h5v1.5H6z',
  wallet: 'M21 7H5a1 1 0 0 1 0-2h14V3H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zm-3 8a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 18 15z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4z',
  download: 'M11 3h2v9.6l3.3-3.3 1.4 1.4L12 16.4l-5.7-5.7 1.4-1.4 3.3 3.3zM5 18h14v2H5z',
  clock: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 10.6 3.7 2.2-.8 1.3L11 13V7h2z',
  leaf: 'M6.05 8.05a7.001 7.001 0 0 0-.02 9.88c1.47-3.4 4.09-6.24 7.36-7.93A15.952 15.952 0 0 0 8 19.32c2.6 1.23 5.8.78 7.95-1.37C19.43 14.47 20 4 20 4S9.53 4.57 6.05 8.05z',
  halal: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  chili: 'M16.2 6.2c2.6-.6 5.3 1.3 5 4.6-.5 6.3-9 11.9-17.8 10.9-.8-.1-1-1-.3-1.4C10.5 17.4 14.5 13 14.6 8.7c0-1 .6-2 1.6-2.5zM16.2 6.2c-.6-1.9.3-3.5 2.2-4 .6 1.5-.1 3.2-2.2 4z',
  cow: 'M12 7c3.3 0 5.5 2.9 5.5 6.5S15.3 21 12 21s-5.5-3.9-5.5-7.5S8.7 7 12 7zM6.8 9.2c-1.6-.9-3.6-.7-4.8.4 1.1 1.3 3 1.9 4.8 1.4zM17.2 9.2c1.6-.9 3.6-.7 4.8.4-1.1 1.3-3 1.9-4.8 1.4zM8.5 7.5C7.4 6.3 7 4.9 7.2 3c1.6.6 2.7 1.8 3.1 3.6zM15.5 7.5c1.1-1.2 1.5-2.6 1.3-4.5-1.6.6-2.7 1.8-3.1 3.6zM9.1 11.5a.9.9 0 1 0 1.8 0a.9.9 0 1 0-1.8 0zM13.1 11.5a.9.9 0 1 0 1.8 0a.9.9 0 1 0-1.8 0z',
  drumstick: 'M9.5 8.5a6 6 0 1 0 12 0a6 6 0 1 0-12 0zM10.6 11.4l2 2-6.2 6.2-2-2zM2.7 17.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0zM4.7 19.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0z',
  fish: 'M2.5 12c2.3-4.2 5.4-6.3 9-6.3 3.4 0 6.2 2 8.5 6.3-2.3 4.3-5.1 6.3-8.5 6.3-3.6 0-6.7-2.1-9-6.3zM19.2 12l3.3-4.2v8.4zM5.9 10.6a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0z',
  wheat: 'M11.4 21V11h1.2v10zM12 2c1.5 1.5 2 3 2 4.5S13 9 12 10c-1-1-2-2-2-3.5S10.5 3.5 12 2zM11.6 11c-3 0-5-1.5-5-4.5 3 0 5 1.5 5 4.5zM12.4 11c3 0 5-1.5 5-4.5-3 0-5 1.5-5 4.5zM11.6 15c-3 0-5-1.5-5-4.5 3 0 5 1.5 5 4.5zM12.4 15c3 0 5-1.5 5-4.5-3 0-5 1.5-5 4.5zM11.6 19c-3 0-5-1.5-5-4.5 3 0 5 1.5 5 4.5zM12.4 19c3 0 5-1.5 5-4.5-3 0-5 1.5-5 4.5z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  star: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z'
};

export function icon(name, className = 'ico') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[name] || '');
  svg.append(path);
  return svg;
}

/** Replace every <i data-icon="name"> placeholder with its SVG. */
export function paintIcons(root = document) {
  $$('i[data-icon]', root).forEach((el) => el.replaceWith(icon(el.dataset.icon, el.className || 'ico')));
}

/** Show a validation message under a field (or clear it with an empty string). */
export function setFieldError(id, message = '') {
  const el = document.getElementById(id);
  if (el) el.textContent = message;
}

/** Set a form message with a tone: '', 'ok' or 'err'. */
export function setMessage(el, text, tone = '') {
  if (!el) return;
  el.className = 'form-msg' + (tone ? ' ' + tone : '');
  el.textContent = text;
}
