'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
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

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/team', label: 'My Team' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/matches', label: 'Matches' },
]

interface NavbarProps {
  profile: Profile
}

export default function Navbar({ profile }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg text-emerald-700">
            <span className="text-2xl">🏏</span>
            <span className="hidden sm:block">Fantasy Cricket</span>
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname === href || pathname.startsWith(href + '/')
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {label}
              </Link>
            ))}
            {profile.role === 'admin' && (
              <Link
                href="/admin"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname.startsWith('/admin')
                    ? 'bg-amber-50 text-amber-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                Admin
              </Link>
            )}
          </div>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className={cn(buttonVariants({ variant: 'ghost' }), 'flex items-center gap-2 px-2')} />
              }
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-semibold">
                  {profile.display_name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-sm font-medium">{profile.display_name}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{profile.display_name}</p>
                <p className="text-xs text-muted-foreground capitalize">{profile.role}</p>
              </div>
              <DropdownMenuSeparator />
              {/* Mobile nav links */}
              <div className="md:hidden">
                {NAV_LINKS.map(({ href, label }) => (
                  <DropdownMenuItem key={href} render={<Link href={href} />}>
                    {label}
                  </DropdownMenuItem>
                ))}
                {profile.role === 'admin' && (
                  <DropdownMenuItem render={<Link href="/admin" />}>
                    Admin Panel
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </div>
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
