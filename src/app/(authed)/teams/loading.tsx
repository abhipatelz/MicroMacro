import { TeamsListSkeleton } from '@/components/SkeletonScreens';

const teams = ['RTB operations', 'CTB delivery', 'Validation squad', 'Quality review'];

      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 space-y-3.5 flex flex-col" style={{ minHeight: 220 }}>
            <div className="flex items-start gap-3">
              <div className="skeleton w-12 h-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-[18px] w-3/4 rounded" />
                <div className="skeleton h-4 w-24 rounded-full" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-2/3 rounded" />
            </div>
            <div className="flex -space-x-2 pt-1">
              {[0, 1, 2, 3, 4].map((j) => (
                <div key={j} className="skeleton w-8 h-8 rounded-full ring-2 ring-white" />
              ))}
            </div>
            <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="skeleton h-3 w-36 rounded" />
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
