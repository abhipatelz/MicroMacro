/**
 * Production smoke test — read-only checks against a live deployment.
 *
 *   npx tsx scripts/smoke-prod.ts https://pragatialm.vercel.app
 *
 * What this confirms:
 *   ✓ /api/health is 200 and Mongo ping latency is healthy
 *   ✓ /bootstrap returns 404 (the production-safe state)
 *   ✓ /api/admin/bootstrap returns 404 (token not set)
 *   ✓ /api/auth/register returns 403 (public registration disabled)
 *   ✓ /login renders
 *   ✓ Security headers are present (CSP, HSTS, X-Frame-Options, etc.)
 *
 * This does NOT touch the database. It's safe to run minutes before opening
 * the workspace to real users. Anything that requires authentication
 * (lockout, archive, export, privilege guards) has to be smoked manually
 * in a browser — those checks live in the LAUNCH_CHECKLIST.md.
 */

const [, , baseArg] = process.argv;
const base = (baseArg || 'https://pragatialm.vercel.app').replace(/\/$/, '');

interface Check { name: string; ok: boolean; detail: string; }
const results: Check[] = [];

function pass(name: string, detail: string) { results.push({ name, ok: true,  detail }); }
function fail(name: string, detail: string) { results.push({ name, ok: false, detail }); }

async function probe(path: string, expectedStatus: number | number[]) {
  const url = base + path;
  const res = await fetch(url, { redirect: 'manual' }).catch((e) => ({ status: 0, error: e } as any));
  const want = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  return { url, status: res.status, ok: want.includes(res.status), res };
}

async function main() {
  console.log(`\n→ Smoking ${base}\n`);

  // 1. Liveness
  {
    const r = await probe('/api/health', 200);
    if (!r.ok) {
      fail('/api/health', `status ${r.status} (expected 200)`);
    } else {
      const body = await (r.res as Response).json().catch(() => ({}));
      const latency = body.latencyMs ?? -1;
      if (body.ok && body.db === 'up' && latency < 1000) {
        pass('/api/health', `db=up, latency=${latency}ms`);
      } else {
        fail('/api/health', `body=${JSON.stringify(body)}`);
      }
    }
  }

  // 2. /bootstrap must be 404 in steady state
  {
    const r = await probe('/bootstrap', 404);
    if (r.ok) pass('/bootstrap → 404', 'token not configured (correct)');
    else      fail('/bootstrap → 404', `status ${r.status} — ADMIN_BOOTSTRAP_TOKEN appears to be set in prod env`);
  }

  // 3. /api/admin/bootstrap must be 404 in steady state
  {
    const r = await fetch(base + '/api/admin/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).catch(() => ({ status: 0 } as any));
    if (r.status === 404) pass('/api/admin/bootstrap', '404 (disabled)');
    else                  fail('/api/admin/bootstrap', `status ${r.status} (expected 404)`);
  }

  // 4. Public registration must be off
  {
    const r = await fetch(base + '/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email:    `smoke+${Date.now()}@example.test`,
        name:     'Smoke',
        password: 'should-not-work-1234',
      }),
    }).catch(() => ({ status: 0 } as any));
    if (r.status === 403) pass('/api/auth/register', '403 (disabled)');
    else                  fail('/api/auth/register', `status ${r.status} (expected 403)`);
  }

  // 5. Login page renders
  {
    const r = await probe('/login', 200);
    if (r.ok) pass('/login', 'renders');
    else      fail('/login', `status ${r.status}`);
  }

  // 6. Security headers
  {
    const r = await fetch(base + '/login').catch(() => null);
    if (r) {
      const need = [
        ['content-security-policy', /default-src/],
        ['x-frame-options',         /DENY|SAMEORIGIN/i],
        ['x-content-type-options',  /nosniff/i],
        ['referrer-policy',         /./],
      ] as const;
      for (const [h, re] of need) {
        const v = r.headers.get(h);
        if (v && re.test(v)) pass(`header ${h}`, v.slice(0, 80));
        else                 fail(`header ${h}`, v ? `value didn't match: ${v}` : 'missing');
      }
      if (base.startsWith('https://')) {
        const hsts = r.headers.get('strict-transport-security');
        if (hsts && /max-age=\d{7,}/.test(hsts)) pass('header strict-transport-security', hsts);
        else                                     fail('header strict-transport-security', hsts || 'missing');
      }
    }
  }

  // ── Report ───────────────────────────────────────────────────────────
  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
  console.log(pad('CHECK', 40) + 'STATUS  DETAIL');
  console.log('─'.repeat(80));
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    const tag  = r.ok ? 'PASS' : 'FAIL';
    console.log(`${pad(r.name, 38)} ${icon}  ${pad(tag, 5)} ${r.detail}`);
  }
  console.log();
  const failed = results.filter(r => !r.ok).length;
  if (failed === 0) {
    console.log('✓ All checks passed. Safe to open the workspace.\n');
    process.exit(0);
  } else {
    console.log(`✗ ${failed} check(s) failed. Do NOT open the workspace until fixed.\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
