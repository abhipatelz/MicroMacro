'use client';
import { useParams } from 'next/navigation';
import YearlyView from '../YearlyView';

export default function YearlyOtherPage() {
  const { userId } = useParams<{ userId: string }>();
  return <YearlyView targetUserId={userId} />;
}
