'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { Avatar, RoleBadge } from '@/components/ui';
import { ActivityGraph } from '@/components/ActivityGraph';
import {
  User, Bell, Lock, ShieldCheck, Copy, Check, RefreshCw, X, Activity,
} from 'lucide-react';

/* ── Section wrapper ──────────────────────────────────────────────────────── */
function Section({ icon: Icon, title, subtitle, children }: {
  icon?: any; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(210,218,228,0.8)', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>
      <div className="px-5 py-3.5 border-b flex items-center gap-2.5" style={{ borderColor: '#f0f3f8', background: 'linear-gradient(to right, #fafbfd, #f7f9fc)' }}>
        {Icon && <Icon size={15} className="text-blue-500 shrink-0" />}
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{subtitle}</p>}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

/* ── Field wrapper ────────────────────────────────────────────────────────── */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

/* ── Read-only field ──────────────────────────────────────────────────────── */
function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 text-sm text-slate-600 leading-none">
        {value || <span className="text-slate-300">—</span>}
      </div>
    </div>
  );
}

/* ── Toggle switch ────────────────────────────────────────────────────────── */
function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-0" style={{ borderColor: '#f1f5f9' }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-700 leading-tight">{label}</div>
        <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative w-10 h-5.5 rounded-full transition-all duration-200 shrink-0 mt-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:ring-offset-1"
        style={{ width: 40, height: 22, background: checked ? '#1565C0' : '#e2e8f0' }}
        aria-checked={checked} role="switch"
      >
        <span className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all duration-200"
          style={{ left: checked ? 20 : 2, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </button>
    </div>
  );
}

