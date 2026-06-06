'use client';
/**
 * Shell side-effects island — loaded with `{ ssr: false }` from AppShell so
 * these effects fire AFTER the sidebar and nav have already hydrated and
 * become interactive. This keeps them off the critical hydration pass:
 *
 *   • Idle auto-logout timer (21 CFR Part 11 §11.10(d)) — attaches 6 window
 *     event listeners + a 30s setInterval. Heavy to register; not needed at
 *     first paint.
 *   • ForcePasswordModal — only shown when mustChangePassword is set, which
 *     is rare. No reason to include its condition in the main hydration.
 *   • SetPinModal — deferred onboarding, second-visit-only.
 *   • FirstTimeTour — runs once ever; no reason it should hydrate with the shell.
 *   • Idle session warning modal — appears at 25 min idle; never on first load.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/client/api';
import type { CurrentUser } from './AppShell';

const ForcePasswordModal = dynamic(
  () => import('./ForcePasswordModal').then(m => m.ForcePasswordModal),
  { ssr: false, loading: () => null },
);
const SetPinModal = dynamic(
  () => import('./SetPinModal').then(m => m.SetPinModal),
  { ssr: false, loading: () => null },
);
const FirstTimeTour = dynamic(
  () => import('./FirstTimeTour').then(m => m.FirstTimeTour),
  { ssr: false, loading: () => null },
);

export function ShellEffects({ user, dark }: { user: CurrentUser; dark: boolean }) {
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());

  const [mustChangePw, setMustChangePw] = useState(!!user.mustChangePassword);
  const [idleWarning,  setIdleWarning]  = useState(false);
  const [needsPin,     setNeedsPin]     = useState(false);

  // ── Idle auto-logout (21 CFR Part 11 §11.10(d)) ──────────────────────
  // Unattended GxP sessions must not remain open. 25 min → warning;
  // 30 min → force sign-out.
  useEffect(() => {
    const WARN_MS = 25 * 60 * 1_000;
    const IDLE_MS = 30 * 60 * 1_000;

    const mark = () => { lastActivityRef.current = Date.now(); setIdleWarning(false); };
    const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;
    EVENTS.forEach((ev) => window.addEventListener(ev, mark, { passive: true }));

    const iv = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_MS) {
        clearInterval(iv);
        setIdleWarning(false);
        api('/auth/logout', { method: 'POST' }).finally(() => {
          router.replace('/login');
          router.refresh();
        });
      } else if (idle >= WARN_MS) {
        setIdleWarning(true);
      }
    }, 30_000);

    return () => {
      clearInterval(iv);
      EVENTS.forEach((ev) => window.removeEventListener(ev, mark));
    };
  }, [router]);

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      {/* ── Force-password gate ──────────────────────────────────── */}
      {mustChangePw && (
        <ForcePasswordModal onDone={() => { setMustChangePw(false); router.refresh(); }} />
      )}

      {/* ── Onboarding tour — runs once per user ─────────────────── */}
      {!mustChangePw && !needsPin && (
        <FirstTimeTour alreadySeen={user.hasSeenTour !== false} />
      )}

      {/* ── Quick-PIN setup — second visit onward ────────────────── */}
      {!mustChangePw && needsPin && (
        <SetPinModal
          onDone={() => { setNeedsPin(false); router.refresh(); }}
          onDismiss={async () => {
            setNeedsPin(false);
            try { await api('/me/pin-prompt-dismissed', { method: 'POST' }); } catch { /* best-effort */ }
          }}
        />
      )}

      {/* ── Idle session warning ─────────────────────────────────── */}
      {idleWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div
            className="w-[320px] rounded-2xl p-6 flex flex-col gap-4 text-center shadow-2xl"
            style={{
              background: dark ? '#262624' : '#ffffff',
              border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #e2e8f0',
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
              style={{ background: dark ? 'rgba(245,158,11,0.12)' : '#FEF3C7' }}
            >
              <AlertTriangle size={22} className="text-amber-500" />
            </div>
            <div>
              <div className={`text-base font-bold ${dark ? 'text-white/90' : 'text-slate-800'}`}>
                Still there?
              </div>
              <div className={`text-xs mt-1 leading-snug ${dark ? 'text-white/45' : 'text-slate-500'}`}>
                You'll be signed out in 5 minutes due to inactivity.
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { lastActivityRef.current = Date.now(); setIdleWarning(false); }}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-colors"
                style={
                  dark
                    ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.8)' }
                    : { background: '#F1F5F9', color: '#475569' }
                }
              >
                Continue
              </button>
              <button
                onClick={logout}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-red-500 transition-colors"
                style={dark ? { background: 'rgba(239,68,68,0.18)' } : { background: '#FEF2F2' }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
