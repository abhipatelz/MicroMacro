'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function TriageRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/insights'); }, [router]);
  return null;
}
