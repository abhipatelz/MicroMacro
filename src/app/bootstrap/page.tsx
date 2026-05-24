import { notFound } from 'next/navigation';
import { BootstrapClient } from './BootstrapClient';

/**
 * Browser-only first-run admin setup.
 *
 * The page itself 404s unless `ADMIN_BOOTSTRAP_TOKEN` is set in the hosting
 * environment — this happens server-side, before any HTML is shipped, so a
 * disabled bootstrap looks indistinguishable from a random unknown URL.
 *
 * To enable:
 *   1. Vercel → Environment Variables → set ADMIN_BOOTSTRAP_TOKEN to a
 *      long random string (>= 16 chars). Redeploy.
 *   2. Visit /bootstrap, paste the token, provision the admin.
 *   3. Delete the env var, redeploy. /bootstrap returns 404 again.
 */
export const dynamic = 'force-dynamic';

export default function BootstrapPage() {
  const token = process.env.ADMIN_BOOTSTRAP_TOKEN?.trim();
  if (!token || token.length < 16) {
    notFound();
  }
  return <BootstrapClient />;
}
