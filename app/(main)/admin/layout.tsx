import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:underline">Home</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Admin</span>
      </div>

      {/* Admin sub-nav */}
      <div className="flex gap-2 border-b pb-4 flex-wrap">
        {[
          { href: '/admin', label: 'Overview' },
          { href: '/admin/players', label: 'Players' },
          { href: '/admin/matches', label: 'Matches' },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="px-4 py-2 rounded-md text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
          >
            {label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  )
}
