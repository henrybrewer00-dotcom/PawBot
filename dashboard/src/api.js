import { insforge } from './insforge.js'

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

export async function api(path, options = {}) {
  const { body, ...rest } = options;

  const headers = { 'Content-Type': 'application/json' };
  try {
    await insforge.auth.getCurrentUser()
    const accessToken = insforge.tokenManager?.getAccessToken?.()
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }
  } catch {
    // no session — send request without auth header
  }

  const res = await fetch(BASE + path, {
    headers,
    ...rest,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}
