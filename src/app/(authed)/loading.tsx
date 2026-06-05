// Server-rendered dashboard skeleton — paints instantly between server fetches.
// LinkedIn-style: it mirrors the real DashboardClient shell (1440px container,
// greeting + bird's-eye button, a row of stat chips, then a 1fr + 340px split)
// so content materialises in place instead of swapping out a spinner and
// reflowing. No JS, no hydration.
import { PragatiMark } from '@/components/PragatiMark';

export default function Loading() {
  return (
    <div className="pb-12 max-w-[1440px]">
      {/* Greeting row */}
      <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="skeleton h-8 w-64 max-w-full rounded" />
          <div className="skeleton h-3.5 w-44 rounded" />
        </div>
        <div className="skeleton h-8 w-28 rounded-lg shrink-0" />
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-8 w-28 rounded-lg" />
        ))}
      </div>

      {/* Main split: content (1fr) + sidebar (340px) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* Left column — panels */}
        <div className="space-y-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card p-0 overflow-hidden">
              {/* Panel header */}
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
                <div className="skeleton h-7 w-7 rounded-lg" />
                <div className="skeleton h-4 w-40 rounded" />
                <div className="skeleton h-5 w-12 rounded-full ml-auto" />
              </div>
              {/* Panel rows */}
              <div className="divide-y divide-slate-100">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3.5 w-3/4 rounded" />
                      <div className="skeleton h-2.5 w-1/3 rounded" />
                    </div>
                    <div className="skeleton h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Right column — sidebar cards */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="skeleton h-6 w-6 rounded-lg" />
                <div className="skeleton h-3.5 w-28 rounded" />
              </div>
              <div className="skeleton h-2.5 w-full rounded" />
              <div className="skeleton h-2.5 w-5/6 rounded" />
              <div className="skeleton h-2.5 w-2/3 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Brand mark — calm anchor so it reads as "loading something of ours". */}
      <div className="flex items-center justify-center pt-6 opacity-60">
        <PragatiMark size={22} flat />
      </div>
    </div>
  );
}
