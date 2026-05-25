'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { api } from '@/lib/client/api';
import { chimeIfEnabled } from '@/lib/sound';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  taskId: string | null;
  read: boolean;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
}

/**
 * Bell + dropdown in the app shell. Polls every 30s; when the unread count
 * goes UP, it chimes (respecting the user's sound mute). Clicking an item
 * marks it read and deep-links to the task.
 */
export function NotificationBell({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const [items, setItems]   = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen]     = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prevUnread = useRef<number | null>(null);

  async function load(chimeOnIncrease = false) {
    try {
      const res = await api<{ unread: number; items: Notif[] }>('/notifications');
      setItems(res.items);
      setUnread(res.unread);
      if (chimeOnIncrease && prevUnread.current !== null && res.unread > prevUnread.current) {
        chimeIfEnabled();
      }
      prevUnread.current = res.unread;
    } catch { /* ignore polling errors */ }
  }

  // Initial load + 30s poll.
  useEffect(() => {
    load(false);
    const t = setInterval(() => load(true), 30_000);
    return () => clearInterval(t);
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function markAllRead() {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    prevUnread.current = 0;
    try { await api('/notifications/read', { method: 'POST', body: {} }); } catch {}
  }

  function openItem(n: Notif) {
    setOpen(false);
    if (!n.read) {
      api('/notifications/read', { method: 'POST', body: { id: n.id } }).catch(() => {});
      setUnread((u) => Math.max(0, u - 1));
    }
    if (n.taskId) router.push(`/tasks/${n.taskId}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        onClick={() => { setOpen((o) => !o); }}
        className={`relative p-1.5 rounded-lg transition-colors ${
          dark ? 'text-white/55 hover:text-white/90 hover:bg-white/5' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
        }`}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] z-50 bg-white rounded-xl border border-slate-200 overflow-hidden"
             style={{ boxShadow: '0 8px 30px rgba(15,23,42,0.16)' }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-800">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">You're all caught up.</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-2.5 ${
                    n.read ? '' : 'bg-blue-50/40'
                  }`}
                >
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-blue-500'}`} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-slate-800 leading-tight">{n.title}</span>
                    {n.body && <span className="block text-xs text-slate-500 truncate mt-0.5">{n.body}</span>}
                    <span className="block text-[11px] text-slate-400 mt-0.5">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
