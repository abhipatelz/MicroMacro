/**
 * In-memory token-bucket rate limiter.
 *
 * Used to throttle abuse-prone endpoints (login, password reset, bootstrap)
 * without pulling in Redis on day one. The state lives on `global` so it
 * survives Next.js module reloads within a single serverless instance, but
 * deliberately does NOT survive instance recycling — that's fine for the
 * threat model: a horizontal scale-out is bounded by how many concurrent
 * instances the platform spins up, and Vercel currently keeps that small
 * for a workspace of this size.
 *
 * For a multi-region / millions-of-users deploy, swap this for an Upstash
 * Redis (`@upstash/ratelimit`) without touching call sites — same signature.
 */

interface Bucket { count: number; resetAt: number; }

const STATE: Map<string, Bucket> =
  (global as any).__pragatiRateLimit ?? new Map<string, Bucket>();
(global as any).__pragatiRateLimit = STATE;

/**
 * Returns true if the request is allowed, false if it has exceeded `max`
 * within `windowMs`.
 *
 *   if (!rateLimit(`login:${ip}`, 20, 60_000)) return new Response('429', { status: 429 });
 *
 * The key namespace is the caller's responsibility — prefix with the route
 * + identifier you want to throttle ("login:1.2.3.4", "reset:userId").
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = STATE.get(key);
  if (!bucket || bucket.resetAt <= now) {
    STATE.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

/** Reset a key, e.g. after a successful login clears the failure window. */
export function rateLimitReset(key: string): void {
  STATE.delete(key);
}

// Sweep expired buckets every minute so the map can't grow unbounded.
if (!(global as any).__pragatiRateLimitSweeper) {
  (global as any).__pragatiRateLimitSweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of STATE) {
      if (b.resetAt <= now) STATE.delete(k);
    }
  }, 60_000).unref?.();
}
