// Server-rendered skeleton — paints instantly while the projects list streams
// in. Mirrors the final layout so content appears to materialise in place
// rather than flashing a spinner. No JS, no hydration. Composed from the
// shared skeleton kit so it stays in lockstep with every other route.
import { PageSkeleton, HeaderSkeleton, FilterRowSkeleton, CardGridSkeleton } from '@/components/skeletons';

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action />
      <FilterRowSkeleton count={4} />
      <CardGridSkeleton count={6} />
    </PageSkeleton>
  );
}
