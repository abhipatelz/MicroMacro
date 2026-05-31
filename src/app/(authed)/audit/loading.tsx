// Server-rendered skeleton — paints instantly while the operation logs stream
// in. No JS, no hydration.
export default function Loading() {
  return (
    <div className="max-w-5xl space-y-5 pb-12">
      <div className="space-y-2">
        <div className="skeleton h-7 w-52" />
        <div className="skeleton h-3 w-80 max-w-full" />
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton h-7 w-20 rounded-full" />)}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="skeleton h-10 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
