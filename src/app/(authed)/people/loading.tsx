// Server-rendered skeleton — paints instantly while the people directory
// streams in. No JS, no hydration.
export default function Loading() {
  return (
    <div className="pb-12 max-w-[1200px]">
      <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <div className="skeleton h-8 w-44" />
          <div className="skeleton h-3 w-64 max-w-full" />
        </div>
        <div className="skeleton h-9 w-32 rounded-xl" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
