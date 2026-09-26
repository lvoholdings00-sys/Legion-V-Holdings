import { rowToUser, json } from './db.js';

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const cookies = {};
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

export async function getSessionUser(request, env) {
  const cookies = parseCookies(request);
  const url = new URL(request.url);
  const token =
    cookies['lvo_token'] ||
    (request.headers.get('Authorization') || '').replace('Bearer ', '') ||
    url.searchParams.get('token');
  if (!token) return null;

  const userId = token.split('_')[0];
  const { results } = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).all();
  const user = rowToUser(results[0]);
  if (!user || user.status === 'SUSPENDED') return null;
  return user;
}

export function sessionCookies(token, expiry) {
  const maxAge = 5 * 60; // seconds
  return [
    `lvo_token=${token}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure; HttpOnly`,
    `lvo_expiry=${expiry}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`
  ];
}

export function clearSessionCookies() {
  return [
    'lvo_token=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly',
    'lvo_expiry=; Path=/; Max-Age=0; SameSite=Lax; Secure'
  ];
}

export function withSetCookies(response, cookieStrings) {
  const headers = new Headers(response.headers);
  for (const c of cookieStrings) headers.append('Set-Cookie', c);
  return new Response(response.body, { status: response.status, headers });
}

export async function requireAuth(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) {
    return { error: json({ error: 'UNAUTHORIZED: Valid session required' }, { status: 401 }) };
  }
  return { user };
}

export async function requireAdmin(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) {
    return { error: json({ error: 'UNAUTHORIZED: Valid session required' }, { status: 401 }) };
  }
  if (user.role !== 'admin') {
    return { error: json({ error: 'FORBIDDEN: Administrative clearance required' }, { status: 403 }) };
  }
  return { user };
}
