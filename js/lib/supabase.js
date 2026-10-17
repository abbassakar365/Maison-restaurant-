/* The Supabase client, the app identity (customer site or team app) and the site root.
   The vendor bundle js/vendor/supabase.js is loaded as a classic script before any module
   and exposes window.supabase. */
import { CONFIG } from '../config.js';

/** 'team' inside the team app, 'customer' everywhere else — set with <html data-app="team">. */
export const APP = document.documentElement.dataset.app === 'team' ? 'team' : 'customer';

/** Absolute URL of the site root (the folder that holds index.html), with a trailing slash. */
export const ROOT = new URL('../../', import.meta.url).href;

/** Resolve a stored photo path: absolute URLs stay as they are, repo paths are served from the root. */
export const assetUrl = (path) => (/^(https?:)?\/\//.test(path) ? path : ROOT + path.replace(/^\/+/, ''));

export const sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // the team app keeps its own sign-in, separate from the customer site on the same device
    storageKey: APP === 'team' ? 'mh-team-auth' : 'mh-auth'
  }
});
