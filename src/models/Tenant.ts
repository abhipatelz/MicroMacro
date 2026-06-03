import mongoose, { Schema, InferSchemaType } from 'mongoose';

/**
 * ── Multi-tenant registry (DORMANT) ─────────────────────────────────────
 *
 * This document lives in the **central registry database** (separate from
 * every tenant's operational data). Its purpose is purely to record which
 * tenants exist, where they live, and what they're allowed to do — a
 * billing / provisioning surface, not an operational one.
 *
 * The model is scaffolded but currently inactive — the runtime uses a single
 * "default" tenant unless the `PRAGATI_MULTI_TENANT` env flag is set. When
 * we're ready to onboard the second tenant, we:
 *
 *   1. Provision a fresh Mongo database (e.g. `pragati_acme`)
 *   2. Insert a Tenant document here (slug=acme, dbName=pragati_acme, …)
 *   3. Add the hostname → tenant mapping (subdomain or `?tenant=` parameter)
 *
 * No application code changes — the connection router (src/lib/tenants.ts)
 * picks up the new tenant on the next request.
 *
 * Inspired by the "central registry, per-tenant DB" pattern in the
 * scoping note: billing + auth lookups stay in this registry so they keep
 * working even if a tenant's operational DB is briefly unavailable.
 */
const TenantSchema = new Schema({
  // Stable slug used in URLs and as the routing key. Lowercased + sanitized.
  slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  // Human-readable name (the customer's organisation).
  displayName: { type: String, required: true },
  // Where the operational data lives. Either:
  //   - dbName       : same cluster, separate database (small tenants)
  //   - connectionUri: dedicated cluster for high-compliance customers
  // Both are NEVER returned to the client — they're registry-internal.
  dbName:        { type: String, default: '' },
  connectionUri: { type: String, default: '' },
  // Custom hostname mapping (acme.pragati.app). Optional; falls back to the
  // default app domain with the slug as a query parameter.
  customDomain: { type: String, default: '' },
  // Plan tier — controls feature gating + quotas. Free for the default
  // single-tenant deployment; paid tiers added later.
  plan: {
    type: String,
    enum: ['free', 'starter', 'pro', 'enterprise'],
    default: 'free',
  },
  // Soft quota for safety; the operational DB rejects writes once a tenant
  // exceeds the cap by 10% (warning surface below that).
  userQuota:    { type: Number, default: 25 },
  projectQuota: { type: Number, default: 200 },
  // Lifecycle. `active: false` blocks all sign-ins for the tenant; useful
  // for billing-suspended customers without deleting their data.
  active:       { type: Boolean, default: true },
  // Master-admin notes (visible only on the master admin console).
  notes:        { type: String, default: '' },
}, { timestamps: true });

TenantSchema.index({ slug: 1 }, { unique: true });
TenantSchema.index({ customDomain: 1 });
TenantSchema.index({ active: 1 });

export type TenantDoc = InferSchemaType<typeof TenantSchema>;
export const Tenant = (mongoose.models.Tenant as mongoose.Model<TenantDoc>) ||
  mongoose.model<TenantDoc>('Tenant', TenantSchema);
