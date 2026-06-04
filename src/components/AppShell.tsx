'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Avatar } from './ui';
import { PragatiMark } from './PragatiMark';
import { CurrentUserProvider } from './CurrentUserContext';
import { AvatarRegistryProvider } from './AvatarRegistry';
import { NotificationBell } from './NotificationBell';
import { api } from '@/lib/client/api';

// Floating mind-map FAB + drawer — lazy so the MindMap bundle stays out of
// every page's initial load and only fetches when the drawer is first opened.
const FloatingMindMap = dynamic(
  () => import('./FloatingMindMap').then((m) => m.FloatingMindMap),
  { ssr: false, loading: () => null },
);
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
// Spotlight onboarding tour — mounted at the shell level so contributors,
// leads, and admins all get it on whichever page they land on.
const FirstTimeTour = dynamic(
  () => import('./FirstTimeTour').then(m => m.FirstTimeTour),
  { ssr: false, loading: () => null },
);
import {
  LayoutDashboard, FolderKanban, Users, UsersRound, NotebookPen,
  LogOut, Menu, X, Moon, Sun, AlertTriangle, ChevronLeft, ChevronRight, ScrollText,
  UserCircle, Layers, Globe,
} from 'lucide-react';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: 'contributor' | 'lead' | 'admin' | 'master_admin';
  title?: string;
  mustChangePassword?: boolean;
  hasPin?: boolean;
  /** Number of successful full logins. Used to defer the Quick-PIN modal
   *  until the second visit so first-time users aren't piled on. */
  loginCount?: number;
  /** ISO date when the user dismissed the Quick-PIN prompt; suppresses
   *  the modal until they re-engage from Settings. */
  pinPromptDismissedAt?: string | null;
  /** Whether the user has already completed the onboarding tour. */
  hasSeenTour?: boolean;
  /** Server-persisted monogram avatar (Google-style). */
  avatarLetter?: string;
  avatarBg?: string;
  avatarFont?: number;
  /** Drop-sound preference for kanban / dashboard reorders. */
  soundDropEnabled?: boolean;
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
export default function AppShell({ user, initialDark, initialSidebarCollapsed = false, initialAvatars, initialUnread = 0, children }: { user: CurrentUser; initialDark: boolean; initialSidebarCollapsed?: boolean; initialAvatars?: Record<string, { letter: string; bg: string; font: number }>; initialUnread?: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  const [open, setOpen]               = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [idleWarning, setIdleWarning] = useState(false);
  const [dark, toggleDark]            = useDarkMode(initialDark);
  const [mustChangePw, setMustChangePw] = useState(!!user.mustChangePassword);
  // Show the PIN modal only when ALL of these hold:
  //  • the user doesn't already have a PIN
  //  • they've completed at least 2 full logins (first visit is busy with
  //    password change + onboarding tour)
  //  • they haven't dismissed the prompt this session with "Maybe later"
  const shouldOfferPin =
    !user.hasPin &&
    (user.loginCount ?? 0) >= 2 &&
    !user.pinPromptDismissedAt;
  const [needsPin, setNeedsPin] = useState(shouldOfferPin);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Desktop "distraction-free" collapse: shrinks the sidebar to an icon rail
  // (icons + avatar only). Persisted in a cookie (read server-side) so the
  // server knows the initial width on first paint — no layout shift after hydration.
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const toggleCollapsed = () => setCollapsed((c) => {
    const next = !c;
    document.cookie = `sidebar_collapsed=${next ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`;
    return next;
  });

  useEffect(() => { setOpen(false); setAccountMenuOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (accountMenuRef.current?.contains(e.target as Node)) return;
      setAccountMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAccountMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountMenuOpen]);

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

  const isAdmin       = user.role === 'admin' || user.role === 'master_admin';
  const isMasterAdmin = user.role === 'master_admin';
  const isLeadOrAdmin = user.role === 'lead' || isAdmin;

  // Team-lead nav: run teams, projects and tasks. NOT People — workspace
  // user management (create/reset/unlock/delete/promote accounts) is an
  // admin-only surface, appended via adminExtra below.
  // My Day is NOT in the main nav list — it renders pinned just above the user
  // footer so it's always reachable without scrolling.
  const leadNav: NavItem[] = [
    { href: '/',         label: 'Dashboard', icon: LayoutDashboard, iconColor: '#1565C0', iconBg: '#E3F2FD' },
    { href: '/projects', label: 'Projects',  icon: FolderKanban,    iconColor: '#7B1FA2', iconBg: '#F3E5F5' },
    { href: '/teams',    label: 'Teams',     icon: Users,           iconColor: '#2E7D32', iconBg: '#E8F5E9' },
  ];
  const adminExtra: NavItem[] = [
    { href: '/admin',    label: 'Console',   icon: Layers,          iconColor: '#4F46E5', iconBg: '#EEF2FF' },
    { href: '/people',   label: 'People',    icon: UsersRound,      iconColor: '#00897B', iconBg: '#E0F2F1' },
    { href: '/audit',    label: 'Logs',      icon: ScrollText,      iconColor: '#6366F1', iconBg: '#EEF2FF' },
  ];
  // The master-admin item is only added when the signed-in user actually holds
  // that role. In the current single-tenant deploy no one does, so the link
  // never appears — the route itself also redirects non-master-admins.
  const masterAdminExtra: NavItem[] = isMasterAdmin
    ? [{ href: '/master-admin', label: 'Platform', icon: Globe, iconColor: '#9333EA', iconBg: '#F3E8FF' }]
    : [];

  const contributorNav: NavItem[] = [
    { href: '/',         label: 'Dashboard', icon: LayoutDashboard, iconColor: '#1565C0', iconBg: '#E3F2FD' },
    { href: '/projects', label: 'Projects',  icon: FolderKanban,    iconColor: '#7B1FA2', iconBg: '#F3E5F5' },
    { href: '/teams',    label: 'Teams',     icon: Users,           iconColor: '#2E7D32', iconBg: '#E8F5E9' },
  ];

  const myDayItem: NavItem = { href: '/my-day', label: 'My Day', icon: NotebookPen, iconColor: '#D97706', iconBg: '#FEF3C7' };

  const nav = isAdmin
    ? [...leadNav, ...adminExtra, ...masterAdminExtra]
    : isLeadOrAdmin ? leadNav : contributorNav;
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname?.startsWith(href);

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const roleText = user.role === 'admin'
    ? 'Admin'
    : user.role === 'lead' ? 'Team Lead' : 'Individual Contributor';

  // Decluttered: a single entry into the profile (which now holds Activity and,
  // behind a disclosure, Security / Quick PIN / admin tools). Notifications and
  // their preferences live in the bell. Dark mode + Sign out follow below.
  const accountItems = [
    { href: '/settings', label: 'Profile & activity', icon: UserCircle },
  ];

  const AccountMenu = accountMenuOpen ? (
    <div
      ref={accountMenuRef}
      className="absolute left-3 bottom-[72px] z-30 w-[270px] rounded-2xl border p-2 shadow-2xl"
      style={{
        background: dark ? '#2b2b29' : '#ffffff',
        borderColor: dark ? 'rgba(255,255,255,0.10)' : '#dbe3ef',
        boxShadow: dark ? '0 18px 44px rgba(0,0,0,0.45)' : '0 18px 44px rgba(15,23,42,0.16)',
      }}
    >
      <div className="px-2.5 py-2.5 flex items-center gap-3 border-b mb-1.5"
        style={{ borderColor: dark ? 'rgba(255,255,255,0.08)' : '#eef2f7' }}>
        <Avatar name={user.name} size={38} letter={user.avatarLetter} bg={user.avatarBg} font={user.avatarFont} ring />
        <div className="min-w-0">
          <div className={`text-sm font-black truncate ${dark ? 'text-white' : 'text-slate-900'}`}>{user.name}</div>
          <div className={`text-[11px] truncate ${dark ? 'text-white/45' : 'text-slate-400'}`}>{roleText}</div>
        </div>
      </div>

      {accountItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
              dark ? 'text-white/70 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Icon size={16} className={dark ? 'text-white/40' : 'text-slate-400'} />
            <span>{item.label}</span>
          </Link>
        );
      })}

      <div className="my-1.5 border-t" style={{ borderColor: dark ? 'rgba(255,255,255,0.08)' : '#eef2f7' }} />
      <button
        type="button"
        onClick={() => { toggleDark(); setAccountMenuOpen(false); }}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
          dark ? 'text-white/70 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
      >
        {dark ? <Sun size={16} className="text-amber-300" /> : <Moon size={16} className="text-slate-400" />}
        <span>{dark ? 'Light mode' : 'Dark mode'}</span>
      </button>
      <button
        type="button"
        onClick={() => { setAccountMenuOpen(false); setConfirmLogout(true); }}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
          dark ? 'text-red-300/75 hover:text-red-300 hover:bg-red-400/10' : 'text-red-600 hover:bg-red-50'
        }`}
      >
        <LogOut size={16} />
        <span>Sign out</span>
      </button>
    </div>
  ) : null;

  // Icon-only rail on desktop when collapsed. On mobile the drawer is always
  // shown full-width (the collapse toggle is desktop-only), so we suppress the
  // collapsed look whenever the mobile drawer is open.
  // When hovered while collapsed, we show the full sidebar as a fly-out overlay
  // (not locked — collapses back when mouse leaves). Clicking anywhere on the
  // sidebar while in hover-expand mode permanently expands it (toggleCollapsed).
  const showCollapsed = collapsed && !open && !sidebarHovered;

  /* ── Sidebar inner content ─────────────────────────────────────────── */
  const SidebarInner = (
    <>
      {/* Brand header — the mark is `shrink-0` so flexbox never compresses it,
          and the wordmark is only *rendered* when expanded (not just faded),
          so it can't occupy width and squeeze the 30px mark in the 68px rail.
          That double-guard is what fixes the "logo squeezed from both sides"
          in the collapsed sidebar. */}
      <div className="relative flex items-center h-14 shrink-0 border-b overflow-hidden"
        style={{ borderColor: dark ? 'rgba(255,255,255,0.07)' : '#e8edf4' }}>
        <Link href="/"
          className={`flex items-center min-w-0 w-full ${showCollapsed ? 'justify-center' : 'gap-2.5 pl-[18px] pr-4'}`}>
          <span className="shrink-0">
            <PragatiMark size={30} />
          </span>
          {!showCollapsed && (
            <span className={`brand-wordmark text-[21px] whitespace-nowrap ${dark ? 'text-white' : 'brand-wordmark-gradient'}`}>
              Pragati
            </span>
          )}
        </Link>
        {!showCollapsed && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
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
                data-tour={`nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`}
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
                data-tour="nav-my-day"
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

      {/* Collapsed footer — notification + logout + account avatar. */}
      {showCollapsed ? (
        <div className="px-2 py-3 border-t shrink-0 flex flex-col items-center gap-1.5 relative"
          style={{ borderColor: dark ? 'rgba(255,255,255,0.05)' : '#e8edf4' }}>
          {AccountMenu}
          {/* Notifications are intentionally NOT shown on the collapsed rail —
              the bell + count live in the expanded sidebar; hover/expand to
              reach them. Keeps the narrow rail uncluttered. */}
          {/* No standalone sign-out here when collapsed — it lives inside the
              account menu (tap the avatar), keeping the rail uncluttered. */}
          <button type="button" title="Account menu" aria-label="Account menu"
            data-tour="account-menu"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setAccountMenuOpen((v) => !v)}
            className="relative shrink-0 rounded-full focus:outline-none mt-0.5">
            <Avatar name={user.name} size={32} letter={user.avatarLetter} bg={user.avatarBg} font={user.avatarFont} ring />
          </button>
        </div>
      ) : (
      /* User footer — avatar + name open the account menu; the bell sits to
         the side, large enough to tap on touch devices. The whole strip is a
         single subtly-tinted card so the avatar doesn't read as floating in a
         corner — it feels like a deliberate identity panel. */
      <div className="p-3 border-t shrink-0 relative"
        style={{ borderColor: dark ? 'rgba(255,255,255,0.05)' : '#e8edf4' }}>
        {AccountMenu}

        <div
          className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors cursor-pointer ${
            dark ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'bg-slate-50 hover:bg-slate-100/80'
          }`}
          style={{ border: dark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #e8edf4' }}
          onClick={() => setAccountMenuOpen((v) => !v)}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Avatar + name -> account menu */}
          <button type="button" title="Account menu" aria-label="Account menu"
            data-tour="account-menu"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setAccountMenuOpen((v) => !v); }}
            className="relative shrink-0 rounded-full focus:outline-none">
            <Avatar name={user.name} size={34} letter={user.avatarLetter} bg={user.avatarBg} font={user.avatarFont} ring />
          </button>

          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-bold truncate leading-tight ${dark ? 'text-white/90' : 'text-slate-800'}`}>{user.name}</div>
            {/* Role as plain muted metadata — no dot, no colour-coded chip. The
                role is contextual info, not an alert, so it shouldn't compete
                visually with the user's name above it. */}
            <div className={`text-[10px] font-semibold uppercase tracking-wider truncate mt-0.5 ${dark ? 'text-white/45' : 'text-slate-400'}`}>
              {roleText}
            </div>
          </div>

          {/* Notifications — opens upward so it's never clipped at the bottom.
              Seeded with the SSR unread count so the badge is correct on first
              paint instead of popping in after the first poll. */}
          <div onClick={(e) => e.stopPropagation()}>
            <NotificationBell dark={dark} openUp initialUnread={initialUnread} />
          </div>
        </div>
      </div>
      )}
    </>
  );

  return (
    <CurrentUserProvider user={user}>
    <AvatarRegistryProvider
      seed={{ id: user.id, letter: user.avatarLetter, bg: user.avatarBg, font: user.avatarFont }}
      initial={initialAvatars}
    >
    {/* Fixed-height app shell: the shell itself never scrolls (overflow-hidden),
        so the sidebar stays put — only <main> scrolls. This is what keeps the
        sidebar pinned regardless of how far the page content scrolls. */}
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--bg-page)' }}>

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
          shrink-0 flex flex-col
          fixed inset-y-0 left-0 z-50
          lg:sticky lg:top-0 lg:h-screen
          transition-[transform,width] duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${collapsed && !open && sidebarHovered ? 'lg:fixed lg:z-50' : ''}
        `}
        style={{
          width: showCollapsed ? 68 : 220,
          background: dark ? '#262624' : '#ffffff',
          borderRight: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e8edf4',
          boxShadow: collapsed && !open && sidebarHovered ? (dark ? '4px 0 24px rgba(0,0,0,0.5)' : '4px 0 24px rgba(15,23,42,0.18)') : undefined,
        }}
        onMouseEnter={() => { if (collapsed && !open) setSidebarHovered(true); }}
        onMouseLeave={() => setSidebarHovered(false)}
        onClick={() => { if (collapsed && !open && sidebarHovered) { toggleCollapsed(); setSidebarHovered(false); } }}
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
          onClick={(e) => { e.stopPropagation(); toggleCollapsed(); setSidebarHovered(false); }}
          title={showCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={showCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {showCollapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
        </button>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">

        {/* Mobile-only slim top strip — soft shadow so it lifts off the page as
            content scrolls under it, instead of exposing a hard white edge. */}
        <div className="lg:hidden sticky top-0 z-30 flex items-center gap-2.5 px-3 h-11"
          style={{
            background: dark ? 'rgba(38,38,36,0.85)' : 'rgba(255,255,255,0.85)',
            backdropFilter: 'saturate(180%) blur(8px)',
            WebkitBackdropFilter: 'saturate(180%) blur(8px)',
            borderBottom: dark ? '1px solid rgba(255,255,255,0.07)' : '1px solid #e8edf4',
            boxShadow: dark ? '0 2px 12px rgba(0,0,0,0.4)' : '0 2px 10px rgba(15,23,42,0.08)',
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
            <PragatiMark size={22} />
            <span className={`brand-wordmark text-[15px] ${dark ? 'text-white' : 'brand-wordmark-gradient'}`}>Pragati</span>
          </Link>
        </div>

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-y-auto relative">
          {pathname === '/' && (
            <div aria-hidden
              className="pointer-events-none absolute top-0 left-0 right-0 h-[200px]"
              style={{
                zIndex: 0,
                background: 'linear-gradient(180deg, rgba(21,101,192,0.09) 0%, rgba(21,101,192,0.04) 50%, transparent 100%)',
              }}
            />
          )}
          <div className="max-w-7xl mx-auto px-4 sm:px-5 lg:px-7 py-5 lg:py-7 relative overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>

      {mustChangePw && (
        <ForcePasswordModal onDone={() => { setMustChangePw(false); router.refresh(); }} />
      )}

      {/* Spotlight onboarding tour — runs once per user (server-tracked via
          hasSeenTour). Mounted here so every role sees it regardless of
          which page they land on after login, and so it doesn't clash with
          the password / PIN gates above (it's lazy and exits cleanly when
          alreadySeen). */}
      {!mustChangePw && !needsPin && (
        <FirstTimeTour alreadySeen={user.hasSeenTour !== false} />
      )}

      {/* Quick-PIN prompt — only after the password step (if any) is cleared,
          and from the user's second login onward (see shouldOfferPin above).
          Dismissable: "Maybe later" records pinPromptDismissedAt so we stop
          blocking and re-offer gently next session. */}
      {!mustChangePw && needsPin && (
        <SetPinModal
          onDone={() => { setNeedsPin(false); router.refresh(); }}
          onDismiss={async () => {
            setNeedsPin(false);
            try { await api('/me/pin-prompt-dismissed', { method: 'POST' }); } catch { /* best-effort */ }
          }}
        />
      )}

      {/* Floating mind-map FAB + drawer */}
      <FloatingMindMap />

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
    </AvatarRegistryProvider>
    </CurrentUserProvider>
  );
}
