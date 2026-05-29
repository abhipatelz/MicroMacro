'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Avatar } from './ui';
import { PragatiMark } from './PragatiMark';
import { CurrentUserProvider } from './CurrentUserContext';
import { NotificationBell } from './NotificationBell';
import { api } from '@/lib/client/api';

// Force-password modal — only ships when a user has mustChangePassword set.
// Keeps the long form code (strength meter, validators) out of the main bundle.
const ForcePasswordModal = dynamic(
  () => import('./ForcePasswordModal').then(m => m.ForcePasswordModal),
  { ssr: false, loading: () => null },
);
import {
  LayoutDashboard, FolderKanban, Users, UsersRound, NotebookPen,
  LogOut, Menu, X, Moon, Sun, AlertTriangle,
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

/* ── Main shell ─────────────────────────────────────────────────────── */
export default function AppShell({ user, initialDark, children }: { user: CurrentUser; initialDark: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  const [open, setOpen]               = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [dark, toggleDark]            = useDarkMode(initialDark);
  const [mustChangePw, setMustChangePw] = useState(!!user.mustChangePassword);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // ── Idle auto-logout ────────────────────────────────────────────────
  // Sign the user out after 30 minutes with no interaction. We record the
  // last-activity time on cheap passive listeners and poll once a minute,
  // rather than resetting a timer on every mousemove. (21 CFR Part 11
  // §11.10(d) — unattended sessions shouldn't stay open indefinitely.)
  useEffect(() => {
    const IDLE_MS = 30 * 60 * 1000;
    let last = Date.now();
    const mark = () => { last = Date.now(); };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const iv = setInterval(() => {
      if (Date.now() - last >= IDLE_MS) {
        clearInterval(iv);
        api('/auth/logout', { method: 'POST' }).finally(() => {
          router.replace('/login');
          router.refresh();
        });
      }
    }, 60_000);
    return () => {
      clearInterval(iv);
      events.forEach((e) => window.removeEventListener(e, mark));
    };
  }, [router]);

  type NavItem = { href: string; label: string; icon: any; iconColor: string; iconBg: string };

  const isAdmin       = user.role === 'admin';
  const isLeadOrAdmin = user.role === 'pm' || user.role === 'lead' || user.role === 'admin';

  // Team-lead nav: run teams, projects and tasks. NOT People — workspace
  // user management (create/reset/unlock/delete/promote accounts) is an
  // admin-only surface, appended via adminExtra below.
  const leadNav: NavItem[] = [
    { href: '/',         label: 'Dashboard', icon: LayoutDashboard, iconColor: '#1565C0', iconBg: '#E3F2FD' },
    { href: '/my-day',   label: 'My Day',    icon: NotebookPen,     iconColor: '#D97706', iconBg: '#FEF3C7' },
    { href: '/projects', label: 'Projects',  icon: FolderKanban,    iconColor: '#7B1FA2', iconBg: '#F3E5F5' },
    { href: '/teams',    label: 'Team',      icon: Users,           iconColor: '#2E7D32', iconBg: '#E8F5E9' },
  ];
  const adminExtra: NavItem[] = [
    { href: '/people',   label: 'People',    icon: UsersRound,      iconColor: '#00897B', iconBg: '#E0F2F1' },
  ];

  const employeeNav: NavItem[] = [
    { href: '/',         label: 'My Tasks', icon: LayoutDashboard, iconColor: '#1565C0', iconBg: '#E3F2FD' },
    { href: '/my-day',   label: 'My Day',   icon: NotebookPen,     iconColor: '#D97706', iconBg: '#FEF3C7' },
    { href: '/projects', label: 'Projects', icon: FolderKanban,    iconColor: '#7B1FA2', iconBg: '#F3E5F5' },
  ];

  const nav = isAdmin
    ? [...leadNav, ...adminExtra]
    : isLeadOrAdmin ? leadNav : employeeNav;
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
        <Link href="/" className="flex items-center gap-2.5 flex-1 min-w-0">
          <PragatiMark size={30} flat />
          <span className={`font-black text-[20px] tracking-tight leading-none ${dark ? 'text-white' : 'text-slate-900'}`}>
            Pragati
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell dark={dark} />
          {/* Close on mobile */}
          <button className={`lg:hidden p-1 rounded-md ${dark ? 'text-white/40 hover:text-white/70' : 'text-slate-400 hover:text-slate-600'}`}
            onClick={() => setOpen(false)}>
            <X size={15} />
          </button>
        </div>
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

      {/* User footer — avatar toggles theme · name opens profile · bell ·
          sign-out drop-up. No catch-all menu. */}
      <div className="px-3 py-3 border-t shrink-0 relative"
        style={{ borderColor: dark ? 'rgba(255,255,255,0.05)' : '#e8edf4' }}>

        {/* Sign-out confirm drop-up */}
        {confirmLogout && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setConfirmLogout(false)} />
            <div className="absolute bottom-full left-2 right-2 mb-1.5 rounded-xl overflow-hidden z-50"
              style={{
                background: dark ? '#30302e' : '#ffffff',
                border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #e2e8f0',
                boxShadow: '0 -8px 32px rgba(0,0,0,0.15)',
              }}>
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
          </>
        )}

        <div className={`flex items-center gap-2 rounded-lg px-1.5 py-1.5 ${dark ? '' : ''}`}>
          {/* Avatar = one-click theme toggle, with a sun/moon hint badge */}
          <button type="button" onClick={toggleDark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="relative shrink-0 rounded-full focus:outline-none">
            <Avatar name={user.name} size={30} />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border"
              style={{ background: dark ? '#30302e' : '#ffffff', borderColor: dark ? 'rgba(255,255,255,0.15)' : '#e2e8f0' }}>
              {dark ? <Sun size={9} className="text-amber-400" /> : <Moon size={9} className="text-slate-500" />}
            </span>
          </button>

          {/* Name + role → profile page */}
          <Link href="/settings" className="flex-1 min-w-0 group">
            <div className={`text-xs font-semibold truncate group-hover:underline ${dark ? 'text-white/80' : 'text-slate-700'}`}>{user.name}</div>
            <div style={{ fontSize: 10 }}
              className={`truncate ${
                user.role === 'admin' ? 'text-amber-500'
                : (user.role === 'pm' || user.role === 'lead') ? 'text-emerald-500'
                : 'text-blue-400'
              }`}>
              {user.role === 'admin' ? 'Admin' : (user.role === 'pm' || user.role === 'lead') ? 'Team Leader' : 'Individual Contributor'}
            </div>
          </Link>

          {/* Notifications — opens upward so it's never clipped at the bottom */}
          <NotificationBell dark={dark} openUp />

          {/* Sign out */}
          <button type="button" onClick={() => setConfirmLogout(true)} title="Sign out"
            className={`shrink-0 p-1.5 rounded-lg transition-colors ${
              dark ? 'text-red-400/55 hover:text-red-400 hover:bg-white/5' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
            }`}>
            <LogOut size={15} />
          </button>
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
    </div>
    </CurrentUserProvider>
  );
}
