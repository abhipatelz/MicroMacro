'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PragatiMark } from '@/components/PragatiMark';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { CheckCircle2, AlertTriangle, ShieldCheck, Mail } from 'lucide-react';

function StrengthMeter({ password }: { password: string }) {
  const checks = [
    { label: '8+ chars', ok: password.length >= 8 },
    { label: 'A–Z',      ok: /[A-Z]/.test(password) },
    { label: 'a–z',      ok: /[a-z]/.test(password) },
    { label: '0–9',      ok: /[0-9]/.test(password) },
    { label: '#!@',      ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const barColor = score <= 2 ? '#EF4444' : score <= 3 ? '#F59E0B' : '#22C55E';
  const labels   = ['', 'Very weak', 'Weak', 'Okay', 'Strong', 'Excellent'];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 flex-1">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-1 flex-1 rounded-sm transition-all"
              style={{ background: i <= score ? barColor : '#E2E8F0' }} />
          ))}
        </div>
        <span className="text-[11px] font-bold" style={{ color: barColor }}>{labels[score]}</span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {checks.map(c => (
          <span key={c.label} className={`text-[10px] ${c.ok ? 'text-green-600 font-semibold' : 'text-slate-300'}`}>
            {c.ok ? '✓' : '·'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token  = params.get('token') || '';

  const [phase,     setPhase]     = useState<'validating' | 'invalid' | 'ready' | 'submitting' | 'done'>('validating');
  const [reason,    setReason]    = useState<string>('');
  const [email,     setEmail]     = useState('');
  const [invitedBy, setInvitedBy] = useState('');
  const [name,      setName]      = useState('');
  const [title,     setTitle]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [err,       setErr]       = useState('');

  useEffect(() => {
    if (!token) { setPhase('invalid'); setReason('missing_token'); return; }
    api(`/invites/validate?token=${encodeURIComponent(token)}`)
      .then((d: any) => {
        if (!d.valid) { setPhase('invalid'); setReason(d.reason); return; }
        setEmail(d.email);
        setInvitedBy(d.invitedByName || '');
        setPhase('ready');
      })
      .catch(() => { setPhase('invalid'); setReason('error'); });
  }, [token]);

  const strong  = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
  const matches = password === confirm && password.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!name.trim() || !strong || !matches) return;
    setPhase('submitting');
    try {
      await api('/auth/signup', { method: 'POST', body: { token, name: name.trim(), password, title: title.trim() } });
      setPhase('done');
      setTimeout(() => router.replace('/'), 700);
    } catch (e: any) {
      setErr(e.message || 'Sign-up failed.');
      setPhase('ready');
    }
  }

  if (phase === 'validating') {
    return (
      <div className="text-center py-14">
        <div className="w-7 h-7 mx-auto border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400 mt-4">Verifying your invite…</p>
      </div>
    );
  }

  if (phase === 'invalid') {
    const message =
      reason === 'expired'       ? 'This invite has expired. Ask your lead to send a new one.'
    : reason === 'consumed'      ? 'This invite has already been used.'
    : reason === 'revoked'       ? 'This invite was revoked by the lead who created it.'
    : reason === 'not_found'     ? "We couldn't find this invite. Check the link and try again."
    : reason === 'missing_token' ? 'No invite token was provided in the link.'
                                 : 'This invite link is not valid.';
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 flex items-center justify-center mb-4">
          <AlertTriangle size={22} className="text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Invite unavailable</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto leading-relaxed">{message}</p>
        <Link href="/login" className="inline-flex items-center gap-1 mt-6 text-sm font-semibold text-blue-600 hover:text-blue-700">
          Back to sign in →
        </Link>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="text-center py-14">
        <div className="w-14 h-14 mx-auto rounded-full bg-green-50 flex items-center justify-center mb-4 animate-[pop_0.5s_cubic-bezier(0.34,1.56,0.64,1)]">
          <CheckCircle2 size={32} className="text-green-500" />
        </div>
        <h2 className="text-xl font-black text-slate-800">Welcome to <span className="brand-wordmark brand-wordmark-gradient">Pragati</span></h2>
        <p className="text-sm text-slate-500 mt-2">Taking you to your dashboard…</p>
        <style jsx>{`@keyframes pop { from { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } to { transform: scale(1); } }`}</style>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Invited by</div>
        <div className="mt-1 text-sm text-slate-700 font-semibold">{invitedBy || 'A team lead'}</div>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Your email</label>
        <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
          <Mail size={13} className="text-slate-400 shrink-0" />
          <span className="truncate">{email}</span>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Full name</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Sharma" required autoFocus />
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
          Designation <span className="font-normal lowercase text-slate-300">(optional)</span>
        </label>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Team Lead — QA-IT" />
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Password</label>
        <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 chars + mixed case + number + symbol" autoComplete="new-password" required />
        <StrengthMeter password={password} />
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Confirm password</label>
        <input
          type="password"
          className={`input ${confirm && !matches ? 'border-red-300 focus:border-red-400' : ''}`}
          value={confirm} onChange={e => setConfirm(e.target.value)}
          autoComplete="new-password" required
        />
        {confirm && !matches && <p className="text-[11px] text-red-500 mt-1">Passwords don't match.</p>}
      </div>

      {err && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" /> <span>{err}</span>
        </div>
      )}

      <button
        type="submit"
        className="btn-primary w-full justify-center text-sm py-2.5"
        disabled={!name.trim() || !strong || !matches || phase === 'submitting'}
      >
        {phase === 'submitting' ? 'Creating account…' : 'Create my account'}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <ShieldCheck size={11} /> Single-use invite · 21 CFR Part 11 audit trail
      </div>
    </form>
  );
}

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'radial-gradient(ellipse at top, #E3F2FD 0%, #F8FAFC 60%)' }}>
      <div className="w-full max-w-[420px]">
        {/* Pragati mark + wordmark */}
        <div className="flex flex-col items-center mb-6">
          <PragatiMark size={56} className="mb-3" />
          <div className="brand-wordmark brand-wordmark-gradient text-2xl">Pragati</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mt-0.5">Project Intelligence</div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 px-6 py-7"
          style={{ boxShadow: '0 4px 24px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)' }}>
          <Suspense fallback={<div className="text-center py-12 text-sm text-slate-400">Loading…</div>}>
            <SignupForm />
          </Suspense>
        </div>

        <div className="text-center mt-5 text-[11px] text-slate-400">
          Already onboarded? <Link href="/login" className="text-blue-600 font-semibold hover:text-blue-700">Sign in →</Link>
        </div>
      </div>
    </div>
  );
}
