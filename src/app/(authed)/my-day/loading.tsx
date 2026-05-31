// Server-rendered skeleton — paints instantly while My Day streams in.
// No JS, no hydration.
export default function Loading() {
  return (
    <div className="pb-12 max-w-3xl">
      <div className="mb-6 space-y-2">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-3 w-72 max-w-full" />
      </div>
      <div className="skeleton h-12 w-full rounded-xl mb-5" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
