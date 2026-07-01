/**
 * sw.js — Signage Service Worker (media offline cache)
 *
 * Goal: the kiosk keeps showing images even if the network blips, WITHOUT
 * re-introducing the old CORS-403 bug.
 *
 * The bug we must never repeat: a previous version cached media then re-fetched it
 * with `new Request(url)` (default = CORS mode). Sanity's image CDN FORBIDS CORS
 * (any request carrying an Origin header → 403), so every image broke.
 *
 * How this version stays safe:
 *   - It ONLY touches image GETs to cdn.sanity.io. Everything else (HTML, Sanity
 *     API, the weather/news proxies, and crucially VIDEO) passes straight through.
 *   - It fetches with the ORIGINAL request (an <img> request is already no-cors) or,
 *     for prewarm, with an explicit { mode: 'no-cors' } fetch → an *opaque* response.
 *     Opaque = no CORS enforcement → 200, never 403. Opaque responses render fine in
 *     <img>/CSS backgrounds and are cacheable.
 *
 * Why images only (not video): opaque responses can't be range-served, and <video>
 * needs range requests to play/seek. Caching video opaque would break playback, so
 * video is left to the browser's native HTTP cache.
 */

const MEDIA_CACHE = 'aquamx-media-v1';

// Sanity CDN images only. Video (.mp4/.webm/.mov) is deliberately excluded.
function isCacheableImage(url) {
  return /:\/\/cdn\.sanity\.io\//.test(url) &&
         /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url);
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop any OTHER cache (old broken CORS caches / previous versions); keep ours.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== MEDIA_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Cache-first for Sanity images; network fills the cache. Never intercepts anything
// else, so a bug here can't break HTML, video, or the weather/news proxies.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !isCacheableImage(req.url)) return;   // pass through

  event.respondWith((async () => {
    const cache = await caches.open(MEDIA_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;                       // offline-safe: serve stored copy
    try {
      const resp = await fetch(req);                 // img req is no-cors → opaque, no 403
      if (resp && (resp.ok || resp.type === 'opaque')) {
        cache.put(req, resp.clone()).catch(() => {});
      }
      return resp;
    } catch (err) {
      const fallback = await cache.match(req);
      if (fallback) return fallback;
      throw err;
    }
  })());
});

// Prewarm: the player posts its playlist media URLs on load. Pre-fetch the IMAGE
// ones (no-cors → opaque) so they're cached before the network is ever needed.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.action !== 'prewarm' || !Array.isArray(data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(MEDIA_CACHE);
    await Promise.all(
      data.urls.filter(isCacheableImage).map(async (url) => {
        if (await cache.match(url)) return;          // already cached
        try {
          const resp = await fetch(url, { mode: 'no-cors' });   // opaque — never CORS
          if (resp) await cache.put(url, resp.clone());
        } catch (_) { /* offline / transient — skip */ }
      })
    );
  })());
});