/* ── Password strength ────────────────────────────────────────────────────── */
function StrengthMeter({ password }: { password: string }) {
  const checks = [
    { label: '8+ chars',  ok: password.length >= 8 },
    { label: 'A–Z',       ok: /[A-Z]/.test(password) },
    { label: 'a–z',       ok: /[a-z]/.test(password) },
    { label: '0–9',       ok: /[0-9]/.test(password) },
    { label: '#!@',       ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const barColor = score <= 2 ? '#ef4444' : score <= 3 ? '#f59e0b' : '#22c55e';
  const label = ['','Very weak','Weak','Fair','Good','Strong'][score];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 flex-1">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-1 flex-1 rounded-sm transition-all duration-300"
              style={{ background: i <= score ? barColor : '#e2e8f0' }} />
          ))}
        </div>
        <span className="text-[11px] font-bold transition-colors" style={{ color: barColor }}>{label}</span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {checks.map(c => (
          <span key={c.label} className={`text-[10px] transition-colors ${c.ok ? 'text-green-600 font-medium' : 'text-slate-300'}`}>
            {c.ok ? '✓' : '·'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Recovery-key reveal modal ────────────────────────────────────────────── */
function RecoveryKeyModal({ keyValue, onClose }: { keyValue: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(keyValue).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={20} className="text-amber-500 shrink-0" />
            <h3 className="text-base font-black text-slate-900">Your recovery key</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-snug">
          <strong>Store this somewhere safe.</strong> It is shown only once and can&rsquo;t be retrieved
          again. If you ever forget your password, type this key into the password field on the login
          screen to sign in, then set a new password here.
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 select-all tracking-wider break-all">
            {keyValue}
          </div>
          <button onClick={copy}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: copied ? '#dcfce7' : '#f1f5f9',
              color: copied ? '#166534' : '#475569',
              border: `1px solid ${copied ? '#bbf7d0' : '#e2e8f0'}`,
            }}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <button onClick={onClose}
          className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all"
          style={{ background: '#1565C0' }}>
          I&rsquo;ve saved it — close
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const [user, setUser]   = useState<any>(null);

  const [name, setName]           = useState('');
  const [username, setUsername]   = useState('');
  const [employeeId, setEmpId]    = useState('');
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityMsg, setIdentityMsg] = useState('');

  const [notifTaskAssigned, setNA]   = useState(true);
  const [notifTaskDueSoon, setNDS]   = useState(true);
  const [notifTaskOverdue, setNO]    = useState(true);
  const [notifProjectUpdate, setNPU] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg]     = useState('');
  const [pwErr, setPwErr]     = useState('');

  const [hasRecoveryKey, setHasRecoveryKey]   = useState<boolean | null>(null);
  const [recoveryKeyBusy, setRecoveryKeyBusy] = useState(false);
  const [generatedKey, setGeneratedKey]       = useState<string | null>(null);

  // Quick PIN section state.
  const [pin, setPin]           = useState('');
  const [pinConfirm, setPinCnf] = useState('');
  const [pinBusy, setPinBusy]   = useState(false);
  const [pinMsg, setPinMsg]     = useState('');
  const [pinErr, setPinErr]     = useState('');

  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    setPinMsg(''); setPinErr('');
    if (!/^\d{4,6}$/.test(pin)) { setPinErr('PIN must be 4–6 digits.'); return; }
    if (pin !== pinConfirm) { setPinErr("PINs don't match."); return; }
    setPinBusy(true);
    try {
      await api('/auth/pin', { method: 'POST', body: { pin } });
      setPinMsg(user?.pinSet ? 'Quick PIN updated.' : 'Quick PIN saved — you can sign in with it next time on this device.');
      setPin(''); setPinCnf('');
      const d: any = await api('/users/me');
      setUser(d.user);
    } catch (err: any) {
      setPinErr(err.message || 'Failed to save PIN.');
    } finally { setPinBusy(false); }
  }

  async function removePin() {
    if (!window.confirm('Remove your quick PIN? You will need your full password to sign in again.')) return;
    setPinBusy(true);
    try {
      await api('/auth/pin', { method: 'DELETE' });
      setPinMsg('Quick PIN removed.');
      const d: any = await api('/users/me');
      setUser(d.user);
    } catch (err: any) {
      setPinErr(err.message || 'Failed to remove PIN.');
    } finally { setPinBusy(false); }
  }

  useEffect(() => {
    api('/users/me').then((d: any) => {
      const u = d.user;
      setUser(u);
      setName(u.name || '');
      setUsername(u.username || '');
      setEmpId(u.employeeId || '');
      setNA(u.notifTaskAssigned  ?? true);
      setNDS(u.notifTaskDueSoon  ?? true);
      setNO(u.notifTaskOverdue   ?? true);
      setNPU(u.notifProjectUpdate ?? false);
      if (u.role === 'admin') {
        api('/auth/security-key').then((r: any) => setHasRecoveryKey(r.hasKey)).catch(() => {});
      }
    });
  }, []);

  async function generateRecoveryKey() {
    setRecoveryKeyBusy(true);
    try {
      const r: any = await api('/auth/security-key', { method: 'POST' });
      setGeneratedKey(r.key);
      setHasRecoveryKey(true);
    } catch {
      alert('Failed to generate recovery key. Please try again.');
    } finally {
      setRecoveryKeyBusy(false);
    }
  }

  const isPM = (user?.role === 'pm' || user?.role === 'lead' || user?.role === 'admin');

  const locked = !!user?.profileLocked;

  async function saveIdentity(e?: React.FormEvent) {
    e?.preventDefault();
    setIdentityMsg(''); setIdentitySaving(true);
    try {
      await api('/users/me', { method: 'PATCH', body: { name, username: username.toLowerCase(), employeeId } });
      setIdentityMsg('Saved — these are now locked.');
      // Refresh so the form flips to read-only.
      const d: any = await api('/users/me');
      setUser(d.user);
      setTimeout(() => setIdentityMsg(''), 3000);
    } catch (err: any) { setIdentityMsg(err.message || 'Save failed.'); }
    finally { setIdentitySaving(false); }
  }

  async function saveNotif(key: string, value: boolean) {
    setNotifSaving(true);
    try { await api('/users/me', { method: 'PATCH', body: { [key]: value } }); }
    finally { setNotifSaving(false); }
  }

  const pwStrong  = next.length >= 8 && /[A-Z]/.test(next) && /[a-z]/.test(next) && /[0-9]/.test(next) && /[^A-Za-z0-9]/.test(next);
  const pwMatches = next === confirm && next.length > 0;

  async function savePw(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(''); setPwMsg('');
    if (!pwStrong || !pwMatches) return;
    setPwSaving(true);
    try {
      await api('/auth/password', { method: 'PATCH', body: { currentPassword: current, newPassword: next } });
      setPwMsg('Password updated successfully.');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err: any) { setPwErr(err.message || 'Failed to update password.'); }
    finally { setPwSaving(false); }
  }

  if (!user) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-sm text-slate-400">Loading profile…</span>
      </div>
    </div>
  );

  // Render name with employee ID in parentheses if both present.

  return (
    <div className="max-w-4xl pb-12 space-y-5">

      {/* ── Hero profile card ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 px-7 py-6 flex items-center gap-5"
        style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.05), 0 1px 2px rgba(15,23,42,0.03)' }}>
        <div className="shrink-0">
          <Avatar name={user.name} size={64} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-black text-slate-900 tracking-tight truncate">{user.name}</h1>
            <RoleBadge role={user.role} />
          </div>
          <div className="mt-1 text-xs text-slate-400 font-mono">@{user.username || user.email}</div>
        </div>
      </div>

      {/* ── 2-column: Identity + (Notifications + Security) ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Left: Identity form */}
        <div className="lg:col-span-3">
          <Section icon={User} title="Personal details"
            subtitle={locked
              ? 'Your identity is set. Ask an admin if something needs to change.'
              : 'Set these once — they lock after you save. Choose carefully.'}>
            {locked ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ReadonlyField label="Full name" value={user.name} />
                <ReadonlyField label="Username" value={`@${user.username || user.email}`} />
                <ReadonlyField label="Employee ID" value={user.employeeId || '—'} />
                <ReadonlyField label="Role" value={isPM ? 'Team Leader' : 'Individual Contributor'} />
              </div>
            ) : (
              <form onSubmit={saveIdentity} className="space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-snug">
                  Heads up: your name, username and employee ID can be set <strong>once</strong>.
                  After you save, only an admin can change them.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Full name">
                    <input className="input" value={name} onChange={e => setName(e.target.value)} required />
                  </Field>
                  <Field label="Username">
                    <input className="input font-mono lowercase" value={username}
                      onChange={e => setUsername(e.target.value.toLowerCase())}
                      placeholder="firstname.lastname"
                      pattern="[a-z][a-z0-9_.]{1,28}[a-z0-9_]" required />
                  </Field>
                  <Field label="Employee ID">
                    <input className="input" value={employeeId} onChange={e => setEmpId(e.target.value)} placeholder="e.g. 100245" />
                  </Field>
                  <ReadonlyField label="Role" value={isPM ? 'Team Leader' : 'Individual Contributor'} />
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button type="submit" className="btn-primary" disabled={identitySaving}>
                    {identitySaving ? 'Saving…' : 'Save & lock'}
                  </button>
                  {identityMsg && <span className="text-xs text-green-600 font-medium">{identityMsg}</span>}
                </div>
              </form>
            )}
          </Section>

          {/* Activity heatmap — sits in the left column, beside the Security
              card on the right (#7). */}
          <div className="mt-5">
            <Section icon={Activity} title="Activity" subtitle="Your completed tasks over the last year.">
              <ActivityGraph />
            </Section>
          </div>
        </div>

        {/* Right: Notifications + Security stacked */}
        <div className="lg:col-span-2 space-y-5">

          {/* Notifications */}
          <div id="notifications" className="scroll-mt-6">
          <Section icon={Bell} title="Notifications" subtitle="What shows up on your dashboard.">
            <div className={notifSaving ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}>
              <Toggle label="Task assigned to me"  description="When a PM assigns you a new task."
                checked={notifTaskAssigned} onChange={v => { setNA(v); saveNotif('notifTaskAssigned', v); }} />
              <Toggle label="Due in 24 hours"       description="Morning reminder before a deadline."
                checked={notifTaskDueSoon}  onChange={v => { setNDS(v); saveNotif('notifTaskDueSoon', v); }} />
              <Toggle label="Task overdue"          description="When a task passes its due date."
                checked={notifTaskOverdue}  onChange={v => { setNO(v); saveNotif('notifTaskOverdue', v); }} />
              <Toggle label="Project updates"       description="When a project you're on changes status."
                checked={notifProjectUpdate} onChange={v => { setNPU(v); saveNotif('notifProjectUpdate', v); }} />
            </div>
            <p className="text-[11px] text-slate-400 mt-3 leading-snug">
              These appear on your dashboard — Pragati never sends email.
            </p>
          </Section>
          </div>

          {/* Security */}
          <div id="security" className="scroll-mt-6">
          <Section icon={Lock} title="Security" subtitle="Change your login password.">
            <form onSubmit={savePw} className="space-y-3.5">
              <Field label="Current password">
                <input type="password" className="input" autoComplete="current-password"
                  value={current} onChange={e => setCurrent(e.target.value)} placeholder="••••••••" />
              </Field>
              <Field label="New password">
                <input type="password" className="input" autoComplete="new-password"
                  value={next} onChange={e => setNext(e.target.value)} placeholder="Min 8 characters" />
                <StrengthMeter password={next} />
              </Field>
              <Field label="Confirm password">
                <input type="password"
                  className={`input ${confirm && !pwMatches ? 'border-red-300 focus:border-red-400' : ''}`}
                  autoComplete="new-password"
                  value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
                {confirm && !pwMatches && <p className="text-[11px] text-red-500 mt-1">Passwords don't match.</p>}
              </Field>
              {pwErr && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwErr}</div>}
              {pwMsg && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ {pwMsg}</div>}
              <button type="submit" className="btn-primary w-full justify-center"
                disabled={!current || !pwStrong || !pwMatches || pwSaving}>
                {pwSaving ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </Section>
          </div>

          {/* Quick PIN — skip the full password on a remembered device */}
          <div id="quick-pin" className="scroll-mt-6">
          <Section icon={Lock} title="Quick PIN"
            subtitle={user?.pinSet
              ? 'Your quick PIN is set. Sign in with it on any device you log in from.'
              : 'Set a 4–6 digit PIN to sign back in without your full password on this device.'}>
            <form onSubmit={savePin} className="space-y-3.5">
              <Field label={user?.pinSet ? 'New PIN' : 'Choose a PIN'}>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  className="input text-center text-lg font-mono tracking-[0.4em]"
                  maxLength={6}
                  pattern="\d{4,6}"
                  placeholder="••••"
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Field label="Confirm PIN">
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  className="input text-center text-lg font-mono tracking-[0.4em]"
                  maxLength={6}
                  pattern="\d{4,6}"
                  placeholder="••••"
                  value={pinConfirm}
                  onChange={e => setPinCnf(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              {pinErr && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pinErr}</div>}
              {pinMsg && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ {pinMsg}</div>}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1 justify-center"
                  disabled={pinBusy || pin.length < 4 || pin !== pinConfirm}>
                  {pinBusy ? 'Saving…' : (user?.pinSet ? 'Update PIN' : 'Save PIN')}
                </button>
                {user?.pinSet && (
                  <button type="button" onClick={removePin} disabled={pinBusy}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors">
                    Remove
                  </button>
                )}
              </div>
            </form>
          </Section>
          </div>

          {/* Admin recovery key — admins only */}
          {user.role === 'admin' && (
            <div id="recovery-key" className="scroll-mt-6">
              <Section icon={ShieldCheck} title="Recovery key"
                subtitle="Sign in with this if you ever forget your password.">
                <div className="space-y-3.5">
                  <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-xs text-slate-500 leading-snug">
                    {hasRecoveryKey === null
                      ? 'Checking…'
                      : hasRecoveryKey
                        ? <><span className="text-green-700 font-semibold">✓ Key is set.</span> Regenerate it only if you think it has been exposed — the old key stops working.</>
                        : <><span className="text-amber-700 font-semibold">No key yet.</span> Generate one and keep it safe so you&rsquo;re never locked out.</>}
                  </div>
                  <button type="button" onClick={generateRecoveryKey}
                    disabled={recoveryKeyBusy || hasRecoveryKey === null}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
                    style={{
                      background: hasRecoveryKey ? '#f8fafc' : '#1565C0',
                      color: hasRecoveryKey ? '#475569' : '#ffffff',
                      border: hasRecoveryKey ? '1px solid #e2e8f0' : 'none',
                      opacity: recoveryKeyBusy || hasRecoveryKey === null ? 0.6 : 1,
                    }}>
                    <RefreshCw size={14} className={recoveryKeyBusy ? 'animate-spin' : ''} />
                    {recoveryKeyBusy ? 'Generating…' : hasRecoveryKey ? 'Regenerate recovery key' : 'Generate recovery key'}
                  </button>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    To use it: on the login screen, enter your email and type this key in the
                    password box. You&rsquo;ll be signed in and can set a new password here.
                  </p>
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>

      {generatedKey && (
        <RecoveryKeyModal keyValue={generatedKey} onClose={() => setGeneratedKey(null)} />
      )}
    </div>
  );
}
