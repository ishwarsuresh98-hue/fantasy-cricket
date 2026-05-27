'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Club } from '@/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import NotificationBell from '@/components/nav/NotificationBell'
import NavCountdown from '@/components/nav/NavCountdown'

interface NavbarProps {
  profile: Profile
  club?: Club | null
}

function buildNavLinks(slug: string | null) {
  if (!slug) {
    // The XI homepage — no club-scoped links
    return []
  }
  const base = `/clubs/${slug}`
  return [
    { href: `${base}/dashboard`,   label: 'Dashboard' },
    { href: `${base}/team`,        label: 'My Team' },
    { href: `${base}/transfers`,   label: 'Transfers' },
    { href: `${base}/leaderboard`, label: 'Leaderboard' },
    { href: `${base}/contests`,    label: 'Contests' },
    { href: `${base}/teams`,       label: 'Teams' },
    { href: `${base}/matches`,     label: 'Matches' },
    { href: `${base}/rules`,       label: 'Rules' },
  ]
}

export default function Navbar({ profile, club }: NavbarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const slug     = club?.slug ?? null
  const navLinks = buildNavLinks(slug)

  const homeHref = slug ? `/clubs/${slug}/dashboard` : '/'
  const adminHref = slug ? `/clubs/${slug}/admin` : '/admin'

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-50 bg-[#111111] border-b border-[#1a1a1a] shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">

          {/* Logo */}
          <Link href={homeHref} className="flex items-center gap-2.5 font-bold text-white">
            {club?.logo_url ? (
              <Image
                src={club.logo_url}
                alt={`${club.name} crest`}
                width={40}
                height={40}
                className="rounded-full object-contain bg-[#111111] p-0.5"
                priority
              />
            ) : club ? (
              /* Club without logo */
              <div className="w-10 h-10 rounded-full bg-[#111111]/20 flex items-center justify-center text-xl">
                🏏
              </div>
            ) : (
              /* The XI — text-only logo */
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#C9A84C]">
                <span className="text-[#C9A84C] font-black text-sm">XI</span>
              </div>
            )}
            <div className="hidden sm:block leading-tight">
              {club ? (
                <>
                  <span className="text-white font-extrabold tracking-tight">{club.name.toUpperCase()}</span>
                  <span className="text-[#C9A84C] ml-1.5 font-semibold text-sm">Fantasy</span>
                </>
              ) : (
                <>
                  <span className="text-white font-extrabold tracking-tight">THE</span>
                  <span className="text-[#C9A84C] ml-1.5 font-black tracking-tight">XI</span>
                </>
              )}
            </div>
          </Link>

          {/* Nav links (club-scoped only) */}
          {navLinks.length > 0 && (
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname === href || pathname.startsWith(href + '/')
                      ? 'bg-[#C9A84C] text-[#C9A84C] font-semibold'
                      : 'text-white/80 hover:bg-[#111111]/10 hover:text-white'
                  }`}
                >
                  {label}
                </Link>
              ))}
              {profile.role === 'admin' && (
                <Link
                  href={adminHref}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname.startsWith(adminHref)
                      ? 'bg-[#b5211e] text-white font-semibold'
                      : 'text-white/80 hover:bg-[#111111]/10 hover:text-white'
                  }`}
                >
                  Admin
                </Link>
              )}
            </div>
          )}

          {/* Gameweek countdown */}
          <NavCountdown />

          {/* Notification bell */}
          <NotificationBell />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#111111]/10 transition-colors" />
              }
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-[#C9A84C] text-[#C9A84C] text-sm font-bold">
                  {profile.display_name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-sm font-medium text-white">{profile.display_name}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{profile.display_name}</p>
                <p className="text-xs text-muted-foreground capitalize">{profile.role}</p>
              </div>
              <DropdownMenuSeparator />
              <div className="md:hidden">
                {navLinks.map(({ href, label }) => (
                  <DropdownMenuItem key={href} render={<Link href={href} />}>
                    {label}
                  </DropdownMenuItem>
                ))}
                {profile.role === 'admin' && navLinks.length > 0 && (
                  <DropdownMenuItem render={<Link href={adminHref} />}>
                    Admin Panel
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </div>
              {/* Back to The XI hub if inside a club */}
              {club && (
                <>
                  <DropdownMenuItem render={<Link href="/" />}>
                    ← All Clubs
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={handleSignOut} className="text-red-600 cursor-pointer">
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>
    </nav>
  )
}
