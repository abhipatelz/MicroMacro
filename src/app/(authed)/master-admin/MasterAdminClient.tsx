'use client';
import { ShieldAlert, Globe, Power, Users, Building2 } from 'lucide-react';

interface TenantRow {
  id: string;
  slug: string;
  displayName: string;
  plan: string;
  active: boolean;
  userQuota: number;
  projectQuota: number;
  customDomain: string;
  createdAt: string;
}

/**
 * Master-admin console UI — dormant scaffolding.
 *
 * When `active` is false (the current single-tenant deploy) we show a status
 * board explaining how to enable the multi-tenant runtime. When it's true,
 * the page lists the registered tenants and (in future) gates the
 * provisioning / shadow-login actions behind further confirmation. Those
 * actions are NOT implemented here yet — adding them without a real
 * customer is a recipe for half-built code.
 */
export default function MasterAdminClient({
  active,
  adminName,
  stats,
  tenants,
}: {
  active: boolean;
  adminName: string;
  stats: { totalTenants: number; totalUsers: number };
  tenants: TenantRow[];
}) {
  return (
    <div className="max-w-5xl pb-12 space-y-6">
      <header className="pb-5 mb-1 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 page-icon-box bg-purple-50 dark:bg-purple-500/10 shrink-0">
              <Globe size={19} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="page-title">Tenant registry</h1>
              <p className="text-sm text-slate-500 dark:text-white/45 mt-1 leading-snug">
                Signed in as <span className="font-semibold text-slate-700 dark:text-white/70">{adminName}</span>.
                This console is visible only to users with the <code className="font-mono text-xs bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded">master_admin</code> role.
              </p>
            </div>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full mt-0.5 ${
            active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
          }`}>
            {active ? 'Runtime: Active' : 'Runtime: Dormant'}
          </span>
        </div>
      </header>

      {!active && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Power size={18} className="text-amber-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-amber-900 mb-1">Multi-tenant runtime is dormant</h2>
              <p className="text-sm text-amber-800 leading-relaxed">
                The data model, role check, and connection router are all
                scaffolded — the workspace currently runs as a single tenant
                called <span className="font-mono font-bold">default</span>.
                To activate the multi-tenant runtime:
              </p>
              <ol className="mt-3 space-y-1.5 text-sm text-amber-900 list-decimal list-inside">
                <li>Set <code className="font-mono text-xs bg-white/70 px-1.5 py-0.5 rounded">PRAGATI_MULTI_TENANT=true</code> in the hosting environment.</li>
                <li>Provision the first tenant database in Atlas (e.g. <span className="font-mono">pragati_acme</span>).</li>
                <li>Insert the corresponding <span className="font-mono">tenants</span> document (slug, dbName, customDomain, plan).</li>
                <li>Redeploy. Future requests are routed by tenant slug; existing data stays under <span className="font-mono">default</span>.</li>
              </ol>
              <p className="mt-3 text-xs text-amber-800/80">
                Cross-tenant analytics are intentionally not surfaced from
                operational data. When ready, route them through a separate
                analytics warehouse rather than querying tenant DBs directly.
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={<Building2 size={16} className="text-blue-600" />}  label="Tenants"        value={stats.totalTenants} sub={active ? 'Registered in this deploy' : 'Single-tenant (default)'} />
        <StatCard icon={<Users size={16} className="text-emerald-600" />}    label="Users"          value={stats.totalUsers}   sub="Across the default tenant" />
        <StatCard icon={<ShieldAlert size={16} className="text-purple-600" />} label="Privilege"     value={1}                  sub="Master-admin accounts" />
      </div>

      {active && (
        <section>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Registered tenants</h2>
              <span className="text-[10px] text-slate-400 font-semibold">{tenants.length}</span>
            </div>
            <span className="text-[10px] text-slate-400 italic">Provisioning UI lands with the first paying customer.</span>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
            {tenants.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">No tenants registered yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-2.5">Slug</th>
                    <th className="px-2 py-2.5">Name</th>
                    <th className="px-2 py-2.5">Plan</th>
                    <th className="px-2 py-2.5">Domain</th>
                    <th className="px-2 py-2.5">Active</th>
                    <th className="px-2 py-2.5">Quotas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tenants.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{t.slug}</td>
                      <td className="px-2 py-2.5 text-slate-700">{t.displayName}</td>
                      <td className="px-2 py-2.5 text-xs uppercase font-bold text-slate-500">{t.plan}</td>
                      <td className="px-2 py-2.5 text-xs text-slate-500">{t.customDomain || '—'}</td>
                      <td className="px-2 py-2.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {t.active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-slate-500">
                        {t.userQuota} users · {t.projectQuota} projects
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-black text-slate-800 tabular-nums">{value}</div>
      <div className="text-[10px] text-slate-400 mt-1">{sub}</div>
    </div>
  );
}
