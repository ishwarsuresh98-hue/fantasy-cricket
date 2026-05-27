'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignupPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.session) {
      // Email confirmation is disabled — user is logged in immediately
      if (whatsapp.trim()) {
        await supabase.from('profiles').update({ whatsapp_number: whatsapp.trim() }).eq('id', data.user!.id)
      }
      router.push('/dashboard')
      router.refresh()
    } else {
      // Email confirmation is enabled — ask them to check their inbox
      setCheckEmail(true)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, #C9A84C 0, #C9A84C 1px, transparent 0, transparent 50%)',
        backgroundSize: '20px 20px'
      }} />

      <div className="relative w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/the-xi-logo.svg" alt="The XI" style={{ height: 100 }} />
          </div>
          <h1 className="text-3xl font-extrabold text-[#0b0b0b] tracking-tight">THE XI</h1>
          <p className="text-[#C9A84C] font-semibold mt-0.5">Fantasy Cricket</p>
        </div>

        <Card className="shadow-2xl border-0">
          {checkEmail ? (
            <CardContent className="pt-8 pb-8 text-center space-y-3">
              <div className="text-5xl">📧</div>
              <h2 className="text-lg font-bold text-[#C9A84C]">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a confirmation link to <span className="font-semibold">{email}</span>.
                Click it to activate your account, then come back to sign in.
              </p>
              <Link href="/login" className="block mt-4">
                <Button variant="outline" className="w-full">Back to Sign In</Button>
              </Link>
            </CardContent>
          ) : (
            <>
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl text-[#C9A84C]">Create Account</CardTitle>
              </CardHeader>
              <form onSubmit={handleSignup}>
                <CardContent className="space-y-4">
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
                      {error}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="displayName">Your Name</Label>
                    <Input
                      id="displayName"
                      type="text"
                      placeholder="e.g. Ravi Kumar"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Min. 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={6}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="whatsapp">WhatsApp Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input
                      id="whatsapp"
                      type="tel"
                      placeholder="+44 7700 900000"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">We&apos;ll send you deadline reminders and score updates via WhatsApp.</p>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-3">
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Creating account...' : 'Create Account'}
                  </Button>
                  <p className="text-sm text-muted-foreground text-center">
                    Already have an account?{' '}
                    <Link href="/login" className="text-[#C9A84C] hover:underline font-semibold">
                      Sign in
                    </Link>
                  </p>
                </CardFooter>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
