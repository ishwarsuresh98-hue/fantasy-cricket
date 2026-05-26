// ── Slough CC Fantasy — Service Worker ────────────────────────────────────────
// Strategy:
//   • App-shell assets  → Cache-first (versioned cache, updated on install)
//   • Next.js pages     → Network-first with cache fallback
//   • API routes        → Network-only (never cache dynamic data)
//   • Push notifications → handled in the 'push' event listener

const CACHE_VERSION = 'v1'
const SHELL_CACHE   = `scc-shell-${CACHE_VERSION}`
const PAGES_CACHE   = `scc-pages-${CACHE_VERSION}`

// Static assets that form the app shell — always available offline
const SHELL_ASSETS = [
  '/',
  '/dashboard',
  '/manifest.json',
  '/slough-cc-crest.png',
  '/icon-192.png',
  '/icon-512.png',
]

// ── Install: pre-cache the app shell ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // addAll fails if any request fails; use individual fetches so a missing
      // icon doesn't block the entire shell install
      Promise.allSettled(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch(() => {
            console.warn(`[SW] Could not pre-cache: ${url}`)
          }),
        ),
      ),
    ).then(() => self.skipWaiting()),
  )
})

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== PAGES_CACHE)
          .map((k) => {
            console.log(`[SW] Deleting old cache: ${k}`)
            return caches.delete(k)
          }),
      ),
    ).then(() => self.clients.claim()),
  )
})

// ── Fetch: routing strategy ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 1. Never intercept non-GET or cross-origin requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // 2. API routes — network only
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) {
    return // let browser handle it
  }

  // 3. Static shell assets — cache first
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request)),
    )
    return
  }

  // 4. Next.js static chunks (hashed filenames) — cache first forever
  if (url.pathname.match(/\/_next\/static\//)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          const clone = res.clone()
          caches.open(SHELL_CACHE).then((c) => c.put(request, clone))
          return res
        })
      }),
    )
    return
  }

  // 5. Pages — network first, fall back to cache, then offline page
  event.respondWith(
    fetch(request)
      .then((res) => {
        const clone = res.clone()
        caches.open(PAGES_CACHE).then((c) => c.put(request, clone))
        return res
      })
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ??
            new Response(
              `<!doctype html><html lang="en"><head><meta charset="utf-8">
               <title>Slough CC Fantasy — Offline</title>
               <meta name="viewport" content="width=device-width,initial-scale=1">
               <style>
                 body{font-family:sans-serif;display:flex;align-items:center;
                      justify-content:center;min-height:100vh;margin:0;
                      background:#262162;color:#fff;text-align:center;padding:2rem}
                 h1{font-size:1.5rem;margin-bottom:.5rem}
                 p{color:rgba(255,255,255,.6);font-size:.9rem}
                 .logo{font-size:3rem;margin-bottom:1rem}
               </style>
              </head><body>
               <div>
                 <div class="logo">🏏</div>
                 <h1>You're offline</h1>
                 <p>Check your connection and try again.</p>
               </div>
              </body></html>`,
              {
                status: 200,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              },
            ),
        ),
      ),
  )
})

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Slough CC Fantasy', body: event.data.text() }
  }

  const {
    title = 'Slough CC Fantasy',
    body  = '',
    icon  = '/icon-192.png',
    badge = '/icon-192.png',
    url   = '/dashboard',
    tag,
    data  = {},
  } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data: { url, ...data },
      vibrate: [200, 100, 200],
      requireInteraction: false,
    }),
  )
})

// ── Notification click — open / focus the target page ────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url ?? '/dashboard'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Re-use an existing open tab if possible
        const existing = clients.find((c) => c.url.includes(self.location.origin))
        if (existing) {
          existing.focus()
          return existing.navigate(targetUrl)
        }
        return self.clients.openWindow(targetUrl)
      }),
  )
})
