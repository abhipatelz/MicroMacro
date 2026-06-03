import { PageSkeleton, HeaderSkeleton, FilterRowSkeleton, ListSkeleton } from '@/components/skeletons';

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <FilterRowSkeleton count={5} />
      <ListSkeleton count={10} />
    </PageSkeleton>
  );
}
