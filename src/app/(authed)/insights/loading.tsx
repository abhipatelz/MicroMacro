import { PageSkeleton, HeaderSkeleton, CardGridSkeleton } from '@/components/skeletons';

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <CardGridSkeleton count={6} height="h-64" />
    </PageSkeleton>
  );
}
