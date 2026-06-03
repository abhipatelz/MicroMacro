import type { NextRequest } from 'next/server';
import { Tenant } from '@/models/Tenant';

/**
 * ── Tenant resolution + connection routing (DORMANT) ────────────────────
 *
 * Companion to src/models/Tenant.ts. Two layers:
 *
 *   1. resolveTenant(req)
 *      → from a request, return which tenant should handle it.
 *      Order of precedence:
 *        a. PRAGATI_MULTI_TENANT not set → always "default"
 *        b. x-pragati-tenant header (used by the master-admin shadow-login)
 *        c. host header matching a Tenant.customDomain
 *        d. ?tenant=<slug> query parameter
 *        e. fall back to "default"
 *
 *   2. tenantDbName(tenantSlug)
 *      → returns the Mongo database name to connect to.
 *
 * Why this is a small surface today: enabling multi-tenant later means
 * (a) flipping PRAGATI_MULTI_TENANT=true and (b) seeding the Tenant
 * collection with the right rows. Every API route already calls
 * connectDB() which can route through tenantDbName() once we're ready —
 * no code change in the route handlers themselves. This is the "model
 * ready, not deployed" posture the user asked for.
 */

export const DEFAULT_TENANT_SLUG = 'default';

/** Is the multi-tenant runtime active? Flipping this on enables tenant
 *  resolution per request. Stays off in the current single-tenant deploy. */
export function isMultiTenantActive(): boolean {
  return process.env.PRAGATI_MULTI_TENANT === 'true';
}

/**
 * Resolve which tenant a given request belongs to. Returns the tenant slug
 * (string). Cheap and synchronous — no DB hit when multi-tenant is off.
 */
export function resolveTenantSlug(req: Pick<NextRequest, 'headers' | 'nextUrl'>): string {
  if (!isMultiTenantActive()) return DEFAULT_TENANT_SLUG;
  const explicit = req.headers.get('x-pragati-tenant');
  if (explicit) return sanitizeSlug(explicit);
  // Host-based lookup is async (DB hit), so we defer to the
  // master-admin-controlled header for the synchronous path. The host
  // route (resolveTenantByHost) is called from middleware once we wire it.
  const queryTenant = req.nextUrl.searchParams.get('tenant');
  if (queryTenant) return sanitizeSlug(queryTenant);
  return DEFAULT_TENANT_SLUG;
}

/** Async lookup — find the tenant whose customDomain matches a hostname. */
export async function resolveTenantByHost(host: string): Promise<string> {
  if (!isMultiTenantActive() || !host) return DEFAULT_TENANT_SLUG;
  try {
    const t = await Tenant.findOne({ customDomain: host.toLowerCase(), active: true }, 'slug').lean();
    return ((t as any)?.slug as string) || DEFAULT_TENANT_SLUG;
  } catch {
    return DEFAULT_TENANT_SLUG;
  }
}

/**
 * Translate a tenant slug into the Mongo database name to connect to. The
 * default tenant uses the database embedded in the connection URI (or
 * "pragati" if none); other tenants use `pragati_<slug>` unless they have a
 * dedicated `dbName` override in the registry.
 *
 * SAFETY: never returns an empty string — an empty database name would
 * silently fall back to whatever the URI specified, which could cross-tenant.
 */
export async function tenantDbName(slug: string): Promise<string> {
  const safe = sanitizeSlug(slug);
  if (safe === DEFAULT_TENANT_SLUG) return 'pragati';
  try {
    const t = await Tenant.findOne({ slug: safe, active: true }, 'dbName connectionUri').lean();
    if ((t as any)?.dbName) return (t as any).dbName;
  } catch { /* fall through to derived name */ }
  return `pragati_${safe}`;
}

function sanitizeSlug(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 40) || DEFAULT_TENANT_SLUG;
}

/** Role check helper — kept here so it doesn't bloat src/lib/auth.ts. */
export function isMasterAdmin(role: string | null | undefined): boolean {
  return role === 'master_admin';
}
