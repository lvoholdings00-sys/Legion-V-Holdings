import { requireAdmin } from '../lib/auth.js';
import { rowToTicket, logAudit, json } from '../lib/db.js';

export async function onRequestPut({ request, env, params }) {
  const { error, user: admin } = await requireAdmin(request, env);
  if (error) return error;

  const id = params.id;
  const { status, priority } = await request.json();

  const { results } = await env.DB.prepare('SELECT * FROM tickets WHERE id = ?').bind(id).all();
  const existing = rowToTicket(results[0]);
  if (!existing) return json({ error: 'Ticket not found' }, { status: 404 });

  const next = { status: status || existing.status, priority: priority || existing.priority };
  await env.DB.prepare('UPDATE tickets SET status = ?, priority = ? WHERE id = ?')
    .bind(next.status, next.priority, id)
    .run();

  await logAudit(env, 'TICKET_MODIFIED', admin.username, `Modified ticket ${id} (${next.status})`);

  return json({ success: true, ticket: { ...existing, ...next } });
}

export async function onRequestDelete({ request, env, params }) {
  const { error, user: admin } = await requireAdmin(request, env);
  if (error) return error;

  const id = params.id;
  await env.DB.prepare('DELETE FROM tickets WHERE id = ?').bind(id).run();
  await logAudit(env, 'TICKET_DELETED', admin.username, `Deleted ticket ${id}`);

  return json({ success: true });
}
