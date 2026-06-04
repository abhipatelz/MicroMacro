// Server-rendered skeleton — paints instantly while the projects list streams
// in. Mirrors the actual page shell: 1120px container, header + subtitle,
// tabs strip, `card p-4` toolbar, auto-fill card grid. Matches the live
// layout so content materialises in place rather than reflowing on hydrate.
import { PragatiMark } from '@/components/PragatiMark';

export default function Loading() {
  return (
    <div className="pb-12 max-w-[1120px] space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between pt-1">
        <div className="space-y-2">
          <div className="skeleton h-8 w-40 rounded" />
          <div className="skeleton h-3.5 w-72 max-w-full rounded" />
        </div>
        <div className="skeleton h-9 w-32 rounded-lg" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-100">
        {['', '', ''].map((_, i) => (
          <div key={i} className="skeleton h-7 w-20 rounded-t-lg" />
        ))}
      </div>

      {/* Toolbar */}
      <div className="card p-4 min-h-[72px] flex items-center gap-3">
        <div className="skeleton h-9 flex-1 rounded-lg" />
        <div className="skeleton h-9 w-40 rounded-lg hidden sm:block" />
        <div className="skeleton h-9 w-44 rounded-lg hidden sm:block" />
      </div>

      {/* Card grid */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5 flex-1">
                <div className="skeleton h-2.5 w-28 rounded" />
                <div className="skeleton h-5 w-3/4 rounded" />
              </div>
              <div className="skeleton h-5 w-20 rounded-full" />
            </div>
            <div className="skeleton h-1.5 w-full rounded-full" />
            <div className="flex justify-between">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-3 w-12 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Brand mark — calm anchor so the skeleton reads as "loading something
          of ours" rather than a generic shimmer screen. */}
      <div className="flex items-center justify-center pt-2 opacity-60">
        <PragatiMark size={22} flat />
      </div>
    </div>
  );
}
