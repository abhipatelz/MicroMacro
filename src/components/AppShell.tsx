'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar } from './ui';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Calendar,
  PieChart,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { api } from '@/lib/client/api';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'lead' | 'manager' | 'admin';
  title?: string;
}

export default function AppShell({
  user,
  children
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const nav = [
    { href: '/', label: 'My Dashboard', icon: LayoutDashboard },
    { href: '/projects', label: 'Projects', icon: FolderKanban },
    { href: '/teams', label: 'Teams', icon: Users },
    { href: '/yearly', label: 'Yearly View', icon: Calendar },
    { href: '/ai/triage', label: 'AI Triage', icon: Sparkles, badge: 'AI' },
    { href: '/ai/risk', label: 'Deadline Risk', icon: AlertTriangle, badge: 'ML' }
  ];
  if (user.role === 'manager' || user.role === 'admin') {
    nav.splice(4, 0, { href: '/org', label: 'Org Overview', icon: PieChart });
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-60 shrink-0 bg-slate-900 text-slate-100 flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-4 border-b border-slate-800">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center font-bold">
              Q
            </div>
            <div>
              <div className="font-semibold leading-tight">QInformX</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                Quality Informatics PM
              </div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-auto">
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                  isActive(n.href)
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon size={16} className="shrink-0" />
                <span className="flex-1">{n.label}</span>
                {n.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-500 text-white">
                    {n.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-800 flex items-center gap-2">
          <Avatar name={user.name} />
          <div className="flex-1 text-xs">
            <div className="font-medium text-slate-100">{user.name}</div>
            <div className="text-slate-400">{user.title || user.role}</div>
          </div>
          <button
            onClick={logout}
            className="text-xs text-slate-400 hover:text-white"
            title="Sign out"
          >
            ⎋
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
