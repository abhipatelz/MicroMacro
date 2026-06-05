import { ProjectsListSkeleton } from '@/components/SkeletonScreens';

const cards = ['Change control', 'Validation pack', 'CAPA follow-up', 'Release readiness'];

      {/* Card grid */}
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-0 overflow-hidden flex flex-col" style={{ minHeight: 240 }}>
            <div className="skeleton h-1.5 w-full rounded-none" />
            <div className="p-5 flex flex-col h-full space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-4 w-16 rounded-full" />
                <div className="skeleton h-4 w-20 rounded-full ml-auto" />
              </div>
              <div className="skeleton h-5 w-3/4 rounded" />
              <div className="space-y-1.5">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
              </div>
              <div className="flex gap-2">
                <div className="skeleton h-5 w-24 rounded-full" />
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <div className="skeleton h-3 w-20 rounded" />
                  <div className="skeleton h-3 w-10 rounded" />
                </div>
                <div className="skeleton h-2 w-full rounded-full" />
              </div>
              <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
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
