import { useState } from 'react';
import { useAuth } from '../auth';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register({ email, password, name, title });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const demoAccounts = [
    { label: 'QA Head (manager)', email: 'priya@alembic.local', password: 'priya123' },
    { label: 'CSV Lead', email: 'rahul@alembic.local', password: 'rahul123' },
    { label: 'QA Analyst', email: 'karan@alembic.local', password: 'karan123' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl grid md:grid-cols-2 bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="hidden md:flex flex-col justify-between p-10 bg-gradient-to-br from-brand-800 to-brand-600 text-white">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-xl">M</div>
              <div>
                <div className="font-semibold text-lg">MicroMacro</div>
                <div className="text-xs uppercase tracking-widest text-brand-100">Pharma QA Project Manager</div>
              </div>
            </div>
            <h1 className="mt-10 text-3xl font-bold leading-tight">
              Manage macro projects and micro tasks across your QA teams.
            </h1>
            <p className="mt-4 text-brand-100">
              Built for pharma QA workflows — CSV / GAMP 5, SOP lifecycle, Deviation &amp; CAPA,
              Change Control, Audit readiness — with clear visibility from a single task up to the
              whole organisation.
            </p>
          </div>
          <div className="text-sm text-brand-100/80">
            Yearly celebrations of big deliveries and early-completion bonuses recognise the
            extra effort teams put in before deadlines.
          </div>
        </div>

        <div className="p-8 md:p-10">
          <h2 className="text-xl font-semibold mb-1">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
          <p className="text-sm text-slate-500 mb-6">
            {mode === 'login' ? 'Welcome back' : 'The very first account becomes admin'}
          </p>
          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (
              <>
                <div>
                  <label className="label">Full name</label>
                  <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="label">Title</label>
                  <input
                    className="input"
                    placeholder="e.g. QA Analyst"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}
            </button>
          </form>
          <div className="mt-4 text-sm text-slate-500">
            {mode === 'login' ? (
              <>
                No account?{' '}
                <button type="button" className="text-brand-700 hover:underline" onClick={() => setMode('register')}>
                  Create one
                </button>
              </>
            ) : (
              <>
                Have an account?{' '}
                <button type="button" className="text-brand-700 hover:underline" onClick={() => setMode('login')}>
                  Sign in
                </button>
              </>
            )}
          </div>

          <div className="mt-8 pt-6 border-t">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Demo accounts</div>
            <div className="space-y-1">
              {demoAccounts.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(a.password);
                    setMode('login');
                  }}
                  className="w-full text-left text-xs px-3 py-2 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200"
                >
                  <span className="font-medium">{a.label}</span>
                  <span className="text-slate-500"> · {a.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
