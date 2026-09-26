import { requireAdmin } from '../lib/auth.js';
import { rowToUser, safeUser, logAudit, json } from '../lib/db.js';

export async function onRequestPut({ request, env, params }) {
  const { error, user: admin } = await requireAdmin(request, env);
  if (error) return error;

  const id = params.id;
  const { status, role, clearance, password, notes } = await request.json();

  const { results } = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).all();
  const user = rowToUser(results[0]);
  if (!user) return json({ error: 'Operator not found' }, { status: 404 });

  if (user.username === 'admin' && status === 'SUSPENDED') {
    return json({ error: 'Cannot suspend Master Administrator account' }, { status: 400 });
  }

  const next = {
    status: status || user.status,
    role: role && user.username !== 'admin' ? role : user.role,
    clearance: clearance || user.clearance,
    notes: notes !== undefined ? notes : user.notes,
    password: password && password.trim() ? password.trim() : user.password
  };

  await env.DB.prepare(
    'UPDATE users SET status = ?, role = ?, clearance = ?, notes = ?, password = ? WHERE id = ?'
  )
    .bind(next.status, next.role, next.clearance, next.notes, next.password, id)
    .run();

  await logAudit(env, 'USER_UPDATED', admin.username, `Updated operator ${user.username} [Status: ${next.status}]`);

  return json({ success: true, user: safeUser({ ...user, ...next }) });
}

export async function onRequestDelete({ request, env, params }) {
  const { error, user: admin } = await requireAdmin(request, env);
  if (error) return error;

  const id = params.id;
  const { results } = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).all();
  const user = rowToUser(results[0]);
  if (!user) return json({ error: 'Operator not found' }, { status: 404 });
  if (user.username === 'admin') {
    return json({ error: 'Cannot delete Master Administrator account' }, { status: 400 });
  }

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  await logAudit(env, 'USER_DELETED', admin.username, `Deleted operator ${user.username} (ID: ${id})`);

  return json({ success: true });
}
