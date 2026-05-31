// Server-rendered skeleton — paints instantly while the projects list streams
// in. Mirrors the final layout so content appears to materialise in place
// rather than flashing a spinner. No JS, no hydration.
export default function Loading() {
  return (
    <div className="pb-12 max-w-[1440px]">
      <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <div className="skeleton h-8 w-48" />
          <div className="skeleton h-3 w-72 max-w-full" />
        </div>
        <div className="skeleton h-9 w-32 rounded-xl" />
      </div>
      <div className="flex gap-2 mb-5 flex-wrap">
        {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-8 w-28 rounded-lg" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton h-44 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
