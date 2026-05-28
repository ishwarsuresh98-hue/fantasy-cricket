import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import Link from 'next/link'

export default async function ClubAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'admin') redirect(`/clubs/${slug}/dashboard`)

  const base = `/clubs/${slug}/admin`

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/clubs/${slug}/dashboard`} className="hover:underline">Home</Link>
        <span>/</span>
        <span className="text-[#0b0b0b] font-medium">Admin</span>
      </div>

      <div className="flex gap-2 border-b pb-4 flex-wrap">
        {[
          { href: base,                 label: 'Overview'   },
          { href: `${base}/players`,    label: 'Players'    },
          { href: `${base}/matches`,    label: 'Matches'    },
          { href: `${base}/boosters`,   label: 'Boosters'   },
          { href: `${base}/transfers`,  label: 'Transfers'  },
          { href: `${base}/contests`,           label: 'Contests'          },
          { href: `${base}/contest-templates`, label: 'Contest Templates' },
          { href: `${base}/sync`,              label: '⚡ Sync'            },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="px-4 py-2 rounded-md text-sm font-medium bg-[#fef9ee] text-[#C9A84C] hover:bg-[#fef3d0] transition-colors"
          >
            {label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  )
}
