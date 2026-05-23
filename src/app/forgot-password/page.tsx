'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { PragatiMark } from '@/components/PragatiMark';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (e: any) {
      // Only surfaces in dev when SMTP is misconfigured
      setErr(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4 relative">
      <div className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: 'linear-gradient(90deg, #1565C0 0%, #1769C8 50%, #2B8C29 100%)' }} />

      <div className="w-full max-w-sm">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-10">
          <PragatiMark size={56} />
          <div className="text-xl font-black text-slate-900 mt-3 tracking-tight">Pragati</div>
        </div>

        {sent ? (
          <div className="text-center space-y-4 page-enter">
            <div className="w-14 h-14 rounded-full bg-forest-50 border border-forest-100 flex items-center justify-center mx-auto"
              style={{ boxShadow: '0 6px 18px rgba(67,160,71,0.18)' }}>
              <svg width="26" height="26" fill="none" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" stroke="#43A047" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900">Check your email</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              If <strong>{email}</strong> is registered, you&rsquo;ll receive a reset link shortly. Check your spam folder too.
            </p>
            <Link href="/login" className="inline-block text-sm text-brand-700 font-semibold hover:underline mt-2">
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <div className="page-enter">
            <h2 className="text-2xl font-black text-slate-900 mb-1">Forgot password?</h2>
            <p className="text-sm text-slate-500 mb-5">
              Ask any teammate with lead access to open <strong>People</strong> →
              click your name → <strong>Reset password</strong>. They&rsquo;ll get
              a temporary password to share with you, no email needed.
            </p>
            <div className="mb-7 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 leading-relaxed">
              Email-based reset is also available below if your administrator
              has configured SMTP for this workspace.
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@company.com"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {err && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-snug">
                  {err}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="btn-primary w-full justify-center py-3 text-sm font-bold"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    Sending…
                  </>
                ) : 'Send reset link'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-400">
              Remembered it?{' '}
              <Link href="/login" className="text-brand-700 font-semibold hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
