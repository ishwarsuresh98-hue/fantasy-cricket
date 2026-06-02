import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — The XI Fantasy Cricket',
  description: 'Privacy policy for The XI Fantasy Cricket platform.',
}

const sections = [
  {
    title: '1. Who We Are',
    content: `The XI Fantasy Cricket ("The XI", "we", "our") is a fantasy cricket platform that lets cricket clubs run their own fantasy leagues powered by real match data. Our contact email is: hello@the-xi.app`,
  },
  {
    title: '2. What Data We Collect',
    items: [
      'Account Data: your name, email address, and encrypted password via Supabase Auth.',
      'Profile Data: cricket club affiliation, username, and profile preferences.',
      'Usage Data: team selections, points history, contest entries, and app activity.',
      'Device Data: device type, OS version, and push notification tokens (opt-in only).',
    ],
    footer: 'We do not collect payment information directly. Any paid features use third-party processors (e.g. Stripe) governed by their own privacy policies.',
  },
  {
    title: '3. How We Use Your Data',
    items: [
      'Create and manage your account',
      'Calculate and display fantasy points from real match data',
      'Run leaderboards and contests',
      'Send push notifications for match updates (opt-in only)',
      'Improve the platform and fix issues',
    ],
    footer: 'We do not sell your personal data to third parties.',
  },
  {
    title: '4. Data Sharing',
    content: 'We share data only with the following service providers:',
    items: [
      'Supabase — database and authentication infrastructure',
      'Vercel — hosting and deployment',
      'Resend — transactional email delivery',
      'Play Cricket API — to sync match and player data',
    ],
  },
  {
    title: '5. Data Retention',
    content: 'We retain your account data for as long as your account is active. You may request deletion at any time by emailing hello@the-xi.app. We will action valid deletion requests within 30 days.',
  },
  {
    title: '6. Your Rights (UK GDPR)',
    content: 'Under UK GDPR, you have the right to:',
    items: [
      'Access the personal data we hold about you',
      'Correct inaccurate data',
      'Request deletion of your data',
      'Object to processing',
      'Data portability',
    ],
    footer: 'To exercise any of these rights, contact us at hello@the-xi.app',
  },
  {
    title: '7. Cookies',
    content: 'The XI uses essential cookies only for authentication sessions. We do not use advertising or tracking cookies.',
  },
  {
    title: "8. Children's Privacy",
    content: 'The XI is not intended for users under the age of 13. If you believe a child has provided us with personal data, please contact us at hello@the-xi.app.',
  },
  {
    title: '9. Changes to This Policy',
    content: 'We may update this policy from time to time and will notify users of significant changes via the app or email.',
  },
  {
    title: '10. Contact',
    content: 'For any privacy-related queries, contact us at hello@the-xi.app or visit https://the-xi.app',
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0f0e1a] text-white">
      <header className="border-b border-white/10">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link href="/" className="group">
            <span className="text-2xl font-black tracking-tight text-white group-hover:text-[#C9A84C] transition-colors">
              The <span className="text-[#C9A84C]">XI</span>
            </span>
          </Link>
          <Link href="/terms" className="text-sm text-white/40 hover:text-[#C9A84C] transition-colors">
            Terms of Service →
          </Link>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-6 pt-14 pb-10">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#C9A84C] mb-3">Legal</p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">Privacy Policy</h1>
        <p className="text-white/40 text-sm">Last updated: 2 June 2026</p>
      </div>
      <div className="max-w-3xl mx-auto px-6 pb-8">
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-6">
          <p className="text-white/70 text-sm leading-relaxed">
            This Privacy Policy explains how The XI Fantasy Cricket collects, uses, and protects your personal data. We are committed to handling your data responsibly and in compliance with UK GDPR.
          </p>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 pb-24 space-y-10">
        {sections.map((section) => (
          <div key={section.title} className="border-t border-white/10 pt-8">
            <h2 className="text-lg font-bold text-[#C9A84C] mb-4">{section.title}</h2>
            {section.content && <p className="text-white/60 text-sm leading-relaxed mb-3">{section.content}</p>}
            {section.items && (
              <ul className="space-y-2 mb-3">
                {section.items.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-white/60">
                    <span className="text-[#C9A84C] mt-0.5 flex-shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
            {section.footer && <p className="text-white/40 text-sm leading-relaxed mt-3">{section.footer}</p>}
          </div>
        ))}
      </div>
      <footer className="border-t border-white/10">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/30 text-xs">© 2026 The XI Fantasy Cricket. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-xs text-[#C9A84C]">Privacy Policy</Link>
            <Link href="/terms" className="text-xs text-white/40 hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
