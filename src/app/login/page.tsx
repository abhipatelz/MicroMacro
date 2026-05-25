'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { PragatiMark } from '@/components/PragatiMark';
import { ArrowRight, Sparkles } from 'lucide-react';

/* Quiet, rotating wisdom on the brand panel — fades between lines every
   few seconds. Deliberately unattributed. */
const QUOTES = [
  'The most important skill is learning how to learn.',
  'You make progress by being specific about what you want.',
  'A clear mind is a productive mind.',
  'Do the thing you’ve been avoiding. That’s usually the right one.',
  'Inspiration is perishable — act on it immediately.',
  'Focus on being productive instead of busy.',
  'Done is better than perfect, every single day.',
  'Small steps, taken daily, compound into everything.',
];

function RotatingQuote() {
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      setShow(false);
      setTimeout(() => { setI((n) => (n + 1) % QUOTES.length); setShow(true); }, 400);
    }, 6000);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      style={{ fontSize: 12, fontStyle: 'italic', transition: 'opacity 0.4s ease', opacity: show ? 1 : 0, minHeight: 18 }}
      className="text-white/40 tracking-wide max-w-[300px] mx-auto leading-snug"
    >
      “{QUOTES[i]}”
    </div>
  );
}

function StrengthMeter({ password }: { password: string }) {
  const checks = [
    { label: '8+ chars', ok: password.length >= 8 },
    { label: 'A–Z',      ok: /[A-Z]/.test(password) },
    { label: 'a–z',      ok: /[a-z]/.test(password) },
    { label: '0–9',      ok: /[0-9]/.test(password) },
    { label: '#!@',      ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const barColor = score <= 2 ? '#EF4444' : score <= 3 ? '#F59E0B' : '#43A047';
  const labels = ['', 'Very weak', 'Weak', 'Okay', 'Strong', 'Excellent'];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5 fade-in-soft">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 flex-1">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-1 flex-1 rounded-sm transition-all duration-300"
              style={{ background: i <= score ? barColor : '#E2E8F0' }} />
          ))}
        </div>
        <span style={{ fontSize: 10, color: barColor }} className="font-semibold tabular-nums w-[64px] text-right">
          {labels[score]}
        </span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {checks.map(c => (
          <span key={c.label} style={{ fontSize: 10 }}
            className={`transition-colors ${c.ok ? 'text-forest-600 font-medium' : 'text-slate-300'}`}>
            {c.ok ? '✓' : '·'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ initialized: boolean }>('/system/status').then(d => {
      if (!d.initialized) setIsFirstRun(true);
    }).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      if (mode === 'login') {
        // `identifier` accepts either a username or an email — backend
        // routes the lookup based on whether it contains an "@".
        await api('/auth/login', { method: 'POST', body: { identifier: email, password } });
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
          50%      { opacity: 0.85; transform: scale(1.08); }
        }
        @keyframes logo-float {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-8px); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(14px); }
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
        /* Spin the orbit ring around the logo's centre — the dot sits on
           the ring's edge, so it circles the mark closely. */
        @keyframes orbit-a { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes orbit-b { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        .logo-float    { animation: logo-float 5.5s ease-in-out infinite; }
        .fade-up       { animation: fade-up 0.55s ease-out forwards; }
        .fade-up-1     { animation: fade-up 0.55s 0.10s ease-out both; }
        .fade-up-2     { animation: fade-up 0.55s 0.20s ease-out both; }
        .fade-up-3     { animation: fade-up 0.55s 0.32s ease-out both; }
        .fade-in-soft  { animation: fade-in-soft 0.35s ease-out both; }
        .form-swap     { animation: fade-in-soft 0.32s ease-out both; }
        .shimmer-line::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
          animation: shimmer-line 2.6s ease-in-out infinite;
        }
        .orbit-a { animation: orbit-a 14s linear infinite; transform-origin: 50% 50%; }
        .orbit-b { animation: orbit-b 18s linear infinite; transform-origin: 50% 50%; }
        @media (prefers-reduced-motion: reduce) {
          .logo-float, .orbit-a, .orbit-b, .shimmer-line::after { animation: none !important; }
          .fade-up, .fade-up-1, .fade-up-2, .fade-up-3, .fade-in-soft, .form-swap { animation-duration: 0.01ms !important; }
        }
      `}</style>

      <div className="min-h-screen flex">

        {/* ════ LEFT — Pragati brand panel ═══════════════════════════════ */}
        <div
          className="hidden lg:flex lg:w-[54%] flex-col relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #050E1D 0%, #091828 40%, #0B1F3A 70%, #0C2347 100%)' }}
        >
          {/* Dot grid texture */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />

          {/* Glowing blue halo */}
          <div className="absolute pointer-events-none" style={{
            top: '20%', left: '50%', transform: 'translateX(-50%)',
            width: 520, height: 520, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(30,136,229,0.28) 0%, transparent 65%)',
            animation: 'glow-pulse 6s ease-in-out infinite',
          }} />
          {/* Subtle forest accent in the corner */}
          <div className="absolute pointer-events-none" style={{
            bottom: '-12%', right: '-12%', width: 380, height: 380, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(43,160,71,0.18) 0%, transparent 70%)',
          }} />

          <div className="relative flex flex-col flex-1 px-14 py-12">
            <div className="flex-1 flex flex-col justify-center">

              {/* Custom Pragati mark with two dots orbiting close around it. */}
              <div className="flex justify-center mb-10">
                <div className="relative logo-float" style={{ width: 112, height: 112 }}>
                  <PragatiMark size={112} />
                  {/* Orbit ring — the dots ride the edge of this box */}
                  <div className="absolute inset-0 orbit-a pointer-events-none">
                    <span className="absolute left-1/2 -top-1.5 -translate-x-1/2" style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#42A5F5', boxShadow: '0 0 12px rgba(66,165,245,0.9)',
                    }} />
                  </div>
                  <div className="absolute inset-0 orbit-b pointer-events-none">
                    <span className="absolute left-1/2 -bottom-1.5 -translate-x-1/2" style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: '#67D376', boxShadow: '0 0 10px rgba(103,211,118,0.9)',
                    }} />
                  </div>
                </div>
              </div>

              {/* Wordmark */}
              <h1
                className="fade-up-1 text-center font-black text-white leading-none"
                style={{ fontSize: 'clamp(62px, 6.2vw, 88px)', letterSpacing: '-0.035em' }}
              >
                Pragati
              </h1>

              <div className="fade-up-2 flex justify-center mt-5">
                <div className="relative h-0.5 w-20 rounded-full overflow-hidden shimmer-line"
                  style={{ background: 'linear-gradient(90deg, #1769C8, #43A047)' }} />
              </div>

              <p
                className="fade-up-2 text-center text-white/55 mt-5 leading-relaxed mx-auto"
                style={{ fontSize: 14, maxWidth: 320 }}
              >
                A bird's-eye view of every project,
                <br />every action, every contributor.
              </p>

            </div>

            <div className="text-center pb-2 fade-up-3">
              <RotatingQuote />
            </div>
          </div>
        </div>

        {/* ════ RIGHT — Form panel ═══════════════════════════════════════ */}
        <div className="flex-1 flex flex-col justify-center items-center bg-white px-6 py-12 relative">
          <div className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: 'linear-gradient(90deg, #1565C0 0%, #1769C8 50%, #2B8C29 100%)' }} />

          <div className="w-full max-w-[340px] fade-up">

            {/* Mobile branding — same Pragati mark, no image */}
            <div className="flex flex-col items-center mb-8 lg:hidden">
              <PragatiMark size={56} />
              <div className="text-2xl font-black text-slate-900 mt-3 tracking-tight">Pragati</div>
            </div>

            {/* First-run banner */}
            {isFirstRun && mode === 'login' && (
              <div className="mb-6 rounded-xl border border-forest-200 bg-forest-50 px-4 py-3 flex items-start gap-2.5 fade-in-soft">
                <Sparkles size={15} className="text-forest-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-snug">
                  <div className="font-semibold text-forest-800">Welcome to Pragati</div>
                  <button onClick={() => { setMode('setup'); setErr(''); }}
                    className="text-forest-700 font-bold underline hover:no-underline mt-0.5">
                    Set up your workspace →
                  </button>
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
                  ? 'Sign in to continue.'
                  : 'Create the first lead account.'}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4 form-swap" key={mode + '-f'}>
              {mode === 'setup' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full name</label>
                    <input className="input" placeholder="Your name" required
                      value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Job title <span className="normal-case font-normal text-slate-300">(optional)</span>
                    </label>
                    <input className="input" placeholder="e.g. Team Lead"
                      value={title} onChange={e => setTitle(e.target.value)} />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  {mode === 'login' ? 'Username' : 'Email'}
                </label>
                <input
                  className="input"
                  // `text` (not `email`) on the login mode so a plain
                  // username doesn't trigger the browser's email validity
                  // check. On the register mode we still want email
                  // semantics for autocomplete + format hints.
                  type={mode === 'login' ? 'text' : 'email'}
                  placeholder={mode === 'login' ? 'username or employee ID' : 'you@company.com'}
                  required
                  autoComplete={mode === 'login' ? 'username' : 'email'}
                  spellCheck={false}
                  autoCapitalize="none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {mode === 'login' && (
                  <div className="text-[11px] text-slate-400 mt-1.5 leading-snug">
                    You can sign in with your <span className="font-medium text-slate-500">username</span> or your{' '}
                    <span className="font-medium text-slate-500">employee ID</span> — both work.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <input className="input" type="password" required minLength={mode === 'setup' ? 8 : 1}
                  placeholder={mode === 'setup' ? 'Min 8 characters' : '••••••••'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password} onChange={e => setPassword(e.target.value)} />
                {mode === 'setup' && <StrengthMeter password={password} />}
              </div>

              {err && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-snug flex items-start gap-2 fade-in-soft"
                >
                  <span aria-hidden="true" className="font-bold leading-none mt-0.5">!</span>
                  <span>{err}</span>
                </div>
              )}

              <button type="submit" disabled={loading} aria-busy={loading}
                className="btn-primary w-full justify-center py-3 text-sm font-bold group mt-1"
                style={{ boxShadow: '0 4px 14px rgba(21,101,192,0.35)' }}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    <span>{mode === 'login' ? 'Signing in…' : 'Creating workspace…'}</span>
                  </>
                ) : (
                  <>
                    {mode === 'login' ? 'Sign in' : 'Create workspace'}
                    <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-400">
              {mode === 'setup' ? (
                <>
                  Already have an account?{' '}
                  <button onClick={() => { setMode('login'); setErr(''); }}
                    className="text-blue-600 font-semibold hover:underline">Sign in</button>
                </>
              ) : (
                <span className="text-xs text-slate-300">
                  Forgot your password? Ask the admin to reset it for you.
                </span>
              )}
            </p>
          </div>
        </div>

      </div>
    </>
  );
}
