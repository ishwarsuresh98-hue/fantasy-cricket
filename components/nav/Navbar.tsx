'use client'

import Link from 'next/link'
import Image from 'next/image'
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
  { href: '/transfers', label: 'Transfers' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/matches', label: 'Matches' },
  { href: '/rules', label: 'Rules' },
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
    <nav className="sticky top-0 z-50 bg-[#262162] border-b border-[#1a1748] shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-white">
            <Image
              src="/slough-cc-crest.png"
              alt="Slough Cricket Club"
              width={40}
              height={40}
              className="rounded-full object-contain bg-white p-0.5"
              priority
            />
            <div className="hidden sm:block leading-tight">
              <span className="text-white font-extrabold tracking-tight">SLOUGH CC</span>
              <span className="text-[#fbf927] ml-1.5 font-semibold text-sm">Fantasy</span>
            </div>
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname === href || pathname.startsWith(href + '/')
                    ? 'bg-[#fbf927] text-[#262162] font-semibold'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
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
                    ? 'bg-[#b5211e] text-white font-semibold'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
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
                <button className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/10 transition-colors" />
              }
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-[#fbf927] text-[#262162] text-sm font-bold">
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
