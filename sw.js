/**
 * sw.js — Signage Service Worker (media offline cache)
 *
 * Goal: the kiosk keeps showing its playlist — images AND video — even if the
 * network blips or drops, WITHOUT re-introducing the old CORS-403 bug.
 *
 * Two Sanity CDNs, two different rules (learned the hard way):
 *   - IMAGE CDN  cdn.sanity.io/images/…  → FORBIDS CORS (any Origin header → 403).
 *       So images are cached from the ORIGINAL no-cors <img> request (or a
 *       { mode:'no-cors' } prewarm) → an *opaque* 200 that renders in <img> but
 *       whose bytes we can't read. Opaque is fine for <img>; useless for <video>.
 *   - FILE CDN   cdn.sanity.io/files/…   → ALLOWS CORS + Range (206). Verified:
 *       a request with Origin + Range returns 206 + Access-Control-Allow-Origin.
 *       So video CAN be fetched CORS (readable bytes) → cached in full → and each
 *       <video> Range request answered by slicing the cached buffer into a 206.
 *
 * Never fetch an IMAGE-CDN url in CORS mode (→ 403). Video is the opposite: it
 * MUST be CORS so the body is readable and sliceable.
 */

const MEDIA_CACHE = 'aquamx-media-v1';   // images (opaque)
const VIDEO_CACHE = 'aquamx-video-v1';   // full video files (readable, sliced on read)
const KEEP        = new Set([MEDIA_CACHE, VIDEO_CACHE]);

// Sanity IMAGE CDN, still-image extensions.
function isCacheableImage(url) {
  return /:\/\/cdn\.sanity\.io\/images\//.test(url) &&
         /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url);
}

// Sanity FILE CDN, video extensions. (files/ allows CORS + Range → cacheable.)
function isCacheableVideo(url) {
  return /:\/\/cdn\.sanity\.io\/files\//.test(url) &&
         /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop any OTHER cache (old broken CORS caches / previous versions); keep ours.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // pass through
  if (isCacheableVideo(req.url)) { event.respondWith(serveVideo(req));  return; }
  if (isCacheableImage(req.url)) { event.respondWith(serveImage(req));  return; }
  // Everything else (HTML, Sanity API, weather/news proxies) is untouched.
});

// ── Images: cache-first, opaque-safe (unchanged behaviour) ───────────────────
async function serveImage(req) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;                              // offline-safe
  try {
    const resp = await fetch(req);                        // <img> req is no-cors → opaque, no 403
    if (resp && (resp.ok || resp.type === 'opaque')) {
      cache.put(req, resp.clone()).catch(() => {});
    }
    return resp;
  } catch (err) {
    const fallback = await cache.match(req);
    if (fallback) return fallback;
    throw err;
  }
}

// ── Video: range-responder over a fully-cached file ──────────────────────────
// <video> asks for byte ranges; the Cache API can't store a 206, so we cache the
// whole file once (a CORS 200 we CAN read) and synthesise a 206 by slicing it.
async function serveVideo(req) {
  const cache = await caches.open(VIDEO_CACHE);

  // Ensure the full file is cached (fetch WITHOUT a Range header → 200 full body).
  if (!(await cache.match(req.url))) {
    try {
      const full = await fetch(req.url, { mode: 'cors' }); // file CDN allows CORS → readable 200
      if (full && full.status === 200) {
        await cache.put(req.url, full.clone());
      } else {
        return full;                                       // unexpected (e.g. 206) → just pass network response
      }
    } catch (err) {
      // Offline and never cached → nothing we can do; let <video> get the error.
      throw err;
    }
  }

  const cached = await cache.match(req.url);
  const range  = req.headers.get('range');
  if (!range) return cached.clone();                       // no Range → whole file (200)

  // Parse a single byte range. Handles "bytes=start-end", "bytes=start-" (open),
  // and the suffix form "bytes=-N" (last N bytes — some players read the moov atom
  // at the tail of a non-faststart file this way). Serve the slice as a 206.
  const buf  = await cached.arrayBuffer();
  const size = buf.byteLength;
  const m    = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start, end;
  if (m[1] === '' && m[2] !== '') {                         // suffix range: last N bytes
    start = Math.max(0, size - parseInt(m[2], 10));
    end   = size - 1;
  } else {
    start = m[1] ? parseInt(m[1], 10) : 0;
    end   = m[2] ? parseInt(m[2], 10) : size - 1;
  }
  if (isNaN(start) || start < 0)        start = 0;
  if (isNaN(end)   || end > size - 1)   end   = size - 1;
  if (start > end || start >= size)   { start = 0; end = size - 1; }

  // Common case (bytes=0-) covers the whole file → reuse the buffer, no extra copy.
  const body = (start === 0 && end === size - 1) ? buf : buf.slice(start, end + 1);
  return new Response(body, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type':   cached.headers.get('Content-Type') || 'video/mp4',
      'Content-Range':  `bytes ${start}-${end}/${size}`,
      'Content-Length': String(body.byteLength),
      'Accept-Ranges':  'bytes',
      'Cache-Control':  'public, max-age=31536000',
    },
  });
}

// ── Prewarm: player posts the playlist's media URLs on load ──────────────────
// Images → opaque (no-cors). Videos → CORS full download, so they're ready to
// play offline before ever cycling into view. Also purges cached videos that are
// no longer in the current playlist (keeps the big cache bounded).
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.action !== 'prewarm' || !Array.isArray(data.urls)) return;

  event.waitUntil((async () => {
    const imgCache = await caches.open(MEDIA_CACHE);
    const vidCache = await caches.open(VIDEO_CACHE);

    const wantedVideos = new Set(data.urls.filter(isCacheableVideo));

    // Evict videos that dropped out of the playlist.
    for (const request of await vidCache.keys()) {
      if (!wantedVideos.has(request.url)) await vidCache.delete(request);
    }

    // THROTTLED, PRIORITISED fetch — never Promise.all the whole list.
    // Firing every URL at once (slides + menu cards + logos + full videos)
    // saturates condo wifi exactly while the on-air slide images are still
    // downloading/decoding → the box GPU composites half-decoded textures and
    // keeps them (the recurring "half-rendered slide" bug). Images run first
    // (player posts slide URLs before menu URLs, order preserved) a few at a
    // time; videos go LAST, one at a time — they're the multi-MB hogs.
    const fetchImage = async (url) => {
      if (await imgCache.match(url)) return;
      const resp = await fetch(url, { mode: 'no-cors' });         // opaque — never CORS
      if (resp) await imgCache.put(url, resp.clone());
    };
    const fetchVideo = async (url) => {
      if (await vidCache.match(url)) return;                      // already cached
      const resp = await fetch(url, { mode: 'cors' });            // readable full 200
      if (resp && resp.status === 200) await vidCache.put(url, resp.clone());
    };
    const runQueue = async (urls, worker, concurrency) => {
      let i = 0;
      await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
        while (i < urls.length) {
          const url = urls[i++];
          try { await worker(url) } catch (_) { /* offline / transient — fetch handler retries on demand */ }
        }
      }));
    };
    const images = data.urls.filter(isCacheableImage);
    const videos = data.urls.filter(isCacheableVideo);
    await runQueue(images, fetchImage, 3);
    await runQueue(videos, fetchVideo, 1);
  })());
});
