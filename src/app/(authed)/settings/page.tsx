'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { Avatar } from '@/components/ui';
import {
  User, Bell, Lock, Briefcase, Building2, MapPin, Mail, Phone,
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

const COMPANY_NAME = 'Alembic Pharmaceuticals Ltd';

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const [user, setUser]   = useState<any>(null);

  const [name, setName]           = useState('');
  const [title, setTitle]         = useState('');
  const [department, setDept]     = useState('');
  const [phone, setPhone]         = useState('');
  const [location, setLocation]   = useState('');
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

  useEffect(() => {
    api('/users/me').then((d: any) => {
      const u = d.user;
      setUser(u);
      setName(u.name || '');
      setTitle(u.title || '');
      setDept(u.department || '');
      setPhone(u.phone || '');
      setLocation(u.location || '');
      setEmpId(u.employeeId || '');
      setNA(u.notifTaskAssigned  ?? true);
      setNDS(u.notifTaskDueSoon  ?? true);
      setNO(u.notifTaskOverdue   ?? true);
      setNPU(u.notifProjectUpdate ?? false);
    });
  }, []);

  const isPM = (user?.role === 'pm' || user?.role === 'lead');

  async function saveIdentity(e?: React.FormEvent) {
    e?.preventDefault();
    setIdentityMsg(''); setIdentitySaving(true);
    try {
      await api('/users/me', { method: 'PATCH', body: { name, title, department, phone, location, employeeId } });
      setIdentityMsg('Saved');
      setTimeout(() => setIdentityMsg(''), 2500);
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
  const nameWithId = employeeId ? `${user.name} (${employeeId})` : user.name;

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
            <h1 className="text-xl font-black text-slate-900 tracking-tight truncate">{nameWithId}</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{
              background: isPM ? '#E3F2FD' : '#E8F5E9',
              color: isPM ? '#1565C0' : '#2E7D32',
            }}>
              {isPM ? 'Lead' : 'Individual Contributor'}
            </span>
          </div>
          <div className="mt-1 text-sm text-slate-500">{COMPANY_NAME}</div>
          <div className="mt-0.5 text-xs text-slate-400 flex items-center gap-1.5">
            <Mail size={11} className="text-slate-300" />
            {user.email}
          </div>
        </div>
      </div>

      {/* ── 2-column: Identity + (Notifications + Security) ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Left: Identity form */}
        <div className="lg:col-span-3">
          <Section icon={User} title="Personal details" subtitle="Your profile as it appears across Pragati.">
            <form onSubmit={saveIdentity} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Full name">
                  <input className="input" value={name} onChange={e => setName(e.target.value)} required />
                </Field>
                <Field label="Employee ID">
                  <input className="input" value={employeeId} onChange={e => setEmpId(e.target.value)} placeholder="e.g. 27207" />
                </Field>
                <ReadonlyField label="Company" value={COMPANY_NAME} />
                <ReadonlyField label="Email" value={user.email} />
                <Field label="Designation">
                  <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Executive" />
                </Field>
                <Field label="Function">
                  <input className="input" value={department} onChange={e => setDept(e.target.value)} placeholder="e.g. QA-IT" />
                </Field>
                <Field label="Location">
                  <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Panelav" />
                </Field>
                <Field label="Extension / phone">
                  <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="—" />
                </Field>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button type="submit" className="btn-primary" disabled={identitySaving}>
                  {identitySaving ? 'Saving…' : 'Save changes'}
                </button>
                {identityMsg && <span className="text-xs text-green-600 font-medium">✓ {identityMsg}</span>}
              </div>
            </form>
          </Section>
        </div>

        {/* Right: Notifications + Security stacked */}
        <div className="lg:col-span-2 space-y-5">

          {/* Notifications */}
          <div id="notifications" className="scroll-mt-6">
          <Section icon={Bell} title="Notifications" subtitle="Emails Pragati sends you.">
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
              Sent to <span className="font-semibold text-slate-500">{user.email}</span>
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
        </div>
      </div>
    </div>
  );
}
