'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar } from './ui';
import { CommandPalette } from './CommandPalette';
import { Tour } from './Tour';
import { api } from '@/lib/client/api';
import {
  LayoutDashboard, FolderKanban, Users, Calendar,
  PieChart, Lightbulb, LogOut, UserCog, Menu, X,
  Bell, Lock, User, ChevronUp, Moon, Sun, AlertTriangle,
  Search, CheckSquare, FlaskConical,
} from 'lucide-react';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'pm';
  title?: string;
  mustChangePassword?: boolean;
}

/* ── Dark-mode hook ───────────────────────────────────────────────────────── */
function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    setDark(stored === 'dark'); // default light; only dark if explicitly chosen
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);
  return [dark, () => setDark(d => !d)];
}

/* ── Force password change modal ─────────────────────────────────────────── */
function ForcePasswordModal({ onDone }: { onDone: () => void }) {
  const [pw, setPw]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  const checks = [
    { label: '8+ chars', ok: pw.length >= 8 },
    { label: 'A–Z',      ok: /[A-Z]/.test(pw) },
    { label: 'a–z',      ok: /[a-z]/.test(pw) },
    { label: '0–9',      ok: /[0-9]/.test(pw) },
  ];
  const score = checks.filter(c => c.ok).length;
  const barColor = score <= 1 ? '#EF4444' : score <= 2 ? '#F59E0B' : score <= 3 ? '#3B82F6' : '#22C55E';
  const strong = score >= 3 && pw.length >= 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== confirm) { setErr('Passwords do not match.'); return; }
    if (!strong) { setErr('Please choose a stronger password.'); return; }
    setErr(''); setSaving(true);
    try {
      await api('/auth/first-password', { method: 'POST', body: { newPassword: pw } });
      onDone();
    } catch (e: any) {
      setErr(e.message || 'Something went wrong.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm p-7"
        style={{ animation: 'celebration-pop 0.3s ease-out forwards' }}>
        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <Lock size={22} className="text-blue-600" />
        </div>
        <h2 className="text-xl font-black text-slate-900 text-center tracking-tight">Set your password</h2>
        <p className="text-sm text-slate-400 text-center mt-1.5 leading-snug">
          Your account was created with a temporary password. Choose a new one to get started.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">New password</label>
            <input
              type="password" autoFocus required minLength={8}
              className="input text-sm"
              placeholder="Min 8 characters"
              value={pw} onChange={e => { setPw(e.target.value); setErr(''); }}
            />
            {pw && (
              <div className="mt-2 space-y-1.5">
                <div className="flex gap-0.5">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="h-1 flex-1 rounded-sm transition-all duration-300"
                      style={{ background: i <= score ? barColor : '#E2E8F0' }} />
                  ))}
                </div>
                <div className="flex gap-3 flex-wrap">
                  {checks.map(c => (
                    <span key={c.label} style={{ fontSize: 10 }} className={`transition-colors ${c.ok ? 'text-green-600 font-medium' : 'text-slate-300'}`}>
                      {c.ok ? '✓' : '·'} {c.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Confirm password</label>
            <input
              type="password" required
              className="input text-sm"
              placeholder="Re-enter password"
              value={confirm} onChange={e => { setConfirm(e.target.value); setErr(''); }}
            />
            {confirm && pw !== confirm && (
              <div className="text-xs text-red-500 mt-1">Passwords do not match</div>
            )}
          </div>
          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              {err}
            </div>
          )}
          <button type="submit" disabled={saving || !strong || pw !== confirm}
            className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50 mt-1"
            style={{ background: 'linear-gradient(135deg, #1256B0 0%, #1769C8 100%)' }}>
            {saving ? 'Saving…' : 'Set password & continue →'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Main shell ───────────────────────────────────────────────────────────── */
export default function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  const [open, setOpen]           = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [dark, toggleDark]        = useDarkMode();
  const [mustChangePw, setMustChangePw] = useState(!!user.mustChangePassword);

  /* Notifications */
  const [notifOpen, setNotifOpen]     = useState(false);
  const [notifSummary, setNotifSummary] = useState<any>(null);

  useEffect(() => {
    api('/me/summary').then(setNotifSummary).catch(() => {});
  }, []);

  const notifs = [
    notifSummary?.overdueTasks > 0 && {
      id: 'overdue', icon: AlertTriangle, color: '#ef4444',
      title: `${notifSummary.overdueTasks} task${notifSummary.overdueTasks === 1 ? '' : 's'} overdue`,
      sub: 'Requires immediate attention',
    },
    notifSummary?.dueThisWeek > 0 && {
      id: 'due-week', icon: Calendar, color: '#f59e0b',
      title: `${notifSummary.dueThisWeek} due this week`,
      sub: 'Keep on schedule',
    },
    notifSummary?.openTasks > 0 && {
      id: 'open', icon: CheckSquare, color: '#1565C0',
      title: `${notifSummary.openTasks} open task${notifSummary.openTasks === 1 ? '' : 's'}`,
      sub: 'Your current workload',
    },
  ].filter(Boolean) as Array<{ id: string; icon: any; color: string; title: string; sub: string }>;

  const notifBadge = (notifSummary?.overdueTasks || 0) + (notifSummary?.dueThisWeek > 0 ? 1 : 0);

  /* Drawer & scroll lock */
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  /* Nav */
  const employeeNav = [
    { href: '/',         label: 'My Tasks',      icon: LayoutDashboard, tour: 'nav-tasks' },
    { href: '/projects', label: 'Projects',       icon: FolderKanban,   tour: 'nav-projects' },
    { href: '/yearly',   label: 'My Year',        icon: Calendar,       tour: 'nav-yearly' },
    { href: '/triage',   label: 'QA Triage',      icon: FlaskConical,   badge: 'AI' },
  ];
  const pmNav = [
    { href: '/',         label: 'Dashboard',      icon: LayoutDashboard, tour: 'nav-home' },
    { href: '/projects', label: 'Projects',       icon: FolderKanban,   tour: 'nav-projects' },
    { href: '/teams',    label: 'Teams',           icon: Users,          tour: 'nav-teams' },
    { href: '/org',      label: 'Command Centre',  icon: PieChart,       tour: 'nav-org' },
    { href: '/yearly',   label: 'Yearly view',     icon: Calendar },
    { href: '/insights', label: 'Insights',        icon: Lightbulb,      badge: 'Live', tour: 'nav-insights' },
    { href: '/triage',   label: 'QA Triage',       icon: FlaskConical,   badge: 'AI' },
    { href: '/people',   label: 'People',          icon: UserCog,        tour: 'nav-people' },
  ];
  const nav = user.role === 'pm' ? pmNav : employeeNav;
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname?.startsWith(href);

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  /* ── Sidebar content ──────────────────────────────────────────────────── */
  const SidebarContent = (
    <>
      {/* Logo */}
      <div className="px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: '#fff', borderRadius: 7, padding: '4px 5px', lineHeight: 0, flexShrink: 0,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="" width={22} height={22} style={{ display: 'block', objectFit: 'contain' }} />
          </span>
          <div>
            <div className="font-black text-white text-sm tracking-tight leading-tight">Pragati</div>
            <div style={{ fontSize: 9, letterSpacing: '0.15em' }} className="text-white/30 uppercase mt-0.5">
              Project Intelligence
            </div>
          </div>
        </Link>
        <button className="lg:hidden text-white/30 hover:text-white/70 transition-colors p-1" onClick={() => setOpen(false)}>
          <X size={16} />
        </button>
      </div>

      {/* Role label */}
      <div className="px-5 pb-2">
        <div style={{ fontSize: 9, letterSpacing: '0.18em' }} className="text-white/20 uppercase font-bold">
          {user.role === 'pm' ? 'PM' : 'Individual Contributor'}
        </div>
      </div>

      {/* ⌘K Search hint */}
      <div className="px-3 pb-2">
        <button
          data-tour="cmd-palette"
          onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
        >
          <Search size={12} className="text-white/20 group-hover:text-white/50 transition-colors shrink-0" />
          <span style={{ fontSize: 11 }} className="text-white/20 group-hover:text-white/50 flex-1 text-left transition-colors">
            Search & jump to…
          </span>
          <kbd style={{ fontSize: 9 }} className="font-mono text-white/15 group-hover:text-white/35 border border-white/10 rounded px-1.5 py-0.5 transition-colors">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-auto pb-2">
        {nav.map((n) => {
          const Icon = n.icon;
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              data-tour={(n as any).tour}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                active ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <Icon size={15} className={`shrink-0 ${active ? 'text-blue-300' : 'text-white/30 group-hover:text-white/60'}`} />
              <span className="flex-1 truncate">{n.label}</span>
              {(n as any).badge && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(21,101,192,0.6)', color: '#90CAF9' }}>
                  {(n as any).badge}
                </span>
              )}
              {active && <span className="w-1 h-1 rounded-full bg-blue-400 shrink-0" />}
            </Link>
          );
        })}
      </nav>

      {/* ── Notifications bell ──────────────────────────────────────────── */}
      <div className="px-3 pb-1 relative">
        <button
          data-tour="notifications"
          onClick={() => setNotifOpen(o => !o)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
        >
          <div className="relative shrink-0">
            <Bell size={14} className={notifBadge > 0 ? 'text-amber-400/70' : 'text-white/30'} />
            {notifBadge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 rounded-full flex items-center justify-center px-0.5"
                style={{ background: '#ef4444', fontSize: 8, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                {notifBadge > 9 ? '9+' : notifBadge}
              </span>
            )}
          </div>
          <span style={{ fontSize: 13 }} className="text-white/40 flex-1 text-left font-medium">Notifications</span>
          {notifBadge > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(239,68,68,0.18)', color: '#f87171' }}>{notifBadge}</span>
          )}
        </button>

        {/* Notification dropdown */}
        {notifOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
            <div className="absolute bottom-full left-2 right-2 mb-1.5 rounded-xl overflow-hidden z-50"
              style={{
                background: '#0A1929',
                border: '1px solid rgba(255,255,255,0.09)',
                boxShadow: '0 -8px 32px rgba(0,0,0,0.45)',
                animation: 'paletteIn 0.18s cubic-bezier(0.34,1.56,0.64,1)',
              }}>
              <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-xs font-bold text-white/70">Notifications</span>
                <button onClick={() => setNotifOpen(false)}>
                  <Link href="/" style={{ fontSize: 10 }} className="text-blue-400/60 hover:text-blue-400 transition-colors">View dashboard</Link>
                </button>
              </div>
              {notifs.length === 0 ? (
                <div className="px-3 py-5 text-center text-xs text-white/25">
                  All clear — no pending items
                </div>
              ) : (
                <div className="py-1">
                  {notifs.map(n => {
                    const Icon = n.icon;
                    const href = n.id === 'open' ? '/projects' : '/yearly';
                    return (
                      <Link href={href} key={n.id} onClick={() => setNotifOpen(false)}
                        className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors">
                        <Icon size={13} style={{ color: n.color, marginTop: 1, flexShrink: 0 }} />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white/75 truncate">{n.title}</div>
                          <div style={{ fontSize: 10 }} className="text-white/30 mt-0.5">{n.sub}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── User footer ─────────────────────────────────────────────────── */}
      {profileOpen && (
        <div className="fixed inset-0 z-40" onClick={() => { setProfileOpen(false); setConfirmLogout(false); }} />
      )}
      <div
        data-tour="user-profile"
        className="px-3 py-3 border-t border-white/5 relative"
        onClick={() => setProfileOpen(o => !o)}
      >
        {/* Profile popup */}
        <div className={`absolute bottom-full left-2 right-2 mb-1.5 rounded-xl overflow-hidden z-50 transition-all duration-200 ${
          profileOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-1.5 pointer-events-none'
        }`} onClick={e => e.stopPropagation()} style={{
          background: '#0A1929',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        }}>

          {/* Normal menu */}
          <div className={`transition-all duration-200 ${confirmLogout ? 'opacity-0 pointer-events-none absolute inset-0' : 'opacity-100'}`}>
            <div className="px-3 py-2.5 flex items-center gap-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Avatar name={user.name} size={30} />
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-white/90 truncate leading-tight">{user.name}</div>
                <div style={{ fontSize: 10 }} className="text-white/35 truncate">{user.role === 'pm' ? 'PM' : 'Individual Contributor'}</div>
              </div>
            </div>
            <div className="py-1">
              <Link href="/settings" className="flex items-center gap-2.5 px-3 py-2 text-xs text-white/55 hover:text-white/90 hover:bg-white/5 transition-colors">
                <User size={12} className="shrink-0" /> Profile &amp; identity
              </Link>
              <Link href="/settings#notifications" className="flex items-center gap-2.5 px-3 py-2 text-xs text-white/55 hover:text-white/90 hover:bg-white/5 transition-colors">
                <Bell size={12} className="shrink-0" /> Notifications
              </Link>
              <Link href="/settings#security" className="flex items-center gap-2.5 px-3 py-2 text-xs text-white/55 hover:text-white/90 hover:bg-white/5 transition-colors">
                <Lock size={12} className="shrink-0" /> Security
              </Link>
              <div className="mx-3 my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
              <div className="flex items-center gap-1 px-1">
                {/* Dark mode toggle */}
                <button onClick={toggleDark} title={dark ? 'Light mode' : 'Dark mode'}
                  className="flex items-center gap-2 flex-1 px-2 py-2 rounded-lg text-xs text-white/50 hover:text-white/90 hover:bg-white/5 transition-colors">
                  {dark
                    ? <Sun  size={12} className="shrink-0 text-amber-400/70" />
                    : <Moon size={12} className="shrink-0" />}
                  <span>{dark ? 'Light mode' : 'Dark mode'}</span>
                  <span className="ml-auto w-7 h-3.5 rounded-full flex items-center shrink-0 transition-all duration-200"
                    style={{ background: dark ? '#1565C0' : 'rgba(255,255,255,0.12)', padding: '2px' }}>
                    <span className="w-2.5 h-2.5 rounded-full bg-white shadow transition-all duration-200"
                      style={{ transform: dark ? 'translateX(13px)' : 'translateX(0)' }} />
                  </span>
                </button>
                {/* Sign out */}
                <button onClick={() => setConfirmLogout(true)} title="Sign out"
                  className="flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs text-red-400/55 hover:text-red-400 hover:bg-white/5 transition-colors shrink-0">
                  <LogOut size={12} className="shrink-0" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>

          {/* Sign-out confirmation */}
          <div className={`transition-all duration-200 ${confirmLogout ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'}`}>
            <div className="px-4 py-4 flex flex-col items-center gap-3 text-center">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)' }}>
                <AlertTriangle size={16} className="text-red-400" />
              </div>
              <div>
                <div className="text-[13px] font-bold text-white/90 leading-tight">Sign out?</div>
                <div style={{ fontSize: 11 }} className="text-white/35 mt-0.5">You'll need to sign back in.</div>
              </div>
              <div className="flex gap-2 w-full">
                <button onClick={() => setConfirmLogout(false)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white/50 hover:text-white/80 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.07)' }}>
                  Cancel
                </button>
                <button onClick={logout}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold text-red-300 hover:text-red-200 transition-colors"
                  style={{ background: 'rgba(239,68,68,0.18)' }}>
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Trigger row */}
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 hover:bg-white/5 transition-colors cursor-default select-none">
          <Avatar name={user.name} size={28} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white/80 truncate">{user.name}</div>
            <div style={{ fontSize: 10 }} className="text-white/30 truncate">
              {user.title || (user.role === 'pm' ? 'PM' : 'Individual Contributor')}
            </div>
          </div>
          <ChevronUp size={11} className={`text-white/20 shrink-0 transition-transform duration-150 ${profileOpen ? '' : 'rotate-180'}`} />
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>

      {/* Command palette — globally available */}
      <CommandPalette isPM={user.role === 'pm'} />

      {/* Mobile top bar */}
      <header
        className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center gap-3 px-4 h-14 border-b"
        style={{ background: '#0B1628', borderColor: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' }}
      >
        <button onClick={() => setOpen(true)}
          className="text-white/50 hover:text-white transition-colors -ml-1 p-1.5 rounded-md hover:bg-white/5"
          aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <span style={{ display: 'inline-flex', background: '#fff', borderRadius: 5, padding: '3px 4px', lineHeight: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="" width={18} height={18} style={{ display: 'block', objectFit: 'contain' }} />
          </span>
          <span className="font-black text-white text-sm tracking-tight">Pragati</span>
        </Link>
        <button onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
          className="ml-auto p-2 text-white/40 hover:text-white/70 transition-colors">
          <Search size={17} />
        </button>
        <Link href="/settings" className="shrink-0">
          <Avatar name={user.name} size={28} />
        </Link>
      </header>

      {/* Mobile backdrop */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside
          className={`
            w-64 lg:w-56 shrink-0 flex flex-col
            fixed lg:sticky inset-y-0 left-0
            z-50 lg:z-auto h-screen
            chevron-watermark
            transition-transform duration-300 ease-in-out
            ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
          style={{ background: '#0B1628' }}
        >
          {SidebarContent}
        </aside>

        {/* Main content with page-enter transition */}
        <main className="flex-1 overflow-auto min-w-0 pt-14 lg:pt-0">
          <div key={pathname} className="max-w-7xl mx-auto px-4 sm:px-5 lg:px-7 py-5 lg:py-7 page-enter">
            {children}
          </div>
        </main>
      </div>

      {mustChangePw && (
        <ForcePasswordModal onDone={() => { setMustChangePw(false); router.refresh(); }} />
      )}

      {!mustChangePw && <Tour role={user.role} />}
    </div>
  );
}
