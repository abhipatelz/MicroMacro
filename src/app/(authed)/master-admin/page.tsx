import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie, isMasterAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Tenant } from '@/models/Tenant';
import { User } from '@/models/User';
import { isMultiTenantActive } from '@/lib/tenants';
import MasterAdminClient from './MasterAdminClient';

export const runtime = 'nodejs';

/**
 * ── Master-admin console (DORMANT) ──────────────────────────────────────
 *
 * Lives at /master-admin. Visible only to users with role === 'master_admin'
 * AND when the runtime flag is on. In the current single-tenant deployment
 * the route silently 404s (redirects to /) so no one stumbles onto it.
 *
 * From the scoping note, the master admin's powers are deliberately scoped:
 *  - Tenant provisioning and lifecycle
 *  - Shadow-login (audited) into a tenant as its admin
 *  - Cross-tenant migrations
 *  - Aggregated, non-identifying metrics
 *
 * This page is the entry point. The actual provisioning + impersonation
 * endpoints are intentionally NOT written yet — they're the second slice
 * of work, behind real customer requirements.
 */
export default async function MasterAdminPage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');
  if (!isMasterAdmin(jwt.role)) redirect('/');

  // If the multi-tenant runtime isn't active we still let a master-admin in,
  // but we render a "dormant" notice instead of provisioning UI — the page
  // doubles as a status board for whether the feature is on.
  const active = isMultiTenantActive();

  await connectDB();

  const [tenants, totalUsers] = await Promise.all([
    active ? Tenant.find({}).sort({ createdAt: -1 }).limit(50).lean() : [],
    User.countDocuments({}),
  ]);

  return (
    <MasterAdminClient
      active={active}
      adminName={jwt.name}
      stats={{ totalTenants: tenants.length, totalUsers }}
      tenants={tenants.map((t: any) => ({
        id: String(t._id),
        slug: t.slug,
        displayName: t.displayName,
        plan: t.plan,
        active: t.active,
        userQuota: t.userQuota,
        projectQuota: t.projectQuota,
        customDomain: t.customDomain || '',
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt || ''),
      }))}
    />
  );
}
