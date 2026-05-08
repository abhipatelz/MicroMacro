'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { CheckCircle2, ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';

const FEATURES = [
  { text: 'Unified task management across every team and project',  accent: false },
  { text: 'Real-time project health, KPIs, and attention feed',     accent: false },
  { text: 'AI-powered risk triage and insights — built in',         accent: true  },
  { text: 'Lifecycle templates for any industry workflow',          accent: false },
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
  const barColor = score <= 2 ? '#EF4444' : score <= 3 ? '#F59E0B' : '#43A047';
  const labels = ['', 'Very weak', 'Weak', 'Okay', 'Strong', 'Excellent'];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5 fade-in-soft">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 flex-1">
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="h-1 flex-1 rounded-sm transition-all duration-300"
              style={{ background: i <= score ? barColor : '#E2E8F0' }} />
          ))}
        </div>
        <span style={{ fontSize: 10, color: barColor }} className="font-semibold tabular-nums w-[64px] text-right">
          {labels[score]}
        </span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {checks.map((c) => (
          <span key={c.label} style={{ fontSize: 10 }} className={`transition-colors ${c.ok ? 'text-forest-600 font-medium' : 'text-slate-300'}`}>
            {c.ok ? '✓' : '·'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  // mode: 'login' = normal sign-in | 'setup' = first-run workspace setup
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // Check if this is a fresh workspace (no users yet)
  useEffect(() => {
    api<{ initialized: boolean }>('/system/status').then((d) => {
      if (!d.initialized) setIsFirstRun(true);
    }).catch(() => {});
  }, []);

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
    <>
      <style>{`
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%       { opacity: 0.80; transform: scale(1.06); }
        }
        @keyframes logo-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in-soft {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer-line {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes orbit {
          from { transform: rotate(0deg) translateX(180px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(180px) rotate(-360deg); }
        }
        .logo-float    { animation: logo-float 5s ease-in-out infinite; }
        .fade-up       { animation: fade-up 0.6s ease-out forwards; }
        .fade-up-1     { animation: fade-up 0.6s 0.1s ease-out both; }
        .fade-up-2     { animation: fade-up 0.6s 0.2s ease-out both; }
        .fade-up-3     { animation: fade-up 0.6s 0.3s ease-out both; }
        .fade-in-soft  { animation: fade-in-soft 0.35s ease-out both; }
        .form-swap     { animation: fade-in-soft 0.35s ease-out both; }
        .shimmer-line::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
          animation: shimmer-line 2.6s ease-in-out infinite;
        }
        .orbit-dot { animation: orbit 18s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .logo-float, .orbit-dot, .shimmer-line::after { animation: none !important; }
          .fade-up, .fade-up-1, .fade-up-2, .fade-up-3, .fade-in-soft, .form-swap { animation-duration: 0.01ms !important; }
        }
      `}</style>

      <div className="min-h-screen flex">

        {/* ════ LEFT — Brand panel ════════════════════════════════════════ */}
        <div
          className="hidden lg:flex lg:w-[54%] flex-col relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #050E1D 0%, #091828 40%, #0B1F3A 70%, #0C2347 100%)' }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />
          <div className="absolute pointer-events-none" style={{
            top: '18%', left: '50%', transform: 'translateX(-50%)',
            width: 480, height: 480, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(21,101,192,0.22) 0%, transparent 65%)',
            animation: 'glow-pulse 6s ease-in-out infinite',
          }} />
          <div className="absolute pointer-events-none" style={{
            bottom: '-10%', right: '-10%', width: 360, height: 360, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(43,160,71,0.14) 0%, transparent 70%)',
          }} />

          {/* Subtle orbiting accent dots — visual delight */}
          <div className="absolute pointer-events-none" style={{ top: '24%', left: '50%' }}>
            <div className="orbit-dot" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#1E88E5', boxShadow: '0 0 12px rgba(30,136,229,0.7)',
            }} />
          </div>
          <div className="absolute pointer-events-none" style={{ top: '28%', left: '50%', animationDelay: '-9s' }}>
            <div className="orbit-dot" style={{
              width: 4, height: 4, borderRadius: '50%',
              background: '#43A047', boxShadow: '0 0 10px rgba(67,160,71,0.7)',
              animationDelay: '-9s',
            }} />
          </div>

          <div className="relative flex flex-col flex-1 px-14 py-12">
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex justify-center mb-10 logo-float">
                <div style={{
                  background: '#ffffff', borderRadius: 20, padding: '22px 40px',
                  boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.5),
                              0 8px 24px rgba(21,101,192,0.25), inset 0 1px 0 rgba(255,255,255,0.9)`,
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-full.png" alt="Pragati" style={{ height: 52, width: 'auto', display: 'block' }} />
                </div>
              </div>

              <div className="fade-up-1 text-center" style={{ fontSize: 10, letterSpacing: '0.22em' }}>
                <span className="text-blue-400/60 uppercase font-bold">Project Intelligence Platform</span>
              </div>

              <h1 className="fade-up-2 text-center font-black text-white mt-3 leading-none"
                style={{ fontSize: 'clamp(58px, 5.8vw, 80px)', letterSpacing: '-0.035em' }}>
                Pragati.
              </h1>

              <div className="fade-up-2 flex justify-center mt-5">
                <div className="relative h-0.5 w-16 rounded-full overflow-hidden shimmer-line"
                  style={{ background: 'linear-gradient(90deg, #1769C8, #43A047)' }} />
              </div>

              <p className="fade-up-3 text-center text-white/40 mt-4 leading-relaxed mx-auto max-w-xs" style={{ fontSize: 14 }}>
                Built for teams who care about execution, visibility, and continuous improvement.
              </p>

              <ul className="fade-up-3 mt-9 space-y-3 max-w-xs mx-auto w-full">
                {FEATURES.map((f) => (
                  <li key={f.text} className="flex items-start gap-3">
                    <CheckCircle2 size={15} className="shrink-0 mt-0.5"
                      style={{ color: f.accent ? '#43A047' : 'rgba(96,165,250,0.7)' }} />
                    <span style={{ fontSize: 13, color: f.accent ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.42)' }}
                      className="leading-snug">{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-center pb-2">
              <div style={{ fontSize: 11, fontStyle: 'italic' }} className="text-white/18 tracking-wide">
                Progress over perfection — every day
              </div>
              <div style={{ fontSize: 10 }} className="text-white/10 uppercase tracking-[0.18em] mt-1.5">
                Pragati · Project Intelligence · v2
              </div>
            </div>
          </div>
        </div>

        {/* ════ RIGHT — Form panel ════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col justify-center items-center bg-white px-8 py-12 relative">
          <div className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: 'linear-gradient(90deg, #1565C0 0%, #1769C8 50%, #2B8C29 100%)' }} />

          <div className="w-full max-w-[340px] fade-up">

            {/* Mobile branding */}
            <div className="flex flex-col items-center mb-8 lg:hidden">
              <div style={{ background: '#0B1628', borderRadius: 12, padding: '8px 16px', display: 'inline-flex', alignItems: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-icon.png" alt="" width={24} height={24} style={{ display: 'block', objectFit: 'contain' }} />
              </div>
              <div className="text-xl font-black text-slate-900 mt-2 tracking-tight">Pragati</div>
            </div>

            {/* First-run banner — forest accent signals fresh workspace */}
            {isFirstRun && mode === 'login' && (
              <div className="mb-6 rounded-xl border border-forest-200 bg-forest-50 px-4 py-3 flex items-start gap-3 fade-in-soft">
                <Sparkles size={16} className="text-forest-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-forest-800">Welcome to Pragati!</div>
                  <div className="text-xs text-forest-700 mt-0.5 leading-snug">
                    No accounts yet.{' '}
                    <button onClick={() => { setMode('setup'); setErr(''); }}
                      className="font-bold underline hover:no-underline">
                      Set up your workspace
                    </button>
                    {' '}to get started.
                  </div>
                </div>
              </div>
            )}

            {/* Heading */}
            <div className="mb-7 form-swap" key={mode + '-h'}>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                {mode === 'login' ? 'Welcome back' : 'Set up workspace'}
              </h2>
              <p className="text-sm text-slate-400 mt-1 leading-snug">
                {mode === 'login'
                  ? 'Sign in to your Pragati workspace.'
                  : 'Create the first PM account. You can add team members later.'}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4 form-swap" key={mode + '-f'}>
              {mode === 'setup' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full name</label>
                    <input className="input" placeholder="Your name" required
                      value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Job title <span className="normal-case font-normal text-slate-300">(optional)</span>
                    </label>
                    <input className="input" placeholder="e.g. Product Manager"
                      value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email</label>
                <input className="input" type="email" placeholder="you@company.com" required
                  autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Password</label>
                  {mode === 'login' && (
                    <a href="/forgot-password" className="text-xs text-blue-600 font-semibold hover:text-blue-800 transition-colors">
                      Forgot password?
                    </a>
                  )}
                </div>
                <input className="input" type="password" required minLength={mode === 'setup' ? 8 : 1}
                  placeholder={mode === 'setup' ? 'Min 8 characters' : '••••••••'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password} onChange={(e) => setPassword(e.target.value)} />
                {mode === 'setup' && <StrengthMeter password={password} />}
              </div>

              {err && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-snug">
                  {err}
                </div>
              )}

              <button type="submit" disabled={loading}
                aria-busy={loading}
                className="btn-primary w-full justify-center py-3 text-sm font-bold group mt-1"
                style={{ boxShadow: '0 4px 14px rgba(21,101,192,0.35)' }}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    <span>{mode === 'login' ? 'Signing you in…' : 'Creating workspace…'}</span>
                  </>
                ) : (
                  <>{mode === 'login' ? 'Sign in' : 'Create workspace'}<ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></>
                )}
              </button>
            </form>

            {/* Mode toggle */}
            <p className="mt-5 text-center text-sm text-slate-400">
              {mode === 'setup' ? (
                <>
                  Already have an account?{' '}
                  <button onClick={() => { setMode('login'); setErr(''); }}
                    className="text-blue-600 font-semibold hover:underline">Sign in</button>
                </>
              ) : (
                <span className="text-xs text-slate-300">
                  No account? Ask your PM to create one for you.
                </span>
              )}
            </p>

            <div className="mt-10 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <ShieldCheck size={12} className="text-forest-600" aria-hidden="true" />
                <span>Encrypted in transit · GxP-aware audit trail</span>
              </div>
              <div style={{ fontSize: 10 }} className="text-slate-300 text-center mt-2 tracking-wider uppercase">
                Pragati · Project Intelligence Platform
              </div>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
