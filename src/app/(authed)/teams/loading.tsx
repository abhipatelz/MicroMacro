// Server-rendered skeleton — paints instantly while the teams list streams in.
// No JS, no hydration.
export default function Loading() {
  return (
    <div className="pb-12 max-w-[1440px]">
      <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <div className="skeleton h-8 w-40" />
          <div className="skeleton h-3 w-64 max-w-full" />
        </div>
        <div className="skeleton h-9 w-28 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton h-40 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
