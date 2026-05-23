'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Avatar } from './ui';
import { PragatiMark } from './PragatiMark';
import { CurrentUserProvider } from './CurrentUserContext';
import { api } from '@/lib/client/api';

// Modal only shown when a TL clicks "Invite a lead" — defer its JS until needed.
const InviteLeadModal = dynamic(
  () => import('./InviteLeadModal').then(m => m.InviteLeadModal),
  { ssr: false, loading: () => null },
);
import {
  LayoutDashboard, FolderKanban, Users, UsersRound,
  LogOut, Menu, X,
  Bell, Lock, User, ChevronUp, Moon, Sun, AlertTriangle, UserPlus,
} from 'lucide-react';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'pm' | 'lead' | 'admin';
  title?: string;
  mustChangePassword?: boolean;
}

/* ── Dark-mode hook ─────────────────────────────────────────────────
   The initial value is read from the `theme` cookie that's painted onto
   <html class="dark"> server-side (see (authed)/layout.tsx). That kills
   the FOUC: previously we mounted with light, then a useEffect flipped
   to dark, causing a visible flash + a full re-paint of the shell. */
function useDarkMode(initialDark: boolean): [boolean, () => void] {
  const [dark, setDark] = useState(initialDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    // Persist via cookie so the next SSR render starts in the right
    // mode. 365 d, sameSite=lax so it travels with normal navigation.
    document.cookie = `theme=${dark ? 'dark' : 'light'}; path=/; max-age=31536000; SameSite=Lax`;
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

/* ── Force password change modal ─────────────────────────────────── */
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
            <label className="label">New password</label>
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
            <label className="label">Confirm password</label>
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

/* ── Main shell ─────────────────────────────────────────────────────── */
export default function AppShell({ user, initialDark, children }: { user: CurrentUser; initialDark: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  const [open, setOpen]               = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [inviteOpen,  setInviteOpen]  = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [dark, toggleDark]            = useDarkMode(initialDark);
  const [mustChangePw, setMustChangePw] = useState(!!user.mustChangePassword);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  type NavItem = { href: string; label: string; icon: any; iconColor: string; iconBg: string };

  const pmNav: NavItem[] = [
    { href: '/',         label: 'Dashboard', icon: LayoutDashboard, iconColor: '#1565C0', iconBg: '#E3F2FD' },
    { href: '/projects', label: 'Projects',  icon: FolderKanban,    iconColor: '#7B1FA2', iconBg: '#F3E5F5' },
    { href: '/teams',    label: 'Team',      icon: Users,           iconColor: '#2E7D32', iconBg: '#E8F5E9' },
    { href: '/people',   label: 'People',    icon: UsersRound,      iconColor: '#00897B', iconBg: '#E0F2F1' },
  ];

  const employeeNav: NavItem[] = [
    { href: '/',         label: 'My Tasks', icon: LayoutDashboard, iconColor: '#1565C0', iconBg: '#E3F2FD' },
    { href: '/projects', label: 'Projects', icon: FolderKanban,    iconColor: '#7B1FA2', iconBg: '#F3E5F5' },
  ];

  const isLeadOrAdmin = user.role === 'pm' || user.role === 'lead' || user.role === 'admin';
  const nav = isLeadOrAdmin ? pmNav : employeeNav;
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname?.startsWith(href);

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  /* ── Sidebar inner content ─────────────────────────────────────────── */
  const SidebarInner = (
    <>
      {/* Brand header — same visual weight as the old top bar */}
      <div className="flex items-center gap-2.5 px-4 h-14 shrink-0 border-b"
        style={{ borderColor: dark ? 'rgba(255,255,255,0.07)' : '#e8edf4' }}>
        <Link href="/" className="flex items-center gap-2 flex-1 min-w-0">
          <PragatiMark size={28} flat />
          <div className="min-w-0">
            <div className={`font-black text-[13px] tracking-tight leading-none ${dark ? 'text-white' : 'text-slate-900'}`}>
              Pragati
            </div>
            <div style={{ fontSize: 8, letterSpacing: '0.14em' }} className={dark ? 'text-white/30' : 'text-slate-400'}>
              PROJECT INTELLIGENCE
            </div>
          </div>
        </Link>
        {/* Close on mobile */}
        <button className={`lg:hidden p-1 rounded-md ml-auto ${dark ? 'text-white/40 hover:text-white/70' : 'text-slate-400 hover:text-slate-600'}`}
          onClick={() => setOpen(false)}>
          <X size={15} />
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 overflow-auto space-y-0.5">
        {nav.map(n => {
          const Icon   = n.icon;
          const active = isActive(n.href);
          return (
            <Link key={n.href} href={n.href} prefetch
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                active
                  ? 'text-brand-700 dark:text-[#faf9f5]'
                  : 'text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white/90 hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
              style={active ? {
                background: dark ? 'rgba(255,255,255,0.08)' : '#EEF4FD',
                borderLeft: `3px solid ${n.iconColor}`,
                paddingLeft: '9px',
              } : {}}
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all"
                style={{
                  background: active
                    ? (dark ? `${n.iconColor}30` : n.iconBg)
                    : (dark ? `${n.iconColor}18` : `${n.iconColor}14`),
                }}>
                <Icon size={14} style={{ color: active ? n.iconColor : dark ? n.iconColor + 'bb' : n.iconColor + '99' }} />
              </div>
              <span className="flex-1 truncate">{n.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User profile footer */}
      {profileOpen && (
        <div className="fixed inset-0 z-40" onClick={() => { setProfileOpen(false); setConfirmLogout(false); }} />
      )}
      <div className="px-3 py-3 border-t shrink-0 relative"
        style={{ borderColor: dark ? 'rgba(255,255,255,0.05)' : '#e8edf4' }}
        onClick={() => setProfileOpen(o => !o)}>

        {/* Profile popup (opens upward) */}
        <div className={`absolute bottom-full left-2 right-2 mb-1.5 rounded-xl overflow-hidden z-50 transition-all duration-200 ${
          profileOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-1.5 pointer-events-none'
        }`} onClick={e => e.stopPropagation()} style={{
          background: dark ? '#30302e' : '#ffffff',
          border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #e2e8f0',
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
                  {user.role === 'admin'
                    ? 'Workspace Admin'
                    : (user.role === 'pm' || user.role === 'lead') ? 'Team Lead' : 'Individual Contributor'}
                </div>
              </div>
            </div>
            <div className="py-1">
              {[
                { href: '/settings',               Icon: User,  label: 'Profile & identity' },
                { href: '/settings#notifications',  Icon: Bell,  label: 'Notifications' },
                { href: '/settings#security',       Icon: Lock,  label: 'Security' },
              ].map(({ href, Icon, label }) => (
                <Link key={href} href={href}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                    dark ? 'text-white/55 hover:text-white/90 hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}>
                  <Icon size={12} className="shrink-0" /> {label}
                </Link>
              ))}
              {isLeadOrAdmin && (
                <button type="button"
                  onClick={() => { setInviteOpen(true); setProfileOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                    dark ? 'text-white/55 hover:text-white/90 hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}>
                  <UserPlus size={12} className="shrink-0" /> Invite a lead
                </button>
              )}
              <div className={`mx-3 my-1 h-px ${dark ? 'bg-white/6' : 'bg-slate-100'}`} />
              <div className="flex items-center gap-1 px-1">
                <button onClick={toggleDark}
                  className={`flex items-center gap-2 flex-1 px-2 py-2 rounded-lg text-xs transition-colors ${
                    dark ? 'text-white/50 hover:text-white/90 hover:bg-white/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}>
                  {dark ? <Sun size={12} className="shrink-0 text-amber-400/70" /> : <Moon size={12} className="shrink-0" />}
                  <span>{dark ? 'Light mode' : 'Dark mode'}</span>
                  <span className="ml-auto w-7 h-3.5 rounded-full flex items-center shrink-0 transition-all duration-200"
                    style={{ background: dark ? '#c96442' : '#e2e8f0', padding: '2px' }}>
                    <span className="w-2.5 h-2.5 rounded-full bg-white shadow transition-all duration-200"
                      style={{ transform: dark ? 'translateX(13px)' : 'translateX(0)' }} />
                  </span>
                </button>
                <button onClick={() => setConfirmLogout(true)}
                  className={`flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs transition-colors shrink-0 ${
                    dark ? 'text-red-400/55 hover:text-red-400 hover:bg-white/5' : 'text-red-500 hover:text-red-600 hover:bg-red-50'
                  }`}>
                  <LogOut size={12} /> <span>Sign out</span>
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
                  }`} style={dark ? { background: 'rgba(255,255,255,0.07)' } : {}}>
                  Cancel
                </button>
                <button onClick={logout}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    dark ? 'text-red-300 hover:text-red-200' : 'text-red-600 bg-red-50 hover:bg-red-100'
                  }`} style={dark ? { background: 'rgba(239,68,68,0.18)' } : {}}>
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
              {user.title || (user.role === 'admin' ? 'Workspace Admin' : (user.role === 'pm' || user.role === 'lead') ? 'Team Lead' : 'Contributor')}
            </div>
          </div>
          <ChevronUp size={11} className={`shrink-0 transition-transform duration-150 ${dark ? 'text-white/20' : 'text-slate-300'} ${profileOpen ? '' : 'rotate-180'}`} />
        </div>
      </div>
    </>
  );

  return (
    <CurrentUserProvider user={user}>
    <div className="min-h-screen flex" style={{ background: 'var(--bg-page)' }}>

      {/* Mobile backdrop */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`
          w-[220px] shrink-0 flex flex-col
          fixed inset-y-0 left-0 z-50
          lg:sticky lg:top-0 lg:h-screen
          transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{
          background: dark ? '#262624' : '#ffffff',
          borderRight: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e8edf4',
        }}
      >
        {SidebarInner}
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Mobile-only slim top strip */}
        <div className="lg:hidden sticky top-0 z-30 flex items-center gap-2.5 px-3 h-11"
          style={{
            background: dark ? '#262624' : '#ffffff',
            borderBottom: dark ? '1px solid rgba(255,255,255,0.07)' : '1px solid #e8edf4',
          }}>
          <button
            onClick={() => setOpen(o => !o)}
            className={`p-1.5 rounded-md -ml-1 transition-colors ${
              dark ? 'text-white/50 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
            aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <PragatiMark size={22} flat />
            <span className={`font-black text-sm tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>Pragati</span>
          </Link>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto relative">
          {pathname === '/' && (
            <div aria-hidden
              className="pointer-events-none absolute top-0 left-0 right-0 h-[200px]"
              style={{
                zIndex: 0,
                background: 'linear-gradient(180deg, rgba(21,101,192,0.09) 0%, rgba(21,101,192,0.04) 50%, transparent 100%)',
              }}
            />
          )}
          <div key={pathname} className="max-w-7xl mx-auto px-4 sm:px-5 lg:px-7 py-5 lg:py-7 page-enter relative">
            {children}
          </div>
        </main>
      </div>

      {mustChangePw && (
        <ForcePasswordModal onDone={() => { setMustChangePw(false); router.refresh(); }} />
      )}
      <InviteLeadModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
    </CurrentUserProvider>
  );
}
