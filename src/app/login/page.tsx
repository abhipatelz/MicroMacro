'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { ArrowRight, Sparkles } from 'lucide-react';

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
    <div className="mt-2 space-y-1.5">
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
    <div className="min-h-screen flex items-center justify-center bg-white px-5 relative">
      <div className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: 'linear-gradient(90deg, #1565C0 0%, #1769C8 50%, #2B8C29 100%)' }} />

      <div className="w-full max-w-[340px]">

        {/* Wordmark — no logo image. Just the name. */}
        <div className="text-center mb-10">
          <div className="text-3xl font-black tracking-tight text-slate-900">Pragati</div>
          <div className="text-[11px] text-slate-400 mt-1 tracking-wide">
            Project intelligence
          </div>
        </div>

        {/* First-run banner */}
        {isFirstRun && mode === 'login' && (
          <div className="mb-6 rounded-xl border border-forest-200 bg-forest-50 px-4 py-3 flex items-start gap-2.5">
            <Sparkles size={15} className="text-forest-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-snug">
              <div className="font-semibold text-forest-800">No accounts yet</div>
              <button onClick={() => { setMode('setup'); setErr(''); }}
                className="text-forest-700 font-bold underline hover:no-underline mt-0.5">
                Set up your workspace →
              </button>
            </div>
          </div>
        )}

        {/* Heading */}
        <h2 className="text-xl font-bold text-slate-900 mb-6">
          {mode === 'login' ? 'Sign in' : 'Set up workspace'}
        </h2>

        <form onSubmit={submit} className="space-y-3.5">
          {mode === 'setup' && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Full name</label>
                <input className="input" placeholder="Your name" required
                  value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Job title <span className="font-normal text-slate-300">(optional)</span>
                </label>
                <input className="input" placeholder="e.g. Team Lead"
                  value={title} onChange={e => setTitle(e.target.value)} />
              </div>
            </>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Email</label>
            <input className="input" type="email" placeholder="you@company.com" required
              autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-semibold text-slate-500">Password</label>
              {mode === 'login' && (
                <a href="/forgot-password" className="text-[11px] text-blue-600 font-semibold hover:text-blue-800">
                  Forgot?
                </a>
              )}
            </div>
            <input className="input" type="password" required
              minLength={mode === 'setup' ? 8 : 1}
              placeholder={mode === 'setup' ? 'Min 8 characters' : '••••••••'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password} onChange={e => setPassword(e.target.value)} />
            {mode === 'setup' && <StrengthMeter password={password} />}
          </div>

          {err && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 leading-snug">
              {err}
            </div>
          )}

          <button type="submit" disabled={loading} aria-busy={loading}
            className="btn-primary w-full justify-center py-3 text-sm font-bold group mt-2">
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                <span>{mode === 'login' ? 'Signing in…' : 'Creating…'}</span>
              </>
            ) : (
              <>
                {mode === 'login' ? 'Sign in' : 'Create workspace'}
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        {/* Mode toggle / footer note */}
        <div className="mt-5 text-center text-xs text-slate-400">
          {mode === 'setup' ? (
            <>
              Already have an account?{' '}
              <button onClick={() => { setMode('login'); setErr(''); }}
                className="text-blue-600 font-semibold hover:underline">Sign in</button>
            </>
          ) : (
            <span className="text-slate-300">No account? Ask your team lead.</span>
          )}
        </div>
      </div>
    </div>
  );
}
