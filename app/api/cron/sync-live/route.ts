// ── GET /api/cron/sync-live ───────────────────────────────────────────────────
//
// Vercel cron job entry point — runs every 5 minutes.
// Forwards to POST /api/sync/live with the CRON_SECRET header.
//
// Configured in vercel.json:
//   { "crons": [{ "path": "/api/cron/sync-live", "schedule": "*/5 * * * *" }] }
//
// Vercel calls this as GET with the Authorization: Bearer <CRON_SECRET> header
// (set automatically by Vercel when the env var CRON_SECRET is present).

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Vercel cron passes Authorization: Bearer <CRON_SECRET>
  const authHeader  = req.headers.get('authorization') ?? ''
  const cronSecret  = process.env.CRON_SECRET ?? ''

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.VERCEL_URL
    ?? 'http://localhost:3000'

  const url = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`

  try {
    const res = await fetch(`${url}/api/sync/live`, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-cron-secret':  cronSecret,
      },
      body: '{}',
      signal: AbortSignal.timeout(55_000),   // just under Vercel's 60s cron timeout
    })

    const json = await res.json()
    return Response.json(json, { status: res.status })
  } catch (e: unknown) {
    console.error('[cron/sync-live] error:', e)
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
