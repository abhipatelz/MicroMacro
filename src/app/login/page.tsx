'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { ArrowRight, Sparkles, ShieldCheck, Bot, Activity, Compass, CalendarDays } from 'lucide-react';

/* Marketing tiles — each one maps to a real, shipped feature. */
const FEATURES = [
  { Icon: Bot,          label: 'QA Copilot',   line: 'Live AI grounded in 21 CFR, ICH, GAMP — answers with citations and one-click tasks.' },
  { Icon: Activity,     label: 'Risk Radar',   line: 'Predicts which deadlines will slip, ranks them, and lets you re-assign in one click.' },
  { Icon: Compass,      label: 'Insights',     line: 'Three actions to take today, in plain English. No dashboards to interpret.' },
  { Icon: CalendarDays, label: 'Calendar + Personal', line: 'Outlook-friendly meeting export, effort logging, and a private to-do list per user.' },
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
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // Carousel state — auto-advances every 4.2s
  const [tileIdx, setTileIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTileIdx(i => (i + 1) % FEATURES.length), 4200);
    return () => clearInterval(id);
  }, []);

  // Pointer-aware spotlight on the brand panel (CSS variables, no rerenders)
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      el.style.setProperty('--mx', `${x}%`);
      el.style.setProperty('--my', `${y}%`);
    };
    el.addEventListener('pointermove', onMove);
    return () => el.removeEventListener('pointermove', onMove);
  }, []);

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
        @keyframes word-rise {
          from { opacity: 0; transform: translateY(14px); filter: blur(6px); }
          to   { opacity: 1; transform: translateY(0);    filter: blur(0); }
        }
        @keyframes fade-up   { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fade-in   { from { opacity: 0; }                              to { opacity: 1; } }
        @keyframes fade-in-soft { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50%      { opacity: 0.75; transform: scale(1.06); }
        }
        @keyframes orbit-1   { from { transform: rotate(0deg) translateX(220px) rotate(0deg);    } to { transform: rotate(360deg) translateX(220px) rotate(-360deg);   } }
        @keyframes orbit-2   { from { transform: rotate(0deg) translateX(160px) rotate(0deg);    } to { transform: rotate(-360deg) translateX(160px) rotate(360deg);   } }
        @keyframes shine     { 0% { transform: translateX(-110%); } 60%, 100% { transform: translateX(150%); } }
        @keyframes tile-in   {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .word                { display: inline-block; opacity: 0; animation: word-rise 0.7s cubic-bezier(.22,.95,.36,1) forwards; }
        .fade-up             { animation: fade-up 0.6s ease-out forwards; }
        .fade-up-1           { animation: fade-up 0.6s 0.05s ease-out both; }
        .fade-up-2           { animation: fade-up 0.6s 0.10s ease-out both; }
        .fade-up-3           { animation: fade-up 0.6s 0.15s ease-out both; }
        .fade-in             { animation: fade-in 0.6s ease-out forwards; }
        .fade-in-soft        { animation: fade-in-soft 0.32s ease-out both; }
        .form-swap           { animation: fade-in-soft 0.32s ease-out both; }
        .tile-in             { animation: tile-in 0.45s cubic-bezier(.22,.95,.36,1) both; }
        .orbit-dot-1         { animation: orbit-1 26s linear infinite; }
        .orbit-dot-2         { animation: orbit-2 19s linear infinite; }
        .glow                { animation: glow-pulse 7s ease-in-out infinite; }

        /* Pointer-aware spotlight — falls back to a centered glow if no pointer */
        .stage::before {
          content: '';
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(600px circle at var(--mx, 50%) var(--my, 35%),
                      rgba(99, 165, 245, 0.10) 0%, transparent 55%);
          transition: background 0.2s ease;
        }

        /* Submit button shine on hover */
        .btn-shine { position: relative; overflow: hidden; }
        .btn-shine::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.35) 50%, transparent 65%);
          transform: translateX(-110%);
          transition: opacity 0.2s;
          pointer-events: none;
          opacity: 0;
        }
        .btn-shine:hover:not(:disabled)::after { opacity: 1; animation: shine 1.1s ease-out; }

        /* Floating input — label rises when focused/filled */
        .floating { position: relative; }
        .floating input {
          width: 100%; padding: 22px 14px 8px; border-radius: 12px;
          border: 1px solid #E2E8F0; background: #FFFFFF; font-size: 14px; color: #0f172a;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .floating input:focus {
          outline: none; border-color: #1769C8;
          box-shadow: 0 0 0 4px rgba(23,105,200,0.12);
        }
        .floating label {
          position: absolute; left: 14px; top: 14px;
          font-size: 13px; color: #94A3B8; pointer-events: none;
          transition: transform 0.18s ease, font-size 0.18s ease, color 0.18s ease;
          transform-origin: 0 0;
        }
        .floating input:focus + label,
        .floating input:not(:placeholder-shown) + label {
          transform: translateY(-9px) scale(0.78);
          color: #1769C8; font-weight: 600; letter-spacing: 0.02em;
        }
        .floating input::placeholder { color: transparent; }

        @media (prefers-reduced-motion: reduce) {
          .word, .fade-up, .fade-up-1, .fade-up-2, .fade-up-3, .fade-in,
          .fade-in-soft, .form-swap, .tile-in { animation-duration: 0.01ms !important; }
          .orbit-dot-1, .orbit-dot-2, .glow, .btn-shine::after { animation: none !important; }
          .stage::before { background: radial-gradient(500px circle at 50% 35%,
                            rgba(99,165,245,0.08) 0%, transparent 55%); }
        }
      `}</style>

      <div className="min-h-screen flex">

        {/* ════ LEFT — Brand panel ════════════════════════════════════════ */}
        <div
          ref={stageRef}
          className="stage hidden lg:flex lg:w-[55%] flex-col relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #050E1D 0%, #081729 38%, #0B1F3A 70%, #0C2347 100%)' }}
        >
          {/* Subtle dot grid */}
          <div className="absolute inset-0 pointer-events-none opacity-50" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }} />

          {/* Ambient glows */}
          <div className="glow absolute pointer-events-none" style={{
            top: '20%', left: '50%', transform: 'translateX(-50%)',
            width: 520, height: 520, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(21,101,192,0.22) 0%, transparent 65%)',
          }} />
          <div className="absolute pointer-events-none" style={{
            bottom: '-12%', right: '-8%', width: 380, height: 380, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(43,160,71,0.14) 0%, transparent 70%)',
          }} />

          {/* Two orbit dots — accent only */}
          <div className="absolute pointer-events-none" style={{ top: '32%', left: '50%' }}>
            <div className="orbit-dot-1" style={{
              width: 5, height: 5, borderRadius: '50%',
              background: '#60A5FA', boxShadow: '0 0 14px rgba(96,165,250,0.85)',
            }} />
          </div>
          <div className="absolute pointer-events-none" style={{ top: '48%', left: '50%' }}>
            <div className="orbit-dot-2" style={{
              width: 4, height: 4, borderRadius: '50%',
              background: '#43A047', boxShadow: '0 0 12px rgba(67,160,71,0.8)',
            }} />
          </div>

          <div className="relative flex flex-col flex-1 px-12 lg:px-16 py-10">
            {/* Top — clean wordmark, top-left aligned (modern style) */}
            <div className="fade-up flex items-center gap-2.5">
              <div style={{
                background: '#ffffff', borderRadius: 10, padding: '6px 8px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-icon.png" alt="" style={{ height: 22, width: 22, display: 'block' }} />
              </div>
              <div className="text-white font-black tracking-tight" style={{ fontSize: 17, letterSpacing: '-0.01em' }}>
                Pragati
              </div>
              <div className="text-blue-300/50 font-bold uppercase ml-1" style={{ fontSize: 9, letterSpacing: '0.18em' }}>
                Project Intelligence
              </div>
            </div>

            {/* Hero — confident, minimal headline */}
            <div className="flex-1 flex flex-col justify-center max-w-[540px]">
              <div className="font-black text-white leading-[0.98] tracking-[-0.035em]"
                   style={{ fontSize: 'clamp(48px, 4.6vw, 64px)' }}>
                <span className="word" style={{ animationDelay: '0.05s' }}>Project </span>
                <span className="word" style={{ animationDelay: '0.18s' }}>intelligence,</span><br/>
                <span className="word" style={{ animationDelay: '0.32s' }}>built </span>
                <span className="word" style={{ animationDelay: '0.45s', background: 'linear-gradient(90deg,#60A5FA,#43A047)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  in.
                </span>
              </div>

              <p className="fade-up-2 text-white/45 mt-6 leading-relaxed max-w-md" style={{ fontSize: 14.5 }}>
                The PM tool that doesn&rsquo;t just track work — it tells you which three things to fix today,
                why they matter, and gives you one click to do them.
              </p>

              {/* Rotating feature tile — exactly one shown, crossfaded */}
              <div className="fade-up-3 mt-10 max-w-md">
                <div className="flex items-center gap-2 mb-3">
                  {FEATURES.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setTileIdx(i)}
                      aria-label={`Feature ${i + 1}`}
                      className="h-1 rounded-full transition-all"
                      style={{
                        width: i === tileIdx ? 28 : 14,
                        background: i === tileIdx ? '#60A5FA' : 'rgba(255,255,255,0.18)',
                      }}
                    />
                  ))}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur p-5 min-h-[112px]">
                  {(() => {
                    const F = FEATURES[tileIdx];
                    const Icon = F.Icon;
                    return (
                      <div key={tileIdx} className="tile-in flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                             style={{ background: 'linear-gradient(135deg,#1565C0 0%, #1769C8 100%)', boxShadow: '0 4px 14px rgba(21,101,192,0.45)' }}>
                          <Icon size={18} className="text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-white font-bold text-[15px] tracking-tight leading-tight">{F.label}</div>
                          <div className="text-white/55 text-[13px] mt-1 leading-snug">{F.line}</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Bottom — quiet stamp */}
            <div className="text-white/25" style={{ fontSize: 10, letterSpacing: '0.2em' }}>
              <span className="uppercase font-semibold">v2 · GxP-aware · Audit trail · 21 CFR Part 11</span>
            </div>
          </div>
        </div>

        {/* ════ RIGHT — Form panel ════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col justify-center items-center bg-white px-6 py-12 relative">
          {/* Brand bar */}
          <div className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: 'linear-gradient(90deg, #1565C0 0%, #1769C8 50%, #2B8C29 100%)' }} />

          <div className="w-full max-w-[360px] fade-up">

            {/* Mobile branding */}
            <div className="flex flex-col items-center mb-8 lg:hidden">
              <div style={{ background: '#0B1628', borderRadius: 12, padding: '8px 16px', display: 'inline-flex', alignItems: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-icon.png" alt="" width={24} height={24} style={{ display: 'block', objectFit: 'contain' }} />
              </div>
              <div className="text-xl font-black text-slate-900 mt-2 tracking-tight">Pragati</div>
            </div>

            {/* First-run banner */}
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

            <div className="mb-7 form-swap" key={mode + '-h'}>
              <h2 className="text-[26px] font-black text-slate-900 tracking-tight leading-tight">
                {mode === 'login' ? 'Welcome back' : 'Set up workspace'}
              </h2>
              <p className="text-sm text-slate-400 mt-1.5 leading-snug">
                {mode === 'login'
                  ? 'Sign in to your Pragati workspace.'
                  : 'Create the first PM account. Add the team after.'}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-3.5 form-swap" key={mode + '-f'}>
              {mode === 'setup' && (
                <>
                  <div className="floating">
                    <input id="lp-name" placeholder=" " required
                      value={name} onChange={(e) => setName(e.target.value)} />
                    <label htmlFor="lp-name">Full name</label>
                  </div>
                  <div className="floating">
                    <input id="lp-title" placeholder=" "
                      value={title} onChange={(e) => setTitle(e.target.value)} />
                    <label htmlFor="lp-title">Job title (optional)</label>
                  </div>
                </>
              )}

              <div className="floating">
                <input id="lp-email" type="email" placeholder=" " required
                  autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <label htmlFor="lp-email">Work email</label>
              </div>

              <div>
                <div className="floating">
                  <input id="lp-pass" type="password" required
                    minLength={mode === 'setup' ? 8 : 1}
                    placeholder=" "
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                  <label htmlFor="lp-pass">{mode === 'setup' ? 'Password (min 8 chars)' : 'Password'}</label>
                </div>
                {mode === 'login' && (
                  <div className="text-right mt-1.5">
                    <a href="/forgot-password" className="text-xs text-blue-600 font-semibold hover:text-blue-800 transition-colors">
                      Forgot password?
                    </a>
                  </div>
                )}
                {mode === 'setup' && <StrengthMeter password={password} />}
              </div>

              {err && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-snug fade-in-soft">
                  {err}
                </div>
              )}

              <button type="submit" disabled={loading} aria-busy={loading}
                className="btn-primary btn-shine w-full justify-center py-3.5 text-sm font-bold group mt-1"
                style={{ boxShadow: '0 6px 20px rgba(21,101,192,0.32)' }}>
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    <span>{mode === 'login' ? 'Signing you in…' : 'Creating workspace…'}</span>
                  </>
                ) : (
                  <>
                    <span>{mode === 'login' ? 'Sign in' : 'Create workspace'}</span>
                    <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </>
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
                <span className="text-xs text-slate-300">No account? Ask your PM to invite you.</span>
              )}
            </p>

            <div className="mt-9 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <ShieldCheck size={12} className="text-forest-600" aria-hidden="true" />
                <span>Encrypted in transit · GxP-aware audit trail</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
