import { BirdsEyeLoader } from '@/components/BirdsEyeLoader';

/**
 * Server-rendered loading state — no JS, no client hydration, paints instantly
 * between server data fetches. Uses the shared bird's-eye loader so every
 * loading surface across the app looks identical.
 */
export default function Loading() {
  return <BirdsEyeLoader />;
}
