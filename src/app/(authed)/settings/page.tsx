'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { Avatar } from '@/components/ui';

/* ── helpers ──────────────────────────────────────────────────── */
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function ReadonlyField({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-500">{value || '—'}</div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap" style={{ background: '#EFF6FF', color: '#1565C0' }}>
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        <div className="text-xs text-slate-400 mt-0.5">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5"
        style={{ background: checked ? '#1565C0' : '#e2e8f0' }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
          style={{ left: checked ? '17px' : '2px' }}
        />
      </button>
    </div>
  );
}

function StrengthMeter({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters',    ok: password.length >= 8 },
    { label: 'Uppercase',        ok: /[A-Z]/.test(password) },
    { label: 'Lowercase',        ok: /[a-z]/.test(password) },
    { label: 'Number',           ok: /[0-9]/.test(password) },
    { label: 'Special char',     ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const barColor = score <= 2 ? '#ef4444' : score <= 3 ? '#f59e0b' : '#22c55e';
  const label = ['', 'Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 flex-1">
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="h-1 flex-1 rounded-sm transition-all" style={{ background: i <= score ? barColor : '#e2e8f0' }} />
          ))}
        </div>
        <span className="text-xs font-semibold" style={{ color: barColor }}>{label}</span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {checks.map((c) => (
          <span key={c.label} style={{ fontSize: 10 }} className={c.ok ? 'text-green-600' : 'text-slate-400'}>
            {c.ok ? '✓' : '·'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── main page ─────────────────────────────────────────────────── */
export default function SettingsPage() {
  const [user, setUser]   = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  // Identity form
  const [name, setName]           = useState('');
  const [title, setTitle]         = useState('');
  const [department, setDept]     = useState('');
  const [phone, setPhone]         = useState('');
  const [location, setLocation]   = useState('');
  const [employeeId, setEmpId]    = useState('');
  const [managerName, setManager] = useState('');
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityMsg, setIdentityMsg] = useState('');

  // Notifications
  const [notifTaskAssigned, setNA]  = useState(true);
  const [notifTaskDueSoon, setNDS]  = useState(true);
  const [notifTaskOverdue, setNO]   = useState(true);
  const [notifProjectUpdate, setNPU]= useState(false);
  const [notifSaving, setNotifSaving] = useState(false);

  // Password
  const [current, setCurrent]   = useState('');
  const [next, setNext]         = useState('');
  const [confirm, setConfirm]   = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg]       = useState('');
  const [pwErr, setPwErr]       = useState('');

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
      setManager(u.managerName || '');
      setNA(u.notifTaskAssigned  ?? true);
      setNDS(u.notifTaskDueSoon  ?? true);
      setNO(u.notifTaskOverdue   ?? true);
      setNPU(u.notifProjectUpdate ?? false);
    });
    api('/users/me/stats').then(setStats);
  }, []);

  const isLdapSynced = !!user?.ldapSyncedAt;

  async function saveIdentity(e: React.FormEvent) {
    e.preventDefault();
    setIdentityMsg('');
    setIdentitySaving(true);
    try {
      await api('/users/me', {
        method: 'PATCH',
        body: { name, title, department, phone, location, employeeId, managerName },
      });
      setIdentityMsg('Saved successfully.');
    } catch (err: any) {
      setIdentityMsg(err.message || 'Save failed.');
    } finally {
      setIdentitySaving(false);
    }
  }

  async function saveNotif(key: string, value: boolean) {
    setNotifSaving(true);
    try { await api('/users/me', { method: 'PATCH', body: { [key]: value } }); }
    finally { setNotifSaving(false); }
  }

  const pwStrong = next.length >= 8 && /[A-Z]/.test(next) && /[a-z]/.test(next) && /[0-9]/.test(next) && /[^A-Za-z0-9]/.test(next);
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
    } catch (err: any) {
      setPwErr(err.message || 'Failed to update password.');
    } finally {
      setPwSaving(false);
    }
  }

  if (!user) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-5 pb-10">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="pt-1">
        <h1 className="text-2xl font-bold text-slate-900">Profile & Settings</h1>
        <p className="text-xs text-slate-400 mt-0.5">Manage your identity, notifications, and security.</p>
      </div>

      {/* ── Identity ────────────────────────────────────────────────── */}
      <Section
        title="Identity"
        subtitle={isLdapSynced
          ? `Synced from Alembic IT · Active Directory · Last synced ${new Date(user.ldapSyncedAt).toLocaleString()}`
          : 'Edit your details below. These fields will be auto-populated when LDAP sync is enabled by IT.'}
      >
        {/* Avatar row */}
        <div className="flex items-center gap-4 mb-6 pb-5 border-b border-slate-100">
          <Avatar name={user.name} size={56} />
          <div>
            <div className="font-bold text-slate-900">{user.name}</div>
            <div className="text-sm text-slate-500">{user.title || 'No title set'}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs px-2 py-0.5 rounded font-semibold"
                style={{ background: user.role === 'pm' ? '#EFF6FF' : '#F0FDF4', color: user.role === 'pm' ? '#1565C0' : '#15803d' }}>
                {user.role === 'pm' ? 'Project Manager' : 'Team Member'}
              </span>
              {isLdapSynced && (
                <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: '#F0FDF4', color: '#15803d' }}>
                  ✓ LDAP synced
                </span>
              )}
            </div>
          </div>
        </div>

        {isLdapSynced ? (
          /* ── LDAP-managed: all read-only ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadonlyField label="Full name"    value={user.name}        badge="LDAP" />
            <ReadonlyField label="Employee ID"  value={user.employeeId}  badge="LDAP" />
            <ReadonlyField label="Job title"    value={user.title}       badge="LDAP" />
            <ReadonlyField label="Department"   value={user.department}  badge="LDAP" />
            <ReadonlyField label="Manager"      value={user.managerName} badge="LDAP" />
            <ReadonlyField label="Email"        value={user.email} />
            <div className="col-span-2 border-t border-slate-100 pt-4 mt-1 grid grid-cols-2 gap-4">
              <Field label="Phone">
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
              </Field>
              <Field label="Office / site">
                <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Vadodara HQ" />
              </Field>
            </div>
            <div className="col-span-2">
              <button onClick={() => saveIdentity({ preventDefault: () => {} } as any)}
                className="btn-primary" disabled={identitySaving}>
                {identitySaving ? 'Saving…' : 'Save contact details'}
              </button>
              {identityMsg && <span className="ml-3 text-xs text-green-600">{identityMsg}</span>}
            </div>
          </div>
        ) : (
          /* ── Manual: all editable ── */
          <form onSubmit={saveIdentity} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full name" hint="Will be overwritten by LDAP displayName on sync">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="Employee ID" hint="sAMAccountName / employeeID from AD">
                <input className="input" value={employeeId} onChange={(e) => setEmpId(e.target.value)} placeholder="EMP-001" />
              </Field>
              <Field label="Job title">
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Validation Engineer" />
              </Field>
              <Field label="Department">
                <input className="input" value={department} onChange={(e) => setDept(e.target.value)} placeholder="Quality IT" />
              </Field>
              <Field label="Manager">
                <input className="input" value={managerName} onChange={(e) => setManager(e.target.value)} placeholder="Manager's display name" />
              </Field>
              <Field label="Phone">
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
              </Field>
              <Field label="Office / site">
                <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Vadodara HQ" />
              </Field>
              <ReadonlyField label="Email" value={user.email} />
              <ReadonlyField label="Role" value={user.role === 'pm' ? 'Project Manager' : 'Team Member'} />
            </div>
            {identityMsg && (
              <p className="text-xs text-green-600 font-medium">{identityMsg}</p>
            )}
            <div className="flex items-center gap-3 pt-1">
              <button type="submit" className="btn-primary" disabled={identitySaving}>
                {identitySaving ? 'Saving…' : 'Save changes'}
              </button>
              <p className="text-xs text-slate-400">
                LDAP sync not yet configured · contact IT to enable auto-populate
              </p>
            </div>
          </form>
        )}
      </Section>

      {/* ── My Activity ─────────────────────────────────────────────── */}
      {stats && (
        <Section title="My Activity" subtitle="Your contribution at a glance.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Done this month', value: stats.doneThisMonth, color: '#15803d' },
              { label: 'Done this year',  value: stats.doneThisYear,  color: '#1565C0' },
              { label: 'Total completed', value: stats.totalDone,     color: '#0f172a' },
              { label: 'GxP tasks done',  value: stats.gxpDone,       color: '#7c3aed' },
              { label: 'Open tasks',      value: stats.openTasks,     color: '#0f172a' },
              { label: 'Overdue',         value: stats.overdueTasks,  color: stats.overdueTasks > 0 ? '#dc2626' : '#0f172a' },
              { label: 'Projects on',     value: stats.projectCount,  color: '#0f172a' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
                <div style={{ fontSize: 10, letterSpacing: '0.07em' }} className="text-slate-400 uppercase font-semibold">{label}</div>
                <div className="text-2xl font-black mt-1" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Notification preferences ─────────────────────────────────── */}
      <Section title="Notification Preferences" subtitle="Choose which emails Pragati sends you.">
        <div className={notifSaving ? 'opacity-60 pointer-events-none' : ''}>
          <Toggle
            label="Task assigned to me"
            description="When a PM assigns a new task to you."
            checked={notifTaskAssigned}
            onChange={(v) => { setNA(v); saveNotif('notifTaskAssigned', v); }}
          />
          <Toggle
            label="Task due in 24 hours"
            description="Morning reminder before a deadline."
            checked={notifTaskDueSoon}
            onChange={(v) => { setNDS(v); saveNotif('notifTaskDueSoon', v); }}
          />
          <Toggle
            label="Task overdue"
            description="When one of your tasks passes its due date."
            checked={notifTaskOverdue}
            onChange={(v) => { setNO(v); saveNotif('notifTaskOverdue', v); }}
          />
          <Toggle
            label="Project updates"
            description="When a project you're on changes status."
            checked={notifProjectUpdate}
            onChange={(v) => { setNPU(v); saveNotif('notifProjectUpdate', v); }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Emails are sent to <strong>{user.email}</strong>. Configure SMTP in .env to enable delivery.
        </p>
      </Section>

      {/* ── Security ────────────────────────────────────────────────── */}
      <Section title="Security" subtitle="Change your login password.">
        <form onSubmit={savePw} className="space-y-4">
          <Field label="Current password">
            <input type="password" className="input" autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••" />
          </Field>
          <Field label="New password">
            <input type="password" className="input" autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)} placeholder="Min 8 characters" />
            <StrengthMeter password={next} />
          </Field>
          <Field label="Confirm new password">
            <input type="password"
              className={`input ${confirm && !pwMatches ? 'border-red-300' : ''}`}
              autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" />
            {confirm && !pwMatches && <p className="text-xs text-red-500 mt-1">Passwords don't match.</p>}
          </Field>
          {pwErr && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwErr}</div>}
          {pwMsg && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{pwMsg}</div>}
          <button type="submit" className="btn-primary" disabled={!current || !pwStrong || !pwMatches || pwSaving}>
            {pwSaving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </Section>

    </div>
  );
}
