'use client';
import { useState, useEffect, useRef } from 'react';
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
// Mandatory Quick-PIN setup on first login — lazy so it stays out of the bundle
// for everyone who already has a PIN.
const SetPinModal = dynamic(
  () => import('./SetPinModal').then(m => m.SetPinModal),
  { ssr: false, loading: () => null },
);
import {
  LayoutDashboard, FolderKanban, Users, UsersRound, NotebookPen,
  LogOut, Menu, X, Moon, Sun, AlertTriangle, ChevronLeft, ChevronRight, ScrollText,
} from 'lucide-react';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'pm' | 'lead' | 'admin';
  title?: string;
  mustChangePassword?: boolean;
  hasPin?: boolean;
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
  const [idleWarning, setIdleWarning] = useState(false);
  const [dark, toggleDark]            = useDarkMode(initialDark);
  const [mustChangePw, setMustChangePw] = useState(!!user.mustChangePassword);
  const [needsPin, setNeedsPin] = useState(!user.hasPin);
  const lastActivityRef = useRef(Date.now());

  // Desktop "distraction-free" collapse: shrinks the sidebar to an icon rail
  // (icons + avatar only). Persisted in localStorage so it survives reloads.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem('pragati_sidebar_collapsed') === '1');
  }, []);
  const toggleCollapsed = () => setCollapsed((c) => {
    const next = !c;
    localStorage.setItem('pragati_sidebar_collapsed', next ? '1' : '0');
    return next;
  });

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // ── Idle auto-logout ────────────────────────────────────────────────
  // 21 CFR Part 11 §11.10(d): unattended sessions must not stay open.
  // At 25 min idle we show a "Still there?" modal; at 30 min we force log out.
  useEffect(() => {
    const WARN_MS = 25 * 60 * 1000;
    const IDLE_MS = 30 * 60 * 1000;
    const mark = () => { lastActivityRef.current = Date.now(); setIdleWarning(false); };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const iv = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_MS) {
        clearInterval(iv);
        setIdleWarning(false);
        api('/auth/logout', { method: 'POST' }).finally(() => {
          router.replace('/login');
          router.refresh();
        });
      } else if (idle >= WARN_MS) {
        setIdleWarning(true);
      }
    }, 30_000);
    return () => {
      clearInterval(iv);
      events.forEach((e) => window.removeEventListener(e, mark));
    };
  }, [router]);

  type NavItem = { href: string; label: string; icon: any; iconColor: string; iconBg: string };

  const isAdmin       = user.role === 'admin';
  const isLeadOrAdmin = user.role === 'lead' || user.role === 'admin';

  // Team-lead nav: run teams, projects and tasks. NOT People — workspace
  // user management (create/reset/unlock/delete/promote accounts) is an
  // admin-only surface, appended via adminExtra below.
  // My Day is NOT in the main nav list — it renders pinned just above the user
  // footer so it's always reachable without scrolling.
  const leadNav: NavItem[] = [
    { href: '/',         label: 'Dashboard', icon: LayoutDashboard, iconColor: '#1565C0', iconBg: '#E3F2FD' },
    { href: '/projects', label: 'Projects',  icon: FolderKanban,    iconColor: '#7B1FA2', iconBg: '#F3E5F5' },
    { href: '/teams',    label: 'Team',      icon: Users,           iconColor: '#2E7D32', iconBg: '#E8F5E9' },
  ];
  const adminExtra: NavItem[] = [
    { href: '/people',   label: 'People',    icon: UsersRound,      iconColor: '#00897B', iconBg: '#E0F2F1' },
    { href: '/audit',    label: 'Logs',      icon: ScrollText,      iconColor: '#6366F1', iconBg: '#EEF2FF' },
  ];

  const employeeNav: NavItem[] = [
    { href: '/',         label: 'Dashboard', icon: LayoutDashboard, iconColor: '#1565C0', iconBg: '#E3F2FD' },
    { href: '/projects', label: 'Projects',  icon: FolderKanban,    iconColor: '#7B1FA2', iconBg: '#F3E5F5' },
    { href: '/teams',    label: 'Team',      icon: Users,           iconColor: '#2E7D32', iconBg: '#E8F5E9' },
  ];

  const myDayItem: NavItem = { href: '/my-day', label: 'My Day', icon: NotebookPen, iconColor: '#D97706', iconBg: '#FEF3C7' };

  const nav = isAdmin
    ? [...leadNav, ...adminExtra]
    : isLeadOrAdmin ? leadNav : employeeNav;
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname?.startsWith(href);

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  // Icon-only rail on desktop when collapsed. On mobile the drawer is always
  // shown full-width (the collapse toggle is desktop-only), so we suppress the
  // collapsed look whenever the mobile drawer is open.
  const showCollapsed = collapsed && !open;

  /* ── Sidebar inner content ─────────────────────────────────────────── */
  const SidebarInner = (
    <>
      {/* Brand header */}
      <div className="flex items-center gap-2.5 px-4 h-14 shrink-0 border-b overflow-hidden"
        style={{ borderColor: dark ? 'rgba(255,255,255,0.07)' : '#e8edf4' }}>
        <Link href="/" className={`flex items-center gap-2.5 ${showCollapsed ? 'justify-center w-full' : 'flex-1 min-w-0'}`}>
          <PragatiMark size={showCollapsed ? 28 : 30} flat />
          {!showCollapsed && (
            <span className={`font-black text-[20px] tracking-tight leading-none whitespace-nowrap ${dark ? 'text-white' : 'text-slate-900'}`}>
              Pragati
            </span>
          )}
        </Link>
        {!showCollapsed && (
          <div className="ml-auto flex items-center gap-1 shrink-0">
            {/* Close on mobile only */}
            <button className={`lg:hidden p-1 rounded-md ${dark ? 'text-white/40 hover:text-white/70' : 'text-slate-400 hover:text-slate-600'}`}
              onClick={() => setOpen(false)}>
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 overflow-auto flex flex-col">
        <div className="space-y-0.5 flex-1">
          {nav.map(n => {
            const Icon   = n.icon;
            const active = isActive(n.href);
            return (
              <Link key={n.href} href={n.href} prefetch title={showCollapsed ? n.label : undefined}
                className={`flex items-center gap-2.5 ${showCollapsed ? 'justify-center px-0' : 'px-2.5'} py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? 'text-brand-700 dark:text-[#faf9f5]'
                    : 'text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white/90 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
                style={active ? (showCollapsed ? {
                  background: dark ? 'rgba(255,255,255,0.08)' : '#EEF4FD',
                } : {
                  background: dark ? 'rgba(255,255,255,0.08)' : '#EEF4FD',
                  borderLeft: `3px solid ${n.iconColor}`,
                  paddingLeft: '9px',
                }) : {}}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all"
                  style={{
                    background: active
                      ? (dark ? `${n.iconColor}30` : n.iconBg)
                      : (dark ? `${n.iconColor}18` : `${n.iconColor}14`),
                  }}>
                  <Icon size={14} style={{ color: active ? n.iconColor : dark ? n.iconColor + 'bb' : n.iconColor + '99' }} />
                </div>
                {!showCollapsed && <span className="flex-1 truncate">{n.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* My Day — pinned just above the footer so it's always reachable */}
        <div className="mt-2 pt-2 border-t" style={{ borderColor: dark ? 'rgba(255,255,255,0.06)' : '#eef2f7' }}>
          {(() => {
            const n = myDayItem;
            const Icon   = n.icon;
            const active = isActive(n.href);
            return (
              <Link href={n.href} prefetch title={showCollapsed ? n.label : undefined}
                className={`flex items-center gap-2.5 ${showCollapsed ? 'justify-center px-0' : 'px-2.5'} py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? 'text-brand-700 dark:text-[#faf9f5]'
                    : 'text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white/90 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
                style={active ? (showCollapsed ? {
                  background: dark ? 'rgba(255,255,255,0.08)' : '#EEF4FD',
                } : {
                  background: dark ? 'rgba(255,255,255,0.08)' : '#EEF4FD',
                  borderLeft: `3px solid ${n.iconColor}`,
                  paddingLeft: '9px',
                }) : {}}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all"
                  style={{
                    background: active
                      ? (dark ? `${n.iconColor}30` : n.iconBg)
                      : (dark ? `${n.iconColor}18` : `${n.iconColor}14`),
                  }}>
                  <Icon size={14} style={{ color: active ? n.iconColor : dark ? n.iconColor + 'bb' : n.iconColor + '99' }} />
                </div>
                {!showCollapsed && <span className="flex-1 truncate">{n.label}</span>}
              </Link>
            );
          })()}
        </div>
      </nav>

      {/* Collapsed footer — notification + logout + avatar (theme toggle). */}
      {showCollapsed ? (
        <div className="px-2 py-3 border-t shrink-0 flex flex-col items-center gap-1.5"
          style={{ borderColor: dark ? 'rgba(255,255,255,0.05)' : '#e8edf4' }}>
          <NotificationBell dark={dark} openUp />
          <button type="button" onClick={() => setConfirmLogout(true)} title="Sign out"
            className={`p-2 rounded-lg transition-colors ${dark ? 'text-red-400/55 hover:text-red-400 hover:bg-white/5' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}>
            <LogOut size={16} />
          </button>
          <button type="button" onClick={toggleDark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="relative shrink-0 rounded-full focus:outline-none mt-0.5">
            <Avatar name={user.name} size={32} />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border"
              style={{ background: dark ? '#30302e' : '#ffffff', borderColor: dark ? 'rgba(255,255,255,0.15)' : '#e2e8f0' }}>
              {dark ? <Sun size={9} className="text-amber-400" /> : <Moon size={9} className="text-slate-500" />}
            </span>
          </button>
        </div>
      ) : (
      /* User footer — avatar toggles theme · name opens profile · bell ·
          sign-out drop-up. No catch-all menu. */
      <div className="px-3 py-3 border-t shrink-0 relative"
        style={{ borderColor: dark ? 'rgba(255,255,255,0.05)' : '#e8edf4' }}>

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
                : (user.role === 'lead') ? 'text-emerald-500'
                : 'text-blue-400'
              }`}>
              {user.role === 'admin' ? 'Admin' : (user.role === 'lead') ? 'Team Lead' : 'Individual Contributor'}
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
      )}
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
          relative shrink-0 flex flex-col
          fixed inset-y-0 left-0 z-50
          lg:sticky lg:top-0 lg:h-screen
          transition-[transform,width] duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{
          width: showCollapsed ? 68 : 220,
          background: dark ? '#262624' : '#ffffff',
          borderRight: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e8edf4',
        }}
      >
        {SidebarInner}
        {/* Collapse/expand ribbon — desktop only, on the right edge of sidebar */}
        <button
          className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 w-5 h-10 items-center justify-center rounded-full transition-colors"
          style={{
            background: dark ? '#30302e' : '#ffffff',
            border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #dde3ec',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            color: dark ? 'rgba(255,255,255,0.35)' : '#94a3b8',
          }}
          onClick={toggleCollapsed}
          title={showCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={showCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {showCollapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
        </button>
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

      {/* Mandatory Quick-PIN setup — only once the password step (if any) is
          cleared, so the two blocking modals never stack. */}
      {!mustChangePw && needsPin && (
        <SetPinModal onDone={() => { setNeedsPin(false); router.refresh(); }} />
      )}

      {/* Sign-out confirmation — fixed centered modal, works in both expanded and collapsed sidebar */}
      {confirmLogout && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setConfirmLogout(false)}>
          <div className="w-[300px] rounded-2xl p-6 flex flex-col items-center gap-4 text-center shadow-2xl"
            style={{ background: dark ? '#262624' : '#ffffff', border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #e2e8f0' }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: dark ? 'rgba(239,68,68,0.12)' : '#FEF2F2' }}>
              <AlertTriangle size={18} className="text-red-500" />
            </div>
            <div>
              <div className={`text-sm font-bold ${dark ? 'text-white/90' : 'text-slate-800'}`}>Sign out?</div>
              <div className={`text-xs mt-1 ${dark ? 'text-white/40' : 'text-slate-400'}`}>You'll need to sign back in.</div>
            </div>
            <div className="flex gap-2 w-full">
              <button onClick={() => setConfirmLogout(false)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  dark ? 'text-white/60 hover:text-white/80' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`} style={dark ? { background: 'rgba(255,255,255,0.07)' } : {}}>
                Cancel
              </button>
              <button onClick={logout}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
                  dark ? 'text-red-300 hover:text-red-200' : 'text-red-600 bg-red-50 hover:bg-red-100'
                }`} style={dark ? { background: 'rgba(239,68,68,0.18)' } : {}}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Idle session warning — 5 min before automatic sign-out */}
      {idleWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-[320px] rounded-2xl p-6 flex flex-col gap-4 text-center shadow-2xl"
            style={{ background: dark ? '#262624' : '#ffffff', border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #e2e8f0' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
              style={{ background: dark ? 'rgba(245,158,11,0.12)' : '#FEF3C7' }}>
              <AlertTriangle size={22} className="text-amber-500" />
            </div>
            <div>
              <div className={`text-base font-bold ${dark ? 'text-white/90' : 'text-slate-800'}`}>Still there?</div>
              <div className={`text-xs mt-1 leading-snug ${dark ? 'text-white/45' : 'text-slate-500'}`}>
                You'll be signed out in 5 minutes due to inactivity.
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => {
                lastActivityRef.current = Date.now();
                setIdleWarning(false);
              }} className="flex-1 py-2 rounded-xl text-sm font-bold transition-colors"
                style={dark ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.8)' } : { background: '#F1F5F9', color: '#475569' }}>
                Continue
              </button>
              <button onClick={logout}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-red-500 transition-colors"
                style={dark ? { background: 'rgba(239,68,68,0.18)' } : { background: '#FEF2F2' }}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </CurrentUserProvider>
  );
}
