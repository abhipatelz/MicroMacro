import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { ToastProvider } from '@/components/Toast';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata: Metadata = {
  title: {
    default: "Pragati: A Bird's-Eye View of Your Projects",
    template: '%s · Pragati',
  },
  description:
    "Pragati — a bird's-eye view of your projects. Minimal, focused project intelligence for team leads.",
  // Favicon is supplied by src/app/icon.svg via the Next.js file convention.
  robots: { index: false, follow: false },
};

export const viewport = {
  themeColor: '#1565C0',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Server-side theme resolution → paints <html class="dark"> on the first
  // byte, before any JS executes. Hydration-safe, no flash-of-light.
  const dark = cookies().get('theme')?.value === 'dark';

  return (
    <html lang="en" className={dark ? 'dark' : undefined}>
      <head />
      <body>
        <ToastProvider>{children}</ToastProvider>
        {/* Vercel telemetry — already ships with defer; loading them at the
            end of <body> keeps them off the critical path. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
