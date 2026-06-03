// Server-rendered skeleton — paints instantly while the ALCOA+ coverage
// rollup is scored on the server. No JS, no hydration.
export default function Loading() {
  return (
    <div className="max-w-5xl space-y-5 pb-12">
      <div className="space-y-2">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-3 w-96 max-w-full" />
      </div>
      <div className="skeleton h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-24 w-full rounded-2xl" />)}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
