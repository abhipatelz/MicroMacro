'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { PragatiMark } from '@/components/PragatiMark';

function StrengthMeter({ password }: { password: string }) {
  const checks = [
    { label: '8+ chars', ok: password.length >= 8 },
    { label: 'A–Z',      ok: /[A-Z]/.test(password) },
    { label: 'a–z',      ok: /[a-z]/.test(password) },
    { label: '0–9',      ok: /[0-9]/.test(password) },
    { label: '#!@',      ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const barColor = score <= 2 ? '#EF4444' : score <= 3 ? '#F59E0B' : '#22C55E';
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map((i) => (
          <div key={i} className="h-1 flex-1 rounded-sm transition-all duration-200"
            style={{ background: i <= score ? barColor : '#E2E8F0' }} />
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        {checks.map((c) => (
          <span key={c.label} style={{ fontSize: 10 }} className={c.ok ? 'text-green-600' : 'text-slate-400'}>
            {c.ok ? '✓' : '·'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setErr('Missing reset token. Please use the link from your email.');
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    setErr('');
    setLoading(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, newPassword: password } });
      setDone(true);
      setTimeout(() => router.replace('/login'), 3000);
    } catch (e: any) {
      setErr(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-10">
          <PragatiMark size={56} />
          <div className="text-xl font-black text-slate-900 mt-3 tracking-tight">Pragati</div>
        </div>

        {done ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900">Password reset!</h2>
            <p className="text-sm text-slate-500">Redirecting you to sign in…</p>
            <Link href="/login" className="block text-sm text-blue-700 font-semibold hover:underline">
              Go to sign in now
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-black text-slate-900 mb-1">Set new password</h2>
            <p className="text-sm text-slate-500 mb-8">Must be at least 8 characters.</p>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  New password
                </label>
                <input
                  className="input"
                  type="password"
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  autoFocus
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <StrengthMeter password={password} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Confirm password
                </label>
                <input
                  className="input"
                  type="password"
                  placeholder="Repeat password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {confirm && password !== confirm && (
                  <p className="text-xs text-red-500 mt-1">Passwords don't match.</p>
                )}
              </div>

              {err && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  {err}{' '}
                  {(err.includes('expired') || err.includes('Invalid')) && (
                    <Link href="/forgot-password" className="font-semibold underline">Request a new link</Link>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !token}
                className="w-full py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-60 transition-opacity"
                style={{ background: '#1565C0' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving…
                  </span>
                ) : 'Reset password'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-400">
              <Link href="/login" className="text-blue-700 font-semibold hover:underline">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><span className="text-slate-400 text-sm">Loading…</span></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
