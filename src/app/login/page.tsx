'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { AlembicLogo } from '@/components/AlembicLogo';
import { CheckCircle2 } from 'lucide-react';

const FEATURES = [
  'One place for all deviations, CAPAs, and validations',
  'Real-time project health across every team and site',
  'GxP-compliant audit trail built in from day one',
  'Connects MES, LIMS, TrackWise, and Documentum',
];

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

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await api('/auth/login', { method: 'POST', body: { email, password } });
      } else {
        await api('/auth/register', { method: 'POST', body: { email, password, name, title } });
      }
      router.replace('/');
      router.refresh();
    } catch (e: any) {
      setErr(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left: brand panel ─────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[52%] flex-col justify-between p-14 relative overflow-hidden"
        style={{ background: 'linear-gradient(150deg, #071223 0%, #0B1E3A 55%, #0D2347 100%)' }}
      >
        {/* Dot-grid texture */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
        }} />
        {/* Glow blob */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none" style={{
          background: 'radial-gradient(circle, rgba(23,105,200,0.18) 0%, transparent 70%)',
          transform: 'translate(30%, -30%)',
        }} />

        {/* Top: branding */}
        <div className="relative flex items-center gap-3">
          <AlembicLogo width={28} />
          <div>
            <div className="text-white font-bold text-sm tracking-tight leading-tight">Alembic Digital</div>
            <div style={{ fontSize: 9, letterSpacing: '0.16em' }} className="text-white/30 uppercase mt-0.5">
              Touching Lives over 100 years
            </div>
          </div>
        </div>

        {/* Centre: headline + features */}
        <div className="relative">
          <div style={{ fontSize: 11, letterSpacing: '0.2em' }} className="text-blue-400/70 uppercase font-bold mb-4 tracking-[0.2em]">
            Quality Informatics Platform
          </div>
          <h1
            className="font-black leading-none text-white"
            style={{ fontSize: 'clamp(52px, 5.5vw, 76px)', letterSpacing: '-0.03em' }}
          >
            Pragati.
          </h1>
          <div className="mt-5 w-10 h-0.5 rounded-full" style={{ background: '#1769C8' }} />
          <p className="mt-5 text-white/40 leading-relaxed max-w-xs" style={{ fontSize: 14 }}>
            Built for pharma QA teams who need more than a spreadsheet.
          </p>

          {/* Feature bullets */}
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <CheckCircle2 size={15} className="text-blue-400/70 shrink-0 mt-0.5" />
                <span className="text-white/50 leading-snug" style={{ fontSize: 13 }}>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom */}
        <div className="relative">
          <div style={{ fontSize: 11, fontStyle: 'italic' }} className="text-white/20 tracking-wide">
            Empowering Excellence through Technology
          </div>
          <div style={{ fontSize: 10 }} className="text-white/10 uppercase tracking-widest mt-1">
            Alembic Limited · Est. 1907 · Vadodara
          </div>
        </div>
      </div>

      {/* ── Right: form panel ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center items-center bg-white px-8 py-12 relative">

        {/* Subtle top bar accent */}
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'linear-gradient(90deg, #1565C0, #43A047)' }} />

        <div className="w-full max-w-[340px]">

          {/* App identity — no PNG, clean SVG + text */}
          <div className="flex flex-col items-center mb-10">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl mb-3 shadow-sm" style={{ background: '#0B1628' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-icon.png" alt="" width={28} height={28} style={{ display: 'block', objectFit: 'contain' }} />
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">Pragati</div>
            <div style={{ fontSize: 11, letterSpacing: '0.06em' }} className="text-slate-400 mt-1">
              by Alembic Digital
            </div>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {mode === 'login' ? 'Sign in to your workspace to continue.' : 'Join your team on Pragati.'}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Full name</label>
                  <input className="input" placeholder="Your name" required
                    value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Job title <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                  <input className="input" placeholder="e.g. Validation Engineer"
                    value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
              <input className="input" type="email" placeholder="you@alembic.com" required
                autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Password</label>
                {mode === 'login' && (
                  <a href="/forgot-password" className="text-xs text-blue-700 font-semibold hover:underline">
                    Forgot password?
                  </a>
                )}
              </div>
              <input className="input" type="password" required minLength={mode === 'register' ? 8 : 1}
                placeholder={mode === 'register' ? 'Min 8 characters' : '••••••••'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
              {mode === 'register' && <StrengthMeter password={password} />}
            </div>

            {err && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                {err}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 mt-1"
              style={{ background: 'linear-gradient(135deg, #1565C0, #1976D2)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Please wait…
                </span>
              ) : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-xs text-slate-300 font-medium">or</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          <p className="text-center text-xs text-slate-500">
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <button onClick={() => { setMode('register'); setErr(''); }}
                  className="text-blue-700 font-semibold hover:underline">
                  Register here
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => { setMode('login'); setErr(''); }}
                  className="text-blue-700 font-semibold hover:underline">
                  Sign in
                </button>
              </>
            )}
          </p>

          {/* Footer */}
          <div className="mt-10 text-center">
            <div style={{ fontSize: 10 }} className="text-slate-300">
              Pragati · Alembic Digital · Quality Informatics
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
