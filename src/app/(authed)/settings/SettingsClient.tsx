'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { api } from '@/lib/client/api';
import { Avatar } from '@/components/ui';
// The contribution heatmap is a sizeable, below-the-fold client component —
// lazy-load it so it never blocks first paint of the profile page.
const ActivityGraph = dynamic(
  () => import('@/components/ActivityGraph').then(m => m.ActivityGraph),
  { ssr: false, loading: () => <div className="h-40 rounded-xl bg-slate-50 animate-pulse" /> },
);
import {
  User, Lock, ShieldCheck, Copy, Check, RefreshCw, X, Activity, KeyRound,
  AlertTriangle, ServerCog, MoreHorizontal, ChevronDown, Pencil,
} from 'lucide-react';


import { MonogramEditor } from '@/components/MonogramEditor';

/* ── Profile avatar wrapper ───────────────────────────────────────────────
   Renders the user's monogram avatar with a hover-overlay "edit" hint.
   The avatar is always the standard Avatar component — the editor below
   passes letter/bg/font through, so the preview here matches every other
   surface where this user is shown. */
function ProfileAvatar({
  name, letter, bg, font, size = 88, onClick,
}: {
  name?: string | null;
  letter?: string; bg?: string; font?: number;
  size?: number;
  onClick?: () => void;
}) {
  const inner = <Avatar name={name} size={size} letter={letter} bg={bg} font={font} />;

  // The profile picture is now purely a portrait — no hover overlay. (It used
  // to flash an "ACHIEVEMENTS" trophy on hover, which read as clutter on the
  // hero card.) Achievements live in the Activity section below.
  return inner;
}

/* (legacy emoji picker removed — see MonogramEditor) */

/* ── Drop-sound toggle ───────────────────────────────────────────────────
   The short "thunk" played when the user successfully drops a task in
   kanban or reorders one on the dashboard. Stored server-side so the
   preference follows the user across devices. Default ON. */
function DropSoundToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving]   = useState(false);

  async function toggle() {
    const next = !enabled;
    setEnabled(next); // optimistic
    setSaving(true);
    try {
      await api('/users/me', { method: 'PATCH', body: { soundDropEnabled: next } });
    } catch {
      setEnabled(!next); // revert on failure
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-800 dark:text-white/90">Drop sound</div>
          <p className="text-xs text-slate-400 dark:text-white/40 mt-0.5 leading-relaxed">
            Plays a short cue when you drop a task in kanban or reorder one on the dashboard.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={toggle}
          className={`mt-0.5 relative w-10 h-5.5 rounded-full shrink-0 transition-colors cursor-pointer ${
            enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-white/15'
          }`}
          style={{ width: 36, height: 20 }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
            style={{ left: enabled ? 18 : 2 }}
          />
        </button>
      </div>
    </div>
  );
}

/* ── Quick PIN management ─────────────────────────────────────────────────── */
function QuickPinSection() {
  const [hasPin, setHasPin]   = useState<boolean | null>(null);
  const [currentPin, setCur]  = useState('');
  const [pin, setPin]         = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState('');
  const [err, setErr]         = useState('');

  useEffect(() => {
    api<{ hasPin: boolean }>('/auth/pin').then(d => setHasPin(d.hasPin)).catch(() => setHasPin(false));
  }, []);

  const valid = /^\d{4}$/.test(pin);
  const matches = pin === confirm;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!valid) { setErr('PIN must be exactly 4 digits.'); return; }
    if (!matches) { setErr('The two PINs don’t match.'); return; }
    setSaving(true);
    try {
      await api('/auth/pin', { method: 'POST', body: { pin, ...(hasPin ? { currentPin } : {}) } });
      setMsg('Quick PIN updated.');
      setHasPin(true); setCur(''); setPin(''); setConfirm('');
    } catch (e: any) { setErr(e.message || 'Could not update your PIN.'); }
    finally { setSaving(false); }
  }

  const box = "input text-center font-bold tracking-[0.4em]";

  return (
    <div id="quick-pin" className="scroll-mt-6">
      <Section icon={KeyRound} title="Quick PIN" subtitle="A 4-digit code to resume an idle session on this device.">
        <form onSubmit={save} className="space-y-3.5">
          {hasPin && (
            <Field label="Current PIN">
              <input type="password" inputMode="numeric" maxLength={4} className={box}
                value={currentPin} onChange={e => setCur(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" />
            </Field>
          )}
          <Field label={hasPin ? 'New PIN' : 'PIN'}>
            <input type="password" inputMode="numeric" maxLength={4} className={box}
              value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" />
          </Field>
          <Field label="Confirm PIN">
            <input type="password" inputMode="numeric" maxLength={4}
              className={`${box} ${confirm && !matches ? 'border-red-300' : ''}`}
              value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" />
          </Field>
          {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
          {msg && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ {msg}</div>}
          <button type="submit" className="btn-primary w-full justify-center" disabled={saving || !valid || !matches || (!!hasPin && currentPin.length !== 4)}>
            {saving ? 'Saving…' : hasPin ? 'Change PIN' : 'Set PIN'}
          </button>
          <p className="text-[11px] text-slate-400 leading-snug">
            Forgot it? Just sign in with your password — it always works — then set a new PIN here.
            Your password is always required on a new device.
          </p>
        </form>
      </Section>
    </div>
  );
}

/* ── Admin: production error monitor ──────────────────────────────────────── */
function AdminErrorMonitor() {
  const [errors, setErrors] = useState<any[]>([]);
  const [unack, setUnack]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]     = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d: any = await api('/errors');
      setErrors(d.errors || []);
      setUnack(d.unacknowledged || 0);
    } catch { /* admin-only; ignore for non-admins */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function ack(id?: string) {
    setBusy(true);
    try {
      await api('/errors', { method: 'PATCH', body: id ? { id } : { all: true } });
      await load();
    } finally { setBusy(false); }
  }

  function fmt(iso: string | null) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  return (
    <div id="monitor" className="scroll-mt-6">
      <Section
        icon={ServerCog}
        title="System monitor"
        subtitle="Recent production errors captured across the app (auto-expire after 30 days)."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              {unack > 0 ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-red-700">
                  <AlertTriangle size={14} /> {unack} unacknowledged
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-semibold text-green-700">
                  <Check size={14} /> All clear
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => load()} className="btn-secondary text-xs" disabled={loading || busy}>
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
              {unack > 0 && (
                <button onClick={() => ack()} className="btn-secondary text-xs" disabled={busy}>
                  Dismiss all
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-xs text-slate-400 py-4 text-center">Loading…</div>
          ) : errors.length === 0 ? (
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-6 text-center text-xs text-slate-400">
              No errors recorded. 🎉
            </div>
          ) : (
            <ul className="space-y-2">
              {errors.map((e) => (
                <li key={e.id}
                  className={`rounded-lg border px-3 py-2.5 text-xs ${e.acknowledged ? 'border-slate-100 bg-slate-50/60 opacity-70' : 'border-red-100 bg-red-50/60'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${e.source === 'client' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {e.source}
                        </span>
                        {e.count > 1 && (
                          <span className="text-[10px] font-bold text-red-600">×{e.count}</span>
                        )}
                        {e.path && <span className="font-mono text-slate-500 truncate">{e.path}</span>}
                      </div>
                      <div className="mt-1 font-medium text-slate-800 break-words">{e.message}</div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {fmt(e.lastSeenAt)}{e.userName ? ` · ${e.userName}` : ''}{e.digest ? ` · ref ${e.digest}` : ''}
                      </div>
                    </div>
                    {!e.acknowledged && (
                      <button onClick={() => ack(e.id)} disabled={busy}
                        className="shrink-0 text-slate-400 hover:text-slate-700 transition-colors" title="Dismiss">
                        <Check size={15} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
}

/* ── Section wrapper ──────────────────────────────────────────────────────── */
function Section({ icon: Icon, title, subtitle, children }: {
  icon?: any; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="card rounded-xl border overflow-hidden">
      <div className="section-head px-5 py-3.5 border-b flex items-center gap-2.5">
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
export default function SettingsClient({ initialUser }: { initialUser: any }) {
  const router = useRouter();
  const [user, setUser]   = useState<any>(initialUser);

  const [name, setName]           = useState(initialUser.name || '');
  const [employeeId, setEmpId]    = useState(initialUser.employeeId || '');
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityMsg, setIdentityMsg] = useState('');


  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg]     = useState('');
  const [pwErr, setPwErr]     = useState('');

  const [hasRecoveryKey, setHasRecoveryKey]   = useState<boolean | null>(null);
  const [recoveryKeyBusy, setRecoveryKeyBusy] = useState(false);
  const [generatedKey, setGeneratedKey]       = useState<string | null>(null);
  // Monogram avatar — letter / bg / font are persisted server-side on the
  // User model, and the editor below saves through PATCH /api/users/me.
  // initialUser is the SSR-seeded user, so the avatar shows up immediately
  // (no client-side fetch flicker).
  const [avatarLetter, setAvatarLetter] = useState<string>((initialUser as any).avatarLetter || '');
  const [avatarBg,     setAvatarBg]     = useState<string>((initialUser as any).avatarBg || '');
  const [avatarFont,   setAvatarFont]   = useState<number>((initialUser as any).avatarFont ?? 0);
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    // User data already seeded from SSR; only fetch the recovery-key status
    // (a separate resource that can't come from the JWT).
    if (initialUser.role === 'admin') {
      api('/auth/security-key').then((r: any) => setHasRecoveryKey(r.hasKey)).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function saveMonogram(next: { letter: string; bg: string; font: number }) {
    // Persist to the server so the avatar follows the user everywhere.
    // Update local state optimistically so the hero card refreshes
    // without waiting for a full router.refresh().
    setAvatarLetter(next.letter);
    setAvatarBg(next.bg);
    setAvatarFont(next.font);
    await api('/users/me', { method: 'PATCH', body: {
      avatarLetter: next.letter,
      avatarBg:     next.bg,
      avatarFont:   next.font,
    } });
    // Re-fetch the SSR layout so the sidebar avatar (which reads from
    // CurrentUserContext, seeded server-side) also picks up the change.
    router.refresh();
  }

  async function saveIdentity(e?: React.FormEvent) {
    e?.preventDefault();
    setIdentityMsg(''); setIdentitySaving(true);
    try {
      await api('/users/me', { method: 'PATCH', body: { name } });
      setIdentityMsg('Saved');
      setTimeout(() => setIdentityMsg(''), 2500);
    } catch (err: any) { setIdentityMsg(err.message || 'Save failed.'); }
    finally { setIdentitySaving(false); }
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

  const isLeadOrAdmin = (user.role === 'lead' || user.role === 'admin');
  const roleText = user.role === 'admin' ? 'Admin' : isLeadOrAdmin ? 'Team Lead' : 'Individual Contributor';

  return (
    <div className="max-w-5xl mx-auto pb-12 space-y-6">

      {/* ── Hero profile card ──────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white"
        style={{ boxShadow: '0 16px 48px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.05)' }}>
        <div className="absolute inset-0 profile-hero-shimmer" />
        {/* Soft radial sheen instead of the old grid — keeps the shimmer clean. */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(120% 140% at 12% 0%, rgba(255,255,255,0.20) 0%, transparent 45%)' }}
        />
        <div className="relative px-5 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="shrink-0 rounded-3xl bg-white p-1.5"
                style={{ boxShadow: '0 14px 34px rgba(15,23,42,0.22)' }}>
                <ProfileAvatar
                  name={user.name}
                  letter={avatarLetter}
                  bg={avatarBg}
                  font={avatarFont}
                  size={88}
                  onClick={() => document.getElementById('activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                />
              </div>
              <div className="min-w-0 pb-1">
                <div className="mb-3 inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white backdrop-blur">
                  <span className="font-display">Pragati</span>&nbsp;profile
                </div>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <h1 className="text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">{user.name}</h1>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/75">
                  {user.username && <span className="font-mono break-all">@{user.username}</span>}
                </div>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 lg:min-w-[260px] lg:w-auto">
              <div className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-white backdrop-blur">
                <div className="text-[10px] font-black uppercase tracking-wider text-white/60">Access</div>
                <div className="mt-1 text-sm font-black">{roleText}</div>
              </div>
              <div className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-white backdrop-blur">
                <div className="text-[10px] font-black uppercase tracking-wider text-white/60">Member ID</div>
                <div className="mt-1 text-sm font-black">{employeeId || '-'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Edit affordance — inline, so there's no separate Personal Details card. */}
        <button
          type="button"
          onClick={() => setEditingProfile((v) => !v)}
          className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur transition hover:bg-white/25"
        >
          <Pencil size={12} /> {editingProfile ? 'Close' : 'Edit'}
        </button>
      </div>

      {/* Monogram avatar editor — letter + colour + font, with Inspire-me. */}
      {showAvatarEditor && (
        <MonogramEditor
          initial={{ letter: avatarLetter, bg: avatarBg, font: avatarFont }}
          name={user.name}
          onSave={saveMonogram}
          onClose={() => setShowAvatarEditor(false)}
        />
      )}

      {/* Inline profile editor — name + read-only fields */}
      {editingProfile && (
        <Section icon={User} title="Edit profile" subtitle="Your name and avatar as they appear across Pragati.">
          <form onSubmit={(e) => { saveIdentity(e); }} className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size={52} letter={avatarLetter} bg={avatarBg} font={avatarFont} />
              <button type="button" onClick={() => setShowAvatarEditor(true)}
                className="btn-secondary inline-flex items-center gap-1.5 text-xs">
                <Pencil size={12} /> Change avatar
              </button>
            </div>
            <Field label="Full name">
              <input className="input" value={name} onChange={e => setName(e.target.value)} required />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ReadonlyField label="Username" value={user.username ? `@${user.username}` : '—'} />
              <ReadonlyField label="Member ID" value={employeeId || '—'} />
              <ReadonlyField label="Role" value={roleText} />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="submit" className="btn-primary" disabled={identitySaving}>
                {identitySaving ? 'Saving…' : 'Save changes'}
              </button>
              {identityMsg && <span className="text-xs text-green-600 font-medium">✓ {identityMsg}</span>}
            </div>
          </form>
        </Section>
      )}

      {/* ── Activity — the star feature, front and centre ────────────────── */}
      <div id="activity" className="scroll-mt-6">
        <Section icon={Activity} title="Activity" subtitle="Your delivered work on Pragati — completed tasks, weighted for on-time and priority.">
          <ActivityGraph />
        </Section>
      </div>

      {/* ── Account & security — tucked behind a disclosure so the day-to-day
          view stays focused on Profile + Activity. ───────────────────────── */}
      <div className="card rounded-xl border overflow-hidden">
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          className="section-head w-full px-5 py-3.5 border-b flex items-center gap-2.5 text-left"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal size={16} className="text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-800">Account &amp; security</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Password, Quick PIN{user.role === 'admin' ? ', recovery key & system monitor' : ''} — hidden until you need them.
            </p>
          </div>
          <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
        </button>

        {moreOpen && (
          <div className="p-5 space-y-5 fade-in-soft">

            {/* Password + Quick PIN sit side by side on wider screens — they're
                both "how you get in", so pairing them reads as one unit. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
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

            <QuickPinSection />
            </div>

            <DropSoundToggle initial={initialUser.soundDropEnabled !== false} />

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

            {user.role === 'admin' && <AdminErrorMonitor />}

          </div>
        )}
      </div>

      {generatedKey && (
        <RecoveryKeyModal keyValue={generatedKey} onClose={() => setGeneratedKey(null)} />
      )}
    </div>
  );
}
