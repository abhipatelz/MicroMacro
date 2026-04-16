const BASE = '/api';

function getToken() {
  return localStorage.getItem('mm_token') || '';
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: getToken() ? `Bearer ${getToken()}` : '',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error || JSON.stringify(j);
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}
