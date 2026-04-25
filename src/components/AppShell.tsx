'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar } from './ui';
import { LayoutDashboard, FolderKanban, Users, Calendar, PieChart, Lightbulb, LogOut } from 'lucide-react';
import { api } from '@/lib/client/api';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'pm';
  title?: string;
}

// Alembic Digital chevron logo mark — two blue, one green
function AlembicChevron({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 3 L13 16 L2 29"   stroke="#42A5F5" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11 3 L22 16 L11 29" stroke="#1E88E5" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M20 9 L30 16 L20 23" stroke="#43A047" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const employeeNav = [
    { href: '/', label: 'My Tasks',   icon: LayoutDashboard },
    { href: '/projects', label: 'Projects', icon: FolderKanban },
    { href: '/yearly',   label: 'My Year',  icon: Calendar },
  ];

  const pmNav = [
    { href: '/',          label: 'Dashboard',      icon: LayoutDashboard },
    { href: '/projects',  label: 'Projects',        icon: FolderKanban },
    { href: '/teams',     label: 'Teams',            icon: Users },
    { href: '/org',       label: 'Team Overview',    icon: PieChart },
    { href: '/yearly',    label: 'Yearly View',      icon: Calendar },
    { href: '/insights',  label: 'Insights',         icon: Lightbulb,     badge: 'Live' },
  ];

  const nav = user.role === 'pm' ? pmNav : employeeNav;
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname?.startsWith(href);

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#F0F4FA' }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className="w-60 shrink-0 flex flex-col sticky top-0 h-screen chevron-watermark"
        style={{ background: 'linear-gradient(180deg, #0A3480 0%, #0D47A1 50%, #1565C0 100%)' }}
      >
        {/* Logo area */}
        <div className="px-4 py-5 border-b border-white/10">
          <Link href="/" className="flex items-center gap-3">
            <AlembicChevron size={30} />
            <div>
              <div className="font-bold text-white text-base tracking-tight leading-tight">Pragati</div>
              <div className="text-[10px] text-blue-200/80 uppercase tracking-widest leading-tight mt-0.5">
                Alembic Digital
              </div>
            </div>
          </Link>
        </div>

        {/* Role badge */}
        <div className="px-4 pt-3 pb-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300/60">
            {user.role === 'pm' ? '▸ Project Manager' : '▸ Team Member'}
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 pb-3 space-y-0.5 overflow-auto">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                  active
                    ? 'bg-white/15 text-white shadow-sm border border-white/10'
                    : 'text-blue-100/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon
                  size={16}
                  className={`shrink-0 transition-colors ${active ? 'text-blue-200' : 'text-blue-300/60 group-hover:text-blue-200'}`}
                />
                <span className="flex-1">{n.label}</span>
                {(n as any).badge && (
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      (n as any).badge === 'AI' ? 'bg-forest-500/80 text-white' : 'bg-brand-500/80 text-white'
                    }`}
                  >
                    {(n as any).badge}
                  </span>
                )}
                {active && (
                  <div className="w-1 h-1 rounded-full bg-forest-400 shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Tagline */}
        <div className="px-4 py-2 border-t border-white/10">
          <div className="text-[9px] text-blue-300/40 uppercase tracking-widest leading-relaxed text-center">
            Empowering Excellence<br />through Technology
          </div>
        </div>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 bg-white/10 rounded-lg px-3 py-2.5">
            <Avatar name={user.name} size={30} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white truncate">{user.name}</div>
              <div className="text-[10px] text-blue-200/60 truncate">{user.title || (user.role === 'pm' ? 'Project Manager' : 'Team Member')}</div>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="text-blue-300/50 hover:text-white transition-colors ml-1"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        {/* Top accent bar */}
        <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, #1565C0, #43A047)' }} />
        <div className="max-w-7xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
