'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import {
  User, Mail, Phone, MapPin, Building2, Briefcase, ShieldCheck,
  Bell, Lock, BadgeCheck, CheckCircle2, AlertTriangle, TrendingUp,
  FolderKanban, Layers, CalendarCheck, Activity,
} from 'lucide-react';

/* ── Avatar initials ──────────────────────────────────────────────────────── */
function BigAvatar({ name, size = 72 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const hue = Math.abs(name.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0)) % 360;
  const bg  = `hsl(${hue},45%,40%)`;
  return (
    <div className="rounded-full flex items-center justify-center font-black text-white select-none shrink-0"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.33, letterSpacing: '-0.02em' }}>
      {initials}
    </div>
  );
}

/* ── Stat tile ────────────────────────────────────────────────────────────── */
function StatTile({ icon: Icon, label, value, color, bg }: { icon: any; label: string; value: any; color: string; bg: string }) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border px-4 py-3.5" style={{ borderColor: 'rgba(210,218,228,0.8)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: bg }}>
        <Icon size={15} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 10, letterSpacing: '0.07em' }} className="text-slate-400 uppercase font-semibold">{label}</div>
        <div className="text-xl font-black tracking-tight" style={{ color }}>{value ?? '—'}</div>
      </div>
    </div>
  );
}

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
function ReadonlyField({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 text-sm text-slate-500 leading-none">
          {value || <span className="text-slate-300">—</span>}
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap" style={{ background: '#EFF6FF', color: '#1565C0' }}>
            {badge}
          </span>
        )}
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

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const [user, setUser]   = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  const [name, setName]           = useState('');
  const [title, setTitle]         = useState('');
  const [department, setDept]     = useState('');
  const [phone, setPhone]         = useState('');
  const [location, setLocation]   = useState('');
  const [employeeId, setEmpId]    = useState('');
  const [managerName, setManager] = useState('');
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
      setManager(u.managerName || '');
      setNA(u.notifTaskAssigned  ?? true);
      setNDS(u.notifTaskDueSoon  ?? true);
      setNO(u.notifTaskOverdue   ?? true);
      setNPU(u.notifProjectUpdate ?? false);
    });
    api('/users/me/stats').then(setStats);
  }, []);

  const isLdap = !!user?.ldapSyncedAt;
  const isPM   = user?.role === 'pm';

  async function saveIdentity(e?: React.FormEvent) {
    e?.preventDefault();
    setIdentityMsg(''); setIdentitySaving(true);
    try {
      await api('/users/me', { method: 'PATCH', body: { name, title, department, phone, location, employeeId, managerName } });
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

  return (
    <div className="max-w-4xl pb-12 space-y-5">

      {/* ── Hero profile card ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{
        background: 'linear-gradient(135deg, #071223 0%, #0B1E3A 60%, #0D2347 100%)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1)',
      }}>
        {/* Banner dots */}
        <div className="absolute pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '24px 24px', inset: 0, borderRadius: 16,
        }} />

        <div className="relative px-8 py-7 flex items-center gap-6">
          {/* Avatar ring */}
          <div className="shrink-0 p-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', boxShadow: '0 0 0 2px rgba(255,255,255,0.12)' }}>
            <BigAvatar name={user.name} size={72} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-white tracking-tight">{user.name}</h1>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{
                background: isPM ? 'rgba(21,101,192,0.35)' : 'rgba(43,140,41,0.35)',
                color: isPM ? '#90CAF9' : '#A5D6A7',
              }}>
                {isPM ? 'Project Manager' : 'Team Member'}
              </span>
              {isLdap && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(34,197,94,0.2)', color: '#86EFAC' }}>
                  <CheckCircle2 size={10} /> LDAP synced
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              {user.title && (
                <span className="text-white/60 text-sm flex items-center gap-1.5">
                  <Briefcase size={12} className="text-white/30" />{user.title}
                </span>
              )}
              {user.department && (
                <span className="text-white/60 text-sm flex items-center gap-1.5">
                  <Building2 size={12} className="text-white/30" />{user.department}
                </span>
              )}
              {user.location && (
                <span className="text-white/60 text-sm flex items-center gap-1.5">
                  <MapPin size={12} className="text-white/30" />{user.location}
                </span>
              )}
              <span className="text-white/40 text-sm flex items-center gap-1.5">
                <Mail size={12} className="text-white/20" />{user.email}
              </span>
            </div>
            {user.employeeId && (
              <div className="mt-2">
                <span className="text-[11px] font-mono text-white/30">ID: {user.employeeId}</span>
              </div>
            )}
          </div>

          {/* Right: sync note */}
          <div className="shrink-0 hidden md:block text-right">
            {isLdap ? (
              <div>
                <div className="text-[10px] text-white/30 uppercase tracking-wider">Last synced</div>
                <div className="text-xs text-white/50 mt-0.5">{new Date(user.ldapSyncedAt).toLocaleDateString()}</div>
              </div>
            ) : (
              <div>
                <div className="text-[10px] text-white/25 uppercase tracking-wider">LDAP sync</div>
                <div className="text-[11px] text-white/35 mt-0.5">Contact IT to enable</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Activity stats strip ──────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
          <StatTile icon={CalendarCheck} label="This month"   value={stats.doneThisMonth}                    color="#15803d" bg="#F0FDF4" />
          <StatTile icon={TrendingUp}    label="This year"    value={stats.doneThisYear}                     color="#1565C0" bg="#EFF6FF" />
          <StatTile icon={CheckCircle2}  label="All time"     value={stats.totalDone}                        color="#0f172a" bg="#f1f5f9" />
          <StatTile icon={ShieldCheck}   label="GxP done"     value={stats.gxpDone}                          color="#7c3aed" bg="#F5F3FF" />
          <StatTile icon={Activity}      label="Open tasks"   value={stats.openTasks}                        color="#0f172a" bg="#f1f5f9" />
          <StatTile icon={AlertTriangle} label="Overdue"      value={stats.overdueTasks}
            color={stats.overdueTasks > 0 ? '#dc2626' : '#0f172a'}
            bg={stats.overdueTasks > 0 ? '#FEF2F2' : '#f1f5f9'} />
          <StatTile icon={FolderKanban}  label="Projects"     value={stats.projectCount}                     color="#0369a1" bg="#F0F9FF" />
        </div>
      )}

      {/* ── 2-column: Identity + (Notifications + Security) ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Left: Identity form — wider */}
        <div className="lg:col-span-3">
          <Section
            icon={User}
            title="Identity"
            subtitle={isLdap
              ? `Managed by Alembic Active Directory · Last synced ${new Date(user.ldapSyncedAt).toLocaleString()}`
              : 'Edit your details. Fields will auto-populate when IT enables LDAP sync.'}
          >
            {isLdap ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <ReadonlyField label="Full name"   value={user.name}        badge="AD" />
                  <ReadonlyField label="Employee ID" value={user.employeeId}  badge="AD" />
                  <ReadonlyField label="Job title"   value={user.title}       badge="AD" />
                  <ReadonlyField label="Department"  value={user.department}  badge="AD" />
                  <ReadonlyField label="Manager"     value={user.managerName} badge="AD" />
                  <ReadonlyField label="Email"       value={user.email} />
                </div>
                <div className="pt-3 border-t" style={{ borderColor: '#f1f5f9' }}>
                  <p className="text-xs text-slate-400 mb-3">Phone and office location can still be edited manually.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Phone">
                      <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 …" />
                    </Field>
                    <Field label="Office / site">
                      <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Vadodara HQ" />
                    </Field>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <button className="btn-primary" onClick={() => saveIdentity()} disabled={identitySaving}>
                      {identitySaving ? 'Saving…' : 'Save contact details'}
                    </button>
                    {identityMsg && <span className="text-xs text-green-600 font-medium">✓ {identityMsg}</span>}
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={saveIdentity} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Full name" hint="Will be overwritten by LDAP on sync">
                    <input className="input" value={name} onChange={e => setName(e.target.value)} required />
                  </Field>
                  <Field label="Employee ID" hint="sAMAccountName from Active Directory">
                    <input className="input" value={employeeId} onChange={e => setEmpId(e.target.value)} placeholder="EMP-001" />
                  </Field>
                  <Field label="Job title">
                    <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Validation Engineer" />
                  </Field>
                  <Field label="Department">
                    <input className="input" value={department} onChange={e => setDept(e.target.value)} placeholder="Quality IT" />
                  </Field>
                  <Field label="Manager">
                    <input className="input" value={managerName} onChange={e => setManager(e.target.value)} placeholder="Manager's display name" />
                  </Field>
                  <Field label="Phone">
                    <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 …" />
                  </Field>
                  <Field label="Office / site">
                    <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Vadodara HQ" />
                  </Field>
                  <ReadonlyField label="Email"  value={user.email} />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-3">
                    <button type="submit" className="btn-primary" disabled={identitySaving}>
                      {identitySaving ? 'Saving…' : 'Save changes'}
                    </button>
                    {identityMsg && <span className="text-xs text-green-600 font-medium">✓ {identityMsg}</span>}
                  </div>
                  <span className="text-[11px] text-slate-400">LDAP not configured · contact IT</span>
                </div>
              </form>
            )}
          </Section>
        </div>

        {/* Right: Notifications + Security stacked */}
        <div className="lg:col-span-2 space-y-5">

          {/* Notifications */}
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

          {/* Security */}
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
  );
}
