import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PWARegister from "@/components/PWARegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The XI",
  description: "Multi-club fantasy cricket platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "The XI",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icon-192.png",
    icon:  "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor:       "#0b0b0b",
  width:            "device-width",
  initialScale:     1,
  maximumScale:     1,
  userScalable:     false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* iOS home-screen icon (belt-and-braces alongside metadata.icons) */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* iOS splash / status bar */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-full flex flex-col">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
