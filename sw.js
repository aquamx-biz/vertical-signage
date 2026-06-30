/**
 * sw.js — Signage Service Worker (NEUTERED)
 *
 * Why this is empty of media logic:
 *   The previous version did cache-first interception of cross-origin media and
 *   re-fetched it in CORS mode ("CORS mode; Sanity CDN allows it"). That was
 *   WRONG — Sanity's image/file CDN FORBIDS CORS: any request carrying an Origin
 *   header gets 403 Forbidden. So whenever this SW was active (e.g. on Edge), the
 *   re-fetch 403'd and every image/video broke. Browsers normally load <img> /
 *   <video> in *no-cors* mode, which Sanity allows (200) — which is exactly why
 *   the proven projects (lumpini-24, no active SW) display media fine.
 *
 *   This SW therefore intercepts NOTHING: with no 'fetch' listener the browser
 *   fetches all media natively (no-cors → 200). On activate it purges the old
 *   broken cache so any previously-stored 403/failed responses are removed.
 *
 *   Kept (instead of deleting the file) so an already-installed old SW updates to
 *   this harmless version and stops breaking media.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k))); // purge old broken media cache
    await self.clients.claim();
  })());
});

// No 'fetch' listener on purpose — media loads natively (no-cors) via the browser.
