import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service — The XI Fantasy Cricket',
  description: 'Terms of service for The XI Fantasy Cricket platform.',
}

const sections = [
  { title: '1. Acceptance of Terms', content: 'By accessing or using The XI Fantasy Cricket ("The XI"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the platform.' },
  { title: '2. Eligibility', content: 'You must be at least 13 years old to use The XI. By creating an account, you confirm you meet this requirement.' },
  {
    title: '3. Accounts',
    items: [
      'You are responsible for maintaining the confidentiality of your account credentials.',
      'You are responsible for all activity that occurs under your account.',
      'Notify us immediately of any unauthorised use at hello@the-xi.app.',
      'We reserve the right to suspend or terminate accounts that violate these terms.',
    ],
  },
  {
    title: '4. Platform Rules',
    content: 'Users must not:',
    items: [
      'Submit false or misleading information',
      'Attempt to manipulate scores, points, or leaderboards',
      'Use automated tools or bots to interact with the platform',
      'Harass, abuse, or harm other users',
      'Attempt to reverse-engineer or exploit the platform',
      'Use the platform for any unlawful purpose',
    ],
  },
  {
    title: '5. Fantasy Contests',
    items: [
      'The XI offers free-to-play fantasy cricket contests for registered users.',
      'Points are calculated based on real cricket match data sourced from Play Cricket.',
      'Points calculations are final once confirmed. We reserve the right to correct data errors.',
      'We do not guarantee the accuracy or timeliness of match data.',
      'Paid contest features, where available, are subject to additional terms and applicable laws.',
    ],
  },
  { title: '6. Intellectual Property', content: 'All content, branding, design, and code on The XI is owned by or licensed to The XI Fantasy Cricket. You may not reproduce or distribute any part of the platform without prior written permission.' },
  { title: '7. Disclaimer of Warranties', content: 'The XI is provided "as is" without warranties of any kind. We do not guarantee uninterrupted or error-free access to the platform.' },
  { title: '8. Limitation of Liability', content: 'To the fullest extent permitted by law, The XI shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform.' },
  { title: '9. Changes to Terms', content: 'We may update these terms at any time. Continued use of the platform following changes constitutes acceptance of the revised terms.' },
  { title: '10. Governing Law', content: 'These terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.' },
  { title: '11. Contact', content: 'For any queries regarding these terms, contact us at hello@the-xi.app or visit https://the-xi.app' },
]

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0f0e1a] text-white">
      <header className="border-b border-white/10">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link href="/" className="group">
            <span className="text-2xl font-black tracking-tight text-white group-hover:text-[#C9A84C] transition-colors">
              The <span className="text-[#C9A84C]">XI</span>
            </span>
          </Link>
          <Link href="/privacy" className="text-sm text-white/40 hover:text-[#C9A84C] transition-colors">
            Privacy Policy →
          </Link>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-6 pt-14 pb-10">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#C9A84C] mb-3">Legal</p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">Terms of Service</h1>
        <p className="text-white/40 text-sm">Last updated: 2 June 2026</p>
      </div>
      <div className="max-w-3xl mx-auto px-6 pb-8">
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-6">
          <p className="text-white/70 text-sm leading-relaxed">
            These Terms of Service govern your use of The XI Fantasy Cricket platform. Please read them carefully. By creating an account, you agree to be bound by these terms.
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
          </div>
        ))}
      </div>
      <footer className="border-t border-white/10">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/30 text-xs">© 2026 The XI Fantasy Cricket. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-xs text-white/40 hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-xs text-[#C9A84C]">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
