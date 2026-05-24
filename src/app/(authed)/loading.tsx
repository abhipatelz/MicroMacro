import { PragatiMark } from '@/components/PragatiMark';

/**
 * Server-rendered loading state — no JS, no client hydration, paints
 * instantly between server data fetches. The mark itself rotates and the
 * brand wordmark sits below; intentionally quiet so it doesn't distract
 * from the rapid hand-off to real content.
 */
export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
      {/* Brand mark with a soft rotating ring behind it */}
      <div className="relative w-20 h-20">
        <div
          className="absolute inset-0 rounded-3xl"
          style={{
            background: 'conic-gradient(from 0deg, #1565C0 0%, #2E7D32 50%, #1565C0 100%)',
            animation: 'pragati-spin 1.4s linear infinite',
            filter: 'blur(2px)',
            opacity: 0.55,
          }}
        />
        <div className="absolute inset-1.5 flex items-center justify-center rounded-2xl bg-white">
          <PragatiMark size={48} flat />
        </div>
      </div>

      <div className="text-center">
        <div className="text-base font-bold text-slate-800 tracking-tight">
          Bird's-eye view, loading…
        </div>
        <div className="text-xs text-slate-400 mt-1">
          Pragati — progress, one step at a time.
        </div>
      </div>

      <style>{`
        @keyframes pragati-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
