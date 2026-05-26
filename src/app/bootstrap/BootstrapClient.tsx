'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PragatiMark } from '@/components/PragatiMark';

/**
 * Bootstrap form. Only rendered when the server has confirmed
 * ADMIN_BOOTSTRAP_TOKEN is set; the page itself 404s otherwise so the
 * mere presence of this URL doesn't expose the existence of bootstrap.
 *
 * The form never reads or echoes the token — paste-only, never logged.
 */
export function BootstrapClient() {
  const [token, setToken]               = useState('');
  const [email, setEmail]               = useState('');
  const [name, setName]                 = useState('');
  const [password, setPassword]         = useState('');
  const [cleanupUsers, setCleanupUsers] = useState(true);
  const [keepMesOnly, setKeepMesOnly]   = useState(true);
  const [busy, setBusy]                 = useState(false);
  const [err, setErr]                   = useState<string | null>(null);
  const [result, setResult]             = useState<any>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-bootstrap-token': token.trim(),
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name:  name.trim(),
          password,
          cleanupUsers,
          keepMesOnly,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error || `HTTP ${res.status}`);
        return;
      }
      setResult(json.summary);
    } catch (e: any) {
      setErr(e?.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12"
         style={{ background: 'linear-gradient(135deg,#0b1220 0%,#101a2e 60%,#0e2a1a 100%)' }}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-white/10 p-8">
        <div className="flex items-center gap-3 mb-6">
          <PragatiMark size={48} flat />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Pragati — First-run setup</h1>
            <p className="text-xs text-slate-500">Provision the admin account and clean up seed data.</p>
          </div>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <h2 className="font-semibold text-emerald-900">Setup complete.</h2>
              <p className="text-sm text-emerald-800 mt-1">
                Admin account: <strong>{result.admin?.email}</strong> (Admin)
              </p>
            </div>

            {result.usersDeleted && (
              <div className="text-sm text-slate-700">
                <p><strong>Users removed:</strong> {result.usersDeleted.count}</p>
                {result.usersDeleted.emails?.length > 0 && (
                  <ul className="list-disc list-inside text-slate-500 max-h-32 overflow-auto mt-1">
                    {result.usersDeleted.emails.map((e: string) => <li key={e}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}

            {result.projectsDeleted && (
              <div className="text-sm text-slate-700">
                {result.projectsDeleted.error ? (
                  <p className="text-amber-700">⚠ {result.projectsDeleted.error}</p>
                ) : (
                  <>
                    <p>
                      <strong>Projects removed:</strong> {result.projectsDeleted.projects}
                      {' '}(MES team kept: {result.projectsDeleted.mesTeam})
                    </p>
                    <p className="text-slate-500">Tasks cascaded: {result.projectsDeleted.tasks}</p>
                  </>
                )}
              </div>
            )}

            <div className="border-t pt-4 space-y-2 text-sm">
              <p className="text-slate-700">
                <strong>Important:</strong> remove <code className="px-1 py-0.5 bg-slate-100 rounded">ADMIN_BOOTSTRAP_TOKEN</code>
                {' '}from your hosting environment now, then redeploy. The page returns 404
                immediately once the variable is gone.
              </p>
              <Link href="/login"
                    className="inline-block mt-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
                Continue to sign in →
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Bootstrap token" hint="ADMIN_BOOTSTRAP_TOKEN from your hosting env">
              <input type="password" required value={token} onChange={e => setToken(e.target.value)}
                     className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                     placeholder="paste token" autoComplete="off" />
            </Field>

            <Field label="Admin email">
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                     className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                     placeholder="you@company.com" autoComplete="off" />
            </Field>

            <Field label="Display name (optional)">
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                     className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                     placeholder="Abhi" autoComplete="off" />
            </Field>

            <Field label="Choose a password" hint="Min 8 characters. You can change it later from your profile.">
              <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
                     className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                     autoComplete="new-password" />
            </Field>

            <div className="border-t pt-4 space-y-2">
              <Check value={cleanupUsers} onChange={setCleanupUsers}
                     label="Delete pre-added users"
                     hint="Keeps only the new admin + anyone who joined via a consumed invite." />
              <Check value={keepMesOnly} onChange={setKeepMesOnly}
                     label="Keep only MES projects"
                     hint="Drops every project (and its tasks) not owned by the MES team." />
            </div>

            {err && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {err}
              </div>
            )}

            <button type="submit" disabled={busy}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50">
              {busy ? 'Setting up…' : 'Provision admin'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

function Check({ value, onChange, label, hint }:
  { value: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}
             className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}
