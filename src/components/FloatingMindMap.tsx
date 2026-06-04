'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { X, BrainCircuit } from 'lucide-react';

const MindMap = dynamic(
  () => import('./MindMap').then((m) => m.MindMap),
  { ssr: false, loading: () => (
    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
      Loading…
    </div>
  )},
);

export function FloatingMindMap() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Don't show FAB on My Day (mind map is already embedded there)
  if (pathname === '/my-day') return null;

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Open mind map"
        aria-label="Open mind map"
        className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full shadow-lg
          flex items-center justify-center transition-all duration-200
          bg-gradient-to-br from-blue-600 to-emerald-500 hover:scale-105 active:scale-95"
        style={{ boxShadow: '0 4px 20px rgba(21,101,192,0.45)' }}
      >
        <BrainCircuit size={20} className="text-white" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col shadow-2xl
          bg-white dark:bg-[#1a1917]
          border-l border-slate-200 dark:border-white/10
          transition-transform duration-300 ease-in-out"
        style={{
          width: 'min(680px, 95vw)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
        aria-hidden={!open}
      >
        {/* Drawer header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3
          border-b border-slate-100 dark:border-white/[0.07]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500
              flex items-center justify-center">
              <BrainCircuit size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold text-slate-800 dark:text-white/85">Mind map</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700
              hover:bg-slate-100 dark:hover:bg-white/[0.07] transition-colors"
            aria-label="Close mind map"
          >
            <X size={15} />
          </button>
        </div>

        {/* MindMap — only mount when drawer is open to avoid competing with
            the My Day instance for /api/scratch/mindmap when both are in the
            DOM at the same time. */}
        <div className="flex-1 min-h-0 overflow-hidden p-3">
          {open && <MindMap />}
        </div>
      </div>
    </>
  );
}
