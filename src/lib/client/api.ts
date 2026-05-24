'use client';

/**
 * Thin wrapper around fetch() used by every client component.
 *
 * Behaviour for non-OK responses:
 *
 * - 401 / 403 → on any *authenticated* request, treat the session as
 *   expired and bounce back to /login. This is the right reflex for
 *   internal pages (e.g. someone left a tab open overnight).
 *
 * - 401 / 403 → on the auth endpoints themselves (/auth/login,
 *   /auth/register, /auth/signup, /auth/first-password) we do NOT
 *   redirect — the caller is *trying* to log in, so a wrong-password
 *   401 should bubble up as a normal error and render below the form.
 *   This is what the user actually expects: "Invalid email or password"
 *   visible below the field, not a silent page reload.
 *
 * - All other non-OK responses throw an Error with the server's
 *   message; callers display it via setErr() or a toast.
 */

const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/signup',
  '/auth/first-password',
  '/auth/password',
];

function isAuthEndpoint(path: string): boolean {
  return AUTH_ENDPOINTS.some((p) => path.startsWith(p));
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error || j.message || JSON.stringify(j);
    } catch {
      /* response wasn't JSON — fall back to the HTTP-X label */
    }

    // Session-expired bounce — only on authenticated routes. Login /
    // register routes propagate the 401/403 to the caller so the form
    // can render a useful message instead of reloading itself.
    if ((res.status === 401 || res.status === 403) && !isAuthEndpoint(path)) {
      if (typeof window !== 'undefined') window.location.replace('/login');
      throw new Error('Session expired — please log in again');
    }

    // Stale JWT pointing to a deleted user — same bounce.
    if (msg === 'User not found' && !isAuthEndpoint(path) && typeof window !== 'undefined') {
      window.location.replace('/login');
      throw new Error('Session expired — please log in again');
    }

    throw new Error(msg);
  }

  if (res.status === 204) return null as T;
  return res.json();
}
