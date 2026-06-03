import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ── Domain → club slug mapping ────────────────────────────────────────────────
// Add new club domains here as they go live.
const CLUB_DOMAINS: Record<string, string> = {
  'sloughfantasycricket.co.uk': 'slough-cc',
}

// ── Routes that never require authentication ───────────────────────────────────
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/auth/callback',
  '/xi',           // The XI platform hub
  '/club-home',    // Public club landing pages
  '/api/webhook',  // Stripe webhook — must be publicly accessible
  '/api/webhooks', // Additional webhook endpoints
  '/api/wise',     // Wise API routes — handle their own auth internally
]

export async function proxy(request: NextRequest) {
  const rawHost = request.headers.get('host') ?? ''
  // Strip www. prefix and port so "www.sloughfantasycricket.co.uk" and
  // "sloughfantasycricket.co.uk" both match the same key.
  const hostname = rawHost.replace(/^www\./, '').replace(/:\d+$/, '')
  const { pathname } = request.nextUrl

  // ── Domain-based rewrites (root path only) ────────────────────────────────
  // These happen before auth so that public landing pages aren't gated.
  //
  //  the-xi.app/              → /xi         (The XI platform hub)
  //  sloughfantasycricket.co.uk/ → /club-home/slough-cc  (club public landing)
  //
  if (pathname === '/') {
    if (hostname === 'the-xi.app') {
      const url = request.nextUrl.clone()
      url.pathname = '/xi'
      return NextResponse.rewrite(url)
    }

    const clubSlug = CLUB_DOMAINS[hostname]
    if (clubSlug) {
      const url = request.nextUrl.clone()
      url.pathname = `/club-home/${clubSlug}`
      return NextResponse.rewrite(url)
    }
  }

  // ── Supabase session refresh ───────────────────────────────────────────────
  // Must happen on every request so the session token stays fresh.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // ── Public routes — always accessible ─────────────────────────────────────
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return supabaseResponse
  }

  // ── Protected routes — redirect to login if not authenticated ─────────────
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
