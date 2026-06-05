import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Temporarily hidden routes ──────────────────────────────────────────────
  // To re-enable contests: remove the redirects block below and uncomment the
  // Contests nav link in components/nav/Navbar.tsx
  async redirects() {
    return [
      {
        source:      '/clubs/:slug/contests',
        destination: '/clubs/:slug/dashboard',
        permanent:   false,
      },
      {
        source:      '/clubs/:slug/contests/:path*',
        destination: '/clubs/:slug/dashboard',
        permanent:   false,
      },
    ]
  },
};

export default nextConfig;
