// Server-rendered skeleton — paints instantly while the profile & settings
// page streams in. No JS, no hydration.
export default function Loading() {
  return (
    <div className="pb-12 max-w-4xl">
      <div className="skeleton h-40 w-full rounded-2xl mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-3">
          <div className="skeleton h-48 w-full rounded-2xl" />
          <div className="skeleton h-64 w-full rounded-2xl" />
        </div>
        <div className="space-y-3">
          <div className="skeleton h-40 w-full rounded-2xl" />
          <div className="skeleton h-28 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
