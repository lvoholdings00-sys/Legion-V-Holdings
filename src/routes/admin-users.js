import { requireAdmin } from '../lib/auth.js';
import { rowToUser, safeUser, logAudit, json } from '../lib/db.js';

export async function onRequestGet({ request, env }) {
  const { error } = await requireAdmin(request, env);
  if (error) return error;

  const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  return json({ users: results.map(r => safeUser(rowToUser(r))) });
}

export async function onRequestPost({ request, env }) {
  const { error, user: admin } = await requireAdmin(request, env);
  if (error) return error;

  const { username, password, role, clearance, notes } = await request.json();
  if (!username || !password) {
    return json({ error: 'Username and password are required' }, { status: 400 });
  }

  const clean = username.trim().toLowerCase();
  const existing = await env.DB.prepare('SELECT id FROM users WHERE lower(username) = ?').bind(clean).all();
  if (existing.results.length > 0) {
    return json({ error: 'Operator ID already provisioned in directory' }, { status: 400 });
  }

  const newUser = {
    id: 'usr-' + Date.now(),
    username: clean,
    password: password.trim(),
    role: role || 'operator',
    clearance: clearance || 'LEVEL-2 (RESTRICTED)',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    notes: notes || ''
  };

  await env.DB.prepare(
    `INSERT INTO users (id, username, password, role, clearance, status, mfa_setup, mfa_secret, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`
  )
    .bind(
      newUser.id,
      newUser.username,
      newUser.password,
      newUser.role,
      newUser.clearance,
      newUser.status,
      newUser.notes,
      newUser.createdAt
    )
    .run();

  await logAudit(env, 'USER_PROVISIONED', admin.username, `Created operator ${clean} [${newUser.role}, ${newUser.clearance}]`);

  return json({ success: true, user: safeUser(newUser) });
}
