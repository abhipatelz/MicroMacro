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
  Search, CheckSquare, Bot, Activity,
} from 'lucide-react';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'pm';
  title?: string;
  mustChangePassword?: boolean;
}

/* ── Dark-mode hook ─────────────────────────────────────────────────── */
function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    setDark(stored === 'dark');
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);
  return [dark, () => setDark(d => !d)];
}

/* ── Force password change modal ─────────────────────────────────────────── */
function ForcePasswordModal({ onDone }: { onDone: () => void }) {
  const [pw, setPw]           = useState('');
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
            <input type="password" autoFocus required minLength={8} className="input text-sm"
              placeholder="Min 8 characters" value={pw}
              onChange={e => { setPw(e.target.value); setErr(''); }} />
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
                    <span key={c.label} style={{ fontSize: 10 }}
                      className={`transition-colors ${c.ok ? 'text-green-600 font-medium' : 'text-slate-300'}`}>
                      {c.ok ? '✓' : '·'} {c.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Confirm password</label>
            <input type="password" required className="input text-sm" placeholder="Re-enter password"
              value={confirm} onChange={e => { setConfirm(e.target.value); setErr(''); }} />
            {confirm && pw !== confirm && (
              <div className="text-xs text-red-500 mt-1">Passwords do not match</div>
            )}
          </div>
          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">{err}</div>
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

/* ── Main shell ─────────────────────────────────────────────────────────────── */
export default function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  const [open, setOpen]               = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [dark, toggleDark]            = useDarkMode();
  const [mustChangePw, setMustChangePw] = useState(!!user.mustChangePassword);

  /* Notifications */
  const [notifOpen, setNotifOpen]       = useState(false);
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

  /* Nav items — each with a distinct icon colour matching Alembic colour palette */
  type NavItem = { href: string; label: string; icon: any; tour?: string; badge?: string; iconColor: string; iconBg: string };
  type NavSection = { title: string; items: NavItem[] };

  const employeeSections: NavSection[] = [
    {
      title: 'Work',
      items: [
        { href: '/',         label: 'My Tasks', icon: LayoutDashboard, tour: 'nav-tasks',    iconColor: '#1565C0', iconBg: '#E3F2FD' },
        { href: '/projects', label: 'Projects', icon: FolderKanban,   tour: 'nav-projects', iconColor: '#7B1FA2', iconBg: '#F3E5F5' },
        { href: '/yearly',   label: 'My Year',  icon: Calendar,       tour: 'nav-yearly',   iconColor: '#00897B', iconBg: '#E0F2F1' },
      ],
    },
    {
      title: 'Assist',
      items: [
        { href: '/copilot', label: 'QA Copilot', icon: Bot, tour: 'nav-copilot', iconColor: '#5C6BC0', iconBg: '#E8EAF6' },
      ],
    },
  ];

  const pmSections: NavSection[] = [
    {
      title: 'Plan',
      items: [
        { href: '/',         label: 'Dashboard',    icon: LayoutDashboard, tour: 'nav-home',     iconColor: '#1565C0', iconBg: '#E3F2FD' },
        { href: '/projects', label: 'Projects',     icon: FolderKanban,   tour: 'nav-projects', iconColor: '#7B1FA2', iconBg: '#F3E5F5' },
        { href: '/yearly',   label: 'Yearly view',  icon: Calendar,                             iconColor: '#00897B', iconBg: '#E0F2F1' },
      ],
    },
    {
      title: 'People',
      items: [
        { href: '/teams',  label: 'Teams',  icon: Users,   tour: 'nav-teams',  iconColor: '#2E7D32', iconBg: '#E8F5E9' },
        { href: '/people', label: 'People', icon: UserCog, tour: 'nav-people', iconColor: '#0277BD', iconBg: '#E1F5FE' },
      ],
    },
    {
      title: 'Assist',
      items: [
        { href: '/copilot', label: 'QA Copilot', icon: Bot, iconColor: '#5C6BC0', iconBg: '#E8EAF6' },
      ],
    },
    {
      title: 'Steer',
      items: [
        { href: '/org',      label: 'Operations Hub', icon: PieChart,  tour: 'nav-org',      iconColor: '#E65100', iconBg: '#FBE9E7' },
        { href: '/risk',     label: 'Task Triage',    icon: Activity,  tour: 'nav-risk',     iconColor: '#C62828', iconBg: '#FFEBEE' },
        { href: '/insights', label: 'Trends',         icon: Lightbulb, badge: 'Live', tour: 'nav-insights', iconColor: '#F57F17', iconBg: '#FFF9C4' },
      ],
    },
  ];

  const sections = user.role === 'pm' ? pmSections : employeeSections;
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname?.startsWith(href);

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  /* ── Sidebar content ─────────────────────────────────────────────────────────── */
  const SidebarContent = (
    <>
      {/* Nav */}
      <nav className="flex-1 px-3 pt-4 overflow-auto pb-2">
        {sections.map((section, si) => (
          <div key={section.title} className={si > 0 ? 'mt-4' : ''}>
            <div style={{ fontSize: 9, letterSpacing: '0.18em' }}
              className="text-slate-400 dark:text-white/25 uppercase font-bold px-3 mb-1.5">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((n) => {
                const Icon = n.icon;
                const active = isActive(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    prefetch
                    data-tour={n.tour}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 group ${
                      active
                        ? 'text-brand-700 dark:text-blue-300'
                        : 'text-slate-600 dark:text-white/45 hover:text-slate-900 dark:hover:text-white/85 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                    style={active ? {
                      background: dark ? 'rgba(255,255,255,0.08)' : '#EEF4FD',
                      borderLeft: `3px solid ${n.iconColor}`,
                      paddingLeft: '9px',
                    } : {}}
                  >
                    {/* Coloured icon box */}
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all"
                      style={{
                        background: active
                          ? (dark ? `${n.iconColor}30` : n.iconBg)
                          : (dark ? `${n.iconColor}18` : `${n.iconColor}14`),
                      }}>
                      <Icon size={14} style={{ color: active ? n.iconColor : dark ? n.iconColor + 'bb' : n.iconColor + '99' }} />
                    </div>
                    <span className="flex-1 truncate">{n.label}</span>
                    {n.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: dark ? 'rgba(67,160,71,0.22)' : '#E8F5E9', color: dark ? '#86efac' : '#2E7D32' }}>
                        {n.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      {profileOpen && (
        <div className="fixed inset-0 z-40" onClick={() => { setProfileOpen(false); setConfirmLogout(false); }} />
      )}
      <div data-tour="user-profile"
        className="px-3 py-3 border-t border-slate-100 dark:border-white/5 relative"
        onClick={() => setProfileOpen(o => !o)}>

        {/* Profile popup */}
        <div className={`absolute bottom-full left-2 right-2 mb-1.5 rounded-xl overflow-hidden z-50 transition-all duration-200 ${
          profileOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-1.5 pointer-events-none'
        }`} onClick={e => e.stopPropagation()} style={{
          background: dark ? '#0A1929' : '#ffffff',
          border: dark ? '1px solid rgba(255,255,255,0.09)' : '1px solid #e2e8f0',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.15)',
        }}>
          {/* Normal menu */}
          <div className={`transition-all duration-200 ${confirmLogout ? 'opacity-0 pointer-events-none absolute inset-0' : 'opacity-100'}`}>
            <div className="px-3 py-2.5 flex items-center gap-2.5"
              style={{ borderBottom: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9' }}>
              <Avatar name={user.name} size={30} />
              <div className="min-w-0">
                <div className={`text-[12px] font-bold truncate leading-tight ${dark ? 'text-white/90' : 'text-slate-800'}`}>
                  {user.name}
                </div>
                <div style={{ fontSize: 10 }} className={dark ? 'text-white/35 truncate' : 'text-slate-400 truncate'}>
                  {user.role === 'pm' ? 'PM' : 'Individual Contributor'}
                </div>
              </div>
            </div>
            <div className="py-1">
              {[
                { href: '/settings',              Icon: User,  label: 'Profile & identity' },
                { href: '/settings#notifications', Icon: Bell,  label: 'Notifications' },
                { href: '/settings#security',      Icon: Lock,  label: 'Security' },
              ].map(({ href, Icon, label }) => (
                <Link key={href} href={href}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                    dark ? 'text-white/55 hover:text-white/90 hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}>
                  <Icon size={12} className="shrink-0" /> {label}
                </Link>
              ))}
              <div className={`mx-3 my-1 h-px ${dark ? 'bg-white/6' : 'bg-slate-100'}`} />
              <div className="flex items-center gap-1 px-1">
                <button onClick={toggleDark}
                  className={`flex items-center gap-2 flex-1 px-2 py-2 rounded-lg text-xs transition-colors ${
                    dark ? 'text-white/50 hover:text-white/90 hover:bg-white/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}>
                  {dark
                    ? <Sun  size={12} className="shrink-0 text-amber-400/70" />
                    : <Moon size={12} className="shrink-0" />}
                  <span>{dark ? 'Light mode' : 'Dark mode'}</span>
                  <span className="ml-auto w-7 h-3.5 rounded-full flex items-center shrink-0 transition-all duration-200"
                    style={{ background: dark ? '#1565C0' : '#e2e8f0', padding: '2px' }}>
                    <span className="w-2.5 h-2.5 rounded-full bg-white shadow transition-all duration-200"
                      style={{ transform: dark ? 'translateX(13px)' : 'translateX(0)' }} />
                  </span>
                </button>
                <button onClick={() => setConfirmLogout(true)}
                  className={`flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs transition-colors shrink-0 ${
                    dark ? 'text-red-400/55 hover:text-red-400 hover:bg-white/5' : 'text-red-500 hover:text-red-600 hover:bg-red-50'
                  }`}>
                  <LogOut size={12} className="shrink-0" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>

          {/* Sign-out confirmation */}
          <div className={`transition-all duration-200 ${confirmLogout ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'}`}>
            <div className="px-4 py-4 flex flex-col items-center gap-3 text-center">
              <div className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: dark ? 'rgba(239,68,68,0.12)' : '#FEF2F2' }}>
                <AlertTriangle size={16} className="text-red-500" />
              </div>
              <div>
                <div className={`text-[13px] font-bold leading-tight ${dark ? 'text-white/90' : 'text-slate-800'}`}>Sign out?</div>
                <div style={{ fontSize: 11 }} className={dark ? 'text-white/35 mt-0.5' : 'text-slate-400 mt-0.5'}>
                  You'll need to sign back in.
                </div>
              </div>
              <div className="flex gap-2 w-full">
                <button onClick={() => setConfirmLogout(false)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    dark ? 'text-white/50 hover:text-white/80' : 'text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200'
                  }`}
                  style={dark ? { background: 'rgba(255,255,255,0.07)' } : {}}>
                  Cancel
                </button>
                <button onClick={logout}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    dark ? 'text-red-300 hover:text-red-200' : 'text-red-600 bg-red-50 hover:bg-red-100'
                  }`}
                  style={dark ? { background: 'rgba(239,68,68,0.18)' } : {}}>
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Trigger row */}
        <div className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors cursor-default select-none ${
          dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
        }`}>
          <Avatar name={user.name} size={28} />
          <div className="flex-1 min-w-0">
            <div className={`text-xs font-semibold truncate ${dark ? 'text-white/80' : 'text-slate-700'}`}>{user.name}</div>
            <div style={{ fontSize: 10 }} className={dark ? 'text-white/30 truncate' : 'text-slate-400 truncate'}>
              {user.title || (user.role === 'pm' ? 'PM' : 'Individual Contributor')}
            </div>
          </div>
          <ChevronUp size={11} className={`shrink-0 transition-transform duration-150 ${dark ? 'text-white/20' : 'text-slate-300'} ${profileOpen ? '' : 'rotate-180'}`} />
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>

      {/* Command palette */}
      <CommandPalette isPM={user.role === 'pm'} />

      {/* ── Top header (always visible — Alembic Academy style) ────────── */}
      <header
        className="fixed top-0 inset-x-0 z-50 flex items-center gap-3 px-4 h-14"
        style={{
          background: dark ? '#0B1628' : '#ffffff',
          borderBottom: dark ? '1px solid rgba(255,255,255,0.07)' : '1px solid #e2e8f0',
          boxShadow: dark ? 'none' : '0 1px 4px rgba(21,101,192,0.07)',
        }}
      >
        {/* Hamburger (mobile only) */}
        <button
          onClick={() => setOpen(o => !o)}
          className={`lg:hidden p-1.5 rounded-md transition-colors -ml-1 ${
            dark ? 'text-white/50 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
          aria-label="Open navigation">
          <Menu size={20} />
        </button>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #1256B0 0%, #1E88E5 100%)',
            borderRadius: 8, padding: '5px 6px', lineHeight: 0, flexShrink: 0,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="" width={20} height={20}
              style={{ display: 'block', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          </span>
          <div className="hidden sm:block">
            <div className={`font-black text-sm tracking-tight leading-tight ${dark ? 'text-white' : 'text-slate-900'}`}>
              Pragati
            </div>
            <div style={{ fontSize: 9, letterSpacing: '0.14em' }} className={dark ? 'text-white/30' : 'text-slate-400'}>
              PROJECT INTELLIGENCE
            </div>
          </div>
        </Link>

        {/* Center search bar (desktop) */}
        <div className="flex-1 max-w-sm mx-auto hidden md:block">
          <button
            onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-left ${
              dark
                ? 'bg-white/5 border-white/8 hover:bg-white/8 hover:border-white/12'
                : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-slate-300 hover:shadow-sm'
            }`}>
            <Search size={13} className={dark ? 'text-white/30 shrink-0' : 'text-slate-400 shrink-0'} />
            <span className={`text-sm flex-1 ${dark ? 'text-white/30' : 'text-slate-400'}`}>
              What do you want to find?
            </span>
            <kbd className={`font-mono text-[9px] border rounded px-1.5 py-0.5 hidden lg:block ${
              dark ? 'text-white/20 border-white/10' : 'text-slate-400 border-slate-300 bg-white'
            }`}>
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right — search icon (small screens), bell, avatar */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Mobile search */}
          <button
            onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
            className={`md:hidden p-2 rounded-lg transition-colors ${
              dark ? 'text-white/40 hover:text-white/70 hover:bg-white/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}>
            <Search size={17} />
          </button>

          {/* Bell with notification dropdown */}
          <div className="relative">
            <button
              data-tour="notifications" onClick={() => setNotifOpen(o => !o)}
              className={`relative p-2 rounded-lg transition-colors ${
                dark ? 'text-white/40 hover:text-white/70 hover:bg-white/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}>
              <Bell size={17} className={notifBadge > 0 ? (dark ? 'text-amber-400/70' : 'text-amber-500') : ''} />
              {notifBadge > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>

            {/* Notification panel */}
            {notifOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                <div className="absolute top-full right-0 mt-2 w-72 rounded-xl overflow-hidden z-50"
                  style={{
                    background: dark ? '#0A1929' : '#ffffff',
                    border: dark ? '1px solid rgba(255,255,255,0.09)' : '1px solid #e2e8f0',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                    animation: 'paletteIn 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                  }}>
                  <div className="px-4 py-3 flex items-center justify-between"
                    style={{ borderBottom: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9' }}>
                    <span className={`text-sm font-bold ${dark ? 'text-white/80' : 'text-slate-700'}`}>Notifications</span>
                    <button onClick={() => setNotifOpen(false)}>
                      <Link href="/" style={{ fontSize: 11 }} className="text-brand-600 hover:text-brand-700 transition-colors">
                        View dashboard
                      </Link>
                    </button>
                  </div>
                  {notifs.length === 0 ? (
                    <div className={`px-4 py-6 text-center text-sm ${dark ? 'text-white/25' : 'text-slate-400'}`}>
                      All clear — no pending items
                    </div>
                  ) : (
                    <div className="py-1">
                      {notifs.map(n => {
                        const Icon = n.icon;
                        const href = n.id === 'open' ? '/projects' : '/yearly';
                        return (
                          <Link href={href} key={n.id} onClick={() => setNotifOpen(false)}
                            className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                              dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                            }`}>
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                              style={{ background: `${n.color}18` }}>
                              <Icon size={13} style={{ color: n.color }} />
                            </div>
                            <div className="min-w-0">
                              <div className={`text-xs font-semibold truncate ${dark ? 'text-white/80' : 'text-slate-700'}`}>
                                {n.title}
                              </div>
                              <div style={{ fontSize: 10 }} className={dark ? 'text-white/30 mt-0.5' : 'text-slate-400 mt-0.5'}>
                                {n.sub}
                              </div>
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

          {/* User avatar */}
          <Link href="/settings" className="shrink-0 ml-1">
            <Avatar name={user.name} size={30} />
          </Link>
        </div>
      </header>

      {/* Mobile backdrop */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div className="flex pt-14 min-h-screen">

        {/* ── Sidebar (light-themed on desktop, drawer on mobile) ──────── */}
        <aside
          className={`
            w-60 shrink-0 flex flex-col
            fixed top-14 left-0
            lg:sticky lg:top-14
            z-40 lg:z-auto
            h-[calc(100vh-3.5rem)]
            transition-transform duration-300 ease-in-out
            ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
          style={{
            background: dark ? '#0B1628' : '#ffffff',
            borderRight: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0',
          }}
        >
          {/* Mobile close button */}
          <button
            className={`lg:hidden absolute top-3 right-3 p-1.5 rounded-md transition-colors ${
              dark ? 'text-white/30 hover:text-white/70' : 'text-slate-400 hover:text-slate-600'
            }`}
            onClick={() => setOpen(false)}>
            <X size={16} />
          </button>

          {SidebarContent}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto min-w-0">
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
