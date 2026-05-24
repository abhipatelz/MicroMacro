'use client';

/**
 * Thin wrapper around fetch() used by every client component.
 *
 * Behaviour for non-OK responses:
 *
 * - 401 (Unauthenticated) on a non-auth route → the session is missing or
 *   expired; bounce to /login. Correct reflex for a tab left open overnight.
 *
 * - 403 (Forbidden) → the user IS authenticated but lacks permission for
 *   this action (e.g. a contributor hitting a lead-only route). We do NOT
 *   redirect — that would look like a spurious logout. The error bubbles
 *   to the caller to render inline.
 *
 * - 401 / 403 on the auth endpoints themselves (/auth/login, …) never
 *   redirect: the caller is trying to authenticate, so a wrong-password
 *   401 should render below the form, not reload the page.
 *
 * - All other non-OK responses throw an Error with the server's message;
 *   callers display it via setErr() or a toast.
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

    // Unauthenticated → session bounce. ONLY 401 (not 403): a 403 means
    // the user is signed in but not permitted, and redirecting them to
    // /login would masquerade as a logout. 403 falls through to throw.
    if (res.status === 401 && !isAuthEndpoint(path) && typeof window !== 'undefined') {
      window.location.replace('/login');
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
