import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie, isAdmin } from '@/lib/auth';
import AlcoaCoverageClient from './AlcoaCoverageClient';

export const runtime = 'nodejs';

/**
 * Admin-only ALCOA+ / 21 CFR Part 11 coverage dashboard.
 *
 * A read-only triage view over the GxP task corpus. It runs each GxP-critical
 * task through the deterministic `scoreAlcoa()` engine (no LLM, no mutation)
 * and surfaces the data-integrity gaps a QA reviewer must close: tasks that
 * require QA sign-off but aren't signed, GxP-critical tasks missing a
 * document/SOP reference, and "done" records missing a completion timestamp.
 *
 * Lives under /audit because it is part of the compliance/oversight surface,
 * which is already admin-gated.
 */
export default async function AlcoaCoveragePage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');
  if (!isAdmin(jwt.role)) redirect('/');

  return <AlcoaCoverageClient />;
}
