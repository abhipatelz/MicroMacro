'use client';

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });

  if (!res.ok) {
    // Session is invalid or user was deleted — go back to login
    if (res.status === 401 || res.status === 403) {
      if (typeof window !== 'undefined') window.location.replace('/login');
      throw new Error('Session expired — please log in again');
    }

    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.message || j.error || JSON.stringify(j);
      // Stale JWT pointing to a deleted/reset user
      if (msg === 'User not found' && typeof window !== 'undefined') {
        window.location.replace('/login');
        throw new Error('Session expired — please log in again');
      }
    } catch (inner) {
      if ((inner as Error).message === 'Session expired — please log in again') throw inner;
    }
    throw new Error(msg);
  }

  if (res.status === 204) return null as T;
  return res.json();
}
