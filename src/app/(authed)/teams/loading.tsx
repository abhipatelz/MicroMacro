// Server-rendered skeleton — paints instantly while the teams list streams in.
// Matches the live page shell: 1120px container, header + subtitle, `card p-4`
// toolbar, auto-fill card grid.
import { PragatiMark } from '@/components/PragatiMark';

export default function Loading() {
  return (
    <div className="pb-12 max-w-[1120px] space-y-5">
      <div className="flex items-start justify-between pt-1 gap-3 flex-wrap">
        <div className="space-y-2">
          <div className="skeleton h-8 w-32 rounded" />
          <div className="skeleton h-3.5 w-72 max-w-full rounded" />
        </div>
        <div className="skeleton h-9 w-28 rounded-lg" />
      </div>

      <div className="card p-4 min-h-[72px] flex items-center">
        <div className="skeleton h-9 w-full rounded-lg" />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="skeleton w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-4 w-20 rounded-full" />
              </div>
            </div>
            <div className="skeleton h-3 w-2/3 rounded" />
            <div className="flex -space-x-2">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="skeleton w-7 h-7 rounded-full ring-2 ring-white" />
              ))}
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div className="skeleton h-3 w-32 rounded" />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center pt-2 opacity-60">
        <PragatiMark size={22} flat />
      </div>
    </div>
  );
}
