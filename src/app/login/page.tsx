'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { PragatiMark } from '@/components/PragatiMark';
import { BirdsEyeLoader } from '@/components/BirdsEyeLoader';
import { ArrowRight, Sparkles, Eye, EyeOff } from 'lucide-react';
import { AVATAR_FONTS, avatarFg } from '@/components/ui';

function getInitials(name: string) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

/* Rotating wisdom from Jensen Huang, CEO of NVIDIA. */
const QUOTES = [
  "You have to be the very best at what you do, because the world is so competitive.",
  "The more you suffer, the more it shows you really care about what you are doing.",
  "I want you to be in a state of urgency. Not panic — urgency.",
  "Run. Don't walk.",
  "The greatest opportunity in human history is right now. The next industrial revolution has begun.",
  "Speed is a strategy. Doing things fast is not just efficiency — it is competitive advantage.",
  "If you are not embarrassed by version one, you shipped too late.",
  "We have to be the best. Not incrementally better — we have to be the best.",
  "The most important thing a leader can do is set a high bar for quality.",
  "Our goal is not to be a technology company. Our goal is to solve problems that matter.",
  "Expectations lead to disappointment. Determination leads to results.",
  "Every day you have to earn your place. Every single day.",
  "The company that moves fastest wins. Always.",
  "Do not celebrate yesterday's wins too long. Tomorrow's competition does not rest.",
  "You have to be willing to do what others won't. That is the only way to get where others haven't been.",
  "If I had not gotten comfortable with failure, I would never have achieved anything.",
  "The ability to learn is the most important quality a leader can have.",
  "Talent is everywhere. Opportunity is not. Close that gap.",
  "Being brilliant is not enough. You have to do something with it.",
  "Great execution beats great strategy every time.",
  "You can either fear change or embrace it. One path leads to extinction, the other to leadership.",
  "We do not just build products. We build trust. One delivery at a time.",
  "The work is the message. Ship it right.",
  "Done is not enough. Done well is the standard.",
  "Your team is your most important product. Build them like it.",
  "A roadmap without urgency is a wish list.",
  "Software without discipline is chaos. Discipline without software is just slow chaos.",
  "Every feature you ship is a promise. Honor it.",
  "Complexity is the enemy of execution. Simplify relentlessly.",
  "The best teams do not just meet expectations — they redefine them.",
  "Accountability is not a punishment. It is a sign that your work matters.",
  "The difference between good and great is attention to the things others ignore.",
  "Move fast. Learn faster. Ship. Repeat.",
  "Quality is not a phase. It is the whole process.",
  "If your team does not know the goal, they cannot reach it. Clarity is leadership.",
  "The race is not always to the swift, but to the ones who never stop.",
  "Precision and speed are not opposites. The most precise teams move fastest.",
  "Build for impact, not for applause.",
  "Vision without execution is delusion.",
  "The best time to fix a problem is before it becomes one.",
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
  const [mode, setMode] = useState<'login' | 'setup' | 'unlock'>('login');
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // Quick-PIN unlock: shown when this device previously completed a full
  // sign-in and the user has a PIN set.
  const [deviceName, setDeviceName] = useState('');
  // Monogram avatar for the trusted device, so the greeting matches the
  // avatar the user picked in settings rather than plain initials.
  const [deviceAvatar, setDeviceAvatar] = useState<{ letter: string; bg: string; font: number }>({ letter: '', bg: '', font: 0 });
  const [pin, setPin] = useState('');
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ initialized: boolean }>('/system/status').then(d => {
      if (!d.initialized) setIsFirstRun(true);
    }).catch(() => {});
    // If this is a trusted device with a PIN, greet the user and offer the
    // PIN pad instead of the full form.
    api<{ trusted: boolean; name?: string; hasPin?: boolean; locked?: boolean; avatarLetter?: string; avatarBg?: string; avatarFont?: number }>('/auth/device')
      .then(d => {
        if (d.trusted && d.hasPin && !d.locked) {
          setDeviceName(d.name || '');
          setDeviceAvatar({ letter: d.avatarLetter || '', bg: d.avatarBg || '', font: d.avatarFont ?? 0 });
          setMode('unlock');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode !== 'unlock') return;
    const t = setTimeout(() => pinInputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (loading) return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        appendPin(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setPin((p) => p.slice(0, -1));
        setErr('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [mode, loading, pin]);

  function usePasswordInstead() {
    setMode('login');
    setErr('');
    setPin('');
  }

  function appendPin(digit: string) {
    setErr('');
    setPin((current) => {
      const next = (current + digit).replace(/\D/g, '').slice(0, 4);
      if (next.length === 4) unlock(next);
      return next;
    });
  }

  async function unlock(pinValue: string) {
    setErr('');
    setLoading(true);
    try {
      await api('/auth/unlock', { method: 'POST', body: { pin: pinValue } });
      router.replace('/');
      router.refresh();
    } catch (e: any) {
      setPin('');
      if (e?.data?.needPassword || /password/i.test(e?.message || '')) {
        setErr(e.message || 'Please sign in with your password.');
        setMode('login');
      } else {
        setErr(e.message || 'Incorrect PIN.');
      }
      setLoading(false);
    }
  }

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

              {/* Custom Pragati mark with two dots orbiting around it.
                  The logo is 112px (radius 56). Each orbit ring is an absolute
                  box centred on the logo; the dot sits at the ring's top edge,
                  and the ring spins around its centre, so the dot traces a
                  circle of radius = half the ring box.
                  • The two rings have DIFFERENT radii (28px gap), so the dots
                    travel on separate circles and can never collide.
                  • Both radii clear the logo edge, so the dots never ride
                    across the mark itself. */}
              <div className="flex justify-center mb-10">
                <div className="relative logo-float" style={{ width: 112, height: 112 }}>
                  <PragatiMark size={112} />
                  {/* Inner orbit (blue) — box 168px → radius 84, clears logo (56). */}
                  <div className="absolute pointer-events-none orbit-a"
                    style={{ top: -28, left: -28, right: -28, bottom: -28 }}>
                    <span className="absolute" style={{
                      width: 8, height: 8, borderRadius: '50%',
                      top: -4, left: '50%', transform: 'translateX(-50%)',
                      background: '#42A5F5', boxShadow: '0 0 12px rgba(66,165,245,0.9)',
                    }} />
                  </div>
                  {/* Outer orbit (green) — box 224px → radius 112, well outside blue. */}
                  <div className="absolute pointer-events-none orbit-b"
                    style={{ top: -56, left: -56, right: -56, bottom: -56 }}>
                    <span className="absolute" style={{
                      width: 6, height: 6, borderRadius: '50%',
                      top: -3, left: '50%', transform: 'translateX(-50%)',
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
        <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 relative
          bg-white lg:bg-white">
          {/* Mobile shimmer background — only visible on small screens where the
              left brand panel is hidden */}
          <div className="absolute inset-0 lg:hidden profile-hero-shimmer opacity-90" />
          <div className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: 'linear-gradient(90deg, #1565C0 0%, #1769C8 50%, #2B8C29 100%)' }} />

          <div className="w-full max-w-[340px] fade-up relative">

            {/* Mobile branding — floating card over the shimmer */}
            <div className="flex flex-col items-center mb-8 lg:hidden">
              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mb-1"
                style={{ boxShadow: '0 8px 24px rgba(15,23,42,0.3)' }}>
                <PragatiMark size={44} />
              </div>
              <div className="text-3xl font-black text-white mt-3 tracking-tight drop-shadow">Pragati</div>
              <div className="text-sm text-white/70 mt-1">Quality Informatics Platform</div>
            </div>

            {/* White card on mobile to contrast the shimmer; transparent on desktop */}
            <div className="rounded-2xl bg-white p-6 shadow-2xl lg:p-0 lg:rounded-none lg:bg-transparent lg:shadow-none">

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

            {/* ── Quick-PIN unlock (trusted device) ─────────────────────── */}
            {mode === 'unlock' && (
              <div className="form-swap" key="unlock">

                {/* Avatar + name — a soft breathing halo behind the avatar
                    makes the re-entry feel alive and welcoming. */}
                <div className="flex flex-col items-center text-center mb-7">
                  <div className="relative mb-4">
                    <div aria-hidden className="absolute -inset-3 rounded-full"
                      style={{
                        background: 'radial-gradient(circle, rgba(21,101,192,0.28) 0%, transparent 70%)',
                        animation: 'glow-pulse 3.4s ease-in-out infinite',
                      }} />
                    <div className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center text-2xl select-none logo-float"
                      style={{
                        background: deviceAvatar.bg || 'linear-gradient(135deg, #1565C0 0%, #1a237e 100%)',
                        color: deviceAvatar.bg ? avatarFg(deviceAvatar.bg) : '#ffffff',
                        fontFamily: (AVATAR_FONTS[deviceAvatar.font] || AVATAR_FONTS[0]).family,
                        fontWeight: (AVATAR_FONTS[deviceAvatar.font] || AVATAR_FONTS[0]).weight,
                        boxShadow: '0 8px 24px rgba(21,101,192,0.32)',
                      }}>
                      {(deviceAvatar.letter || getInitials(deviceName)).slice(0, 2).toUpperCase()}
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.18em] mb-1 fade-up-1">Welcome back</p>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight leading-tight fade-up-1">
                    {deviceName || 'You'}
                  </h2>
                  <p className="text-sm text-slate-400 mt-1.5 leading-snug fade-up-2">
                    Enter your Quick PIN to continue
                  </p>
                </div>

                {/* 4-box PIN input — keyboard plus touch keypad, so it works on every device */}
                <div className="relative flex justify-center gap-3 mb-4 cursor-text"
                  onClick={() => pinInputRef.current?.focus()}>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i}
                      className="w-[54px] h-[62px] rounded-2xl border-2 flex items-center justify-center transition-all duration-200"
                      style={{
                        borderColor: pin.length === i ? '#1565C0'
                                   : pin.length > i  ? '#93c5fd'
                                   : '#e2e8f0',
                        background:  pin.length > i  ? '#eff6ff'
                                   : pin.length === i ? '#f0f9ff'
                                   : 'white',
                        boxShadow:   pin.length === i ? '0 0 0 3px rgba(21,101,192,0.13)' : 'none',
                        transform:   pin.length > i  ? 'scale(1.04)' : 'scale(1)',
                      }}>
                      {pin.length > i && (
                        <div className="w-3 h-3 rounded-full bg-blue-600" />
                      )}
                    </div>
                  ))}

                  {/* Invisible input layered over the boxes — captures all keystrokes */}
                  <input
                    ref={pinInputRef}
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={4}
                    value={pin}
                    disabled={loading}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setPin(v);
                      setErr('');
                      if (v.length === 4) unlock(v);
                    }}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-text"
                    style={{ color: 'transparent', caretColor: 'transparent' }}
                    aria-label="Quick PIN"
                  />
                </div>

                {/* Keypad removed by design — just type the PIN. The 4-box
                    indicator above lights up as digits are entered and the
                    form auto-submits on the 4th character. */}

                {err && (
                  <div role="alert" aria-live="assertive"
                    className="mt-1 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-snug flex items-start gap-2 fade-in-soft">
                    <span aria-hidden="true" className="font-bold leading-none mt-0.5">!</span>
                    <span>{err}</span>
                  </div>
                )}

                {loading && (
                  <div className="mt-2 fade-in-soft">
                    <BirdsEyeLoader size="sm" inline label="Unlocking your workspace…" sublabel="One moment — getting your bird's-eye view ready." />
                  </div>
                )}

                <div className="mt-6 flex flex-col items-center gap-1.5">
                  <button onClick={usePasswordInstead} type="button"
                    className="text-sm text-slate-400 hover:text-blue-600 font-medium transition-colors">
                    Sign in with password instead
                  </button>
                </div>
              </div>
            )}

            {/* Heading */}
            {mode !== 'unlock' && (
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
            )}

            {mode !== 'unlock' && (
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
                <div className="relative">
                  <input className="input pr-10" type={showPw ? 'text' : 'password'} required minLength={mode === 'setup' ? 8 : 1}
                    placeholder={mode === 'setup' ? 'Min 8 characters' : '••••••••'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password} onChange={e => setPassword(e.target.value)} />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
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
            )}

            {mode !== 'unlock' && (
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
            )}

            </div>{/* end white card */}
          </div>
        </div>

      </div>
    </>
  );
}
