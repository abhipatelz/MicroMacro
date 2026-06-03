import { PageSkeleton, HeaderSkeleton, CardGridSkeleton } from '@/components/skeletons';

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action />
      <CardGridSkeleton count={6} />
    </PageSkeleton>
  );
}
