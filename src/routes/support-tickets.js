import { requireAuth } from '../lib/auth.js';
import { rowToTicket, logAudit, json } from '../lib/db.js';

export async function onRequestGet({ request, env }) {
  const { error, user } = await requireAuth(request, env);
  if (error) return error;

  const stmt =
    user.role === 'admin'
      ? env.DB.prepare('SELECT * FROM tickets ORDER BY created_at DESC')
      : env.DB.prepare('SELECT * FROM tickets WHERE operator_id = ? ORDER BY created_at DESC').bind(user.id);

  const { results } = await stmt.all();
  return json({ tickets: results.map(rowToTicket) });
}

export async function onRequestPost({ request, env }) {
  const { error, user } = await requireAuth(request, env);
  if (error) return error;

  const { title, description, priority } = await request.json();
  if (!title || !description) {
    return json({ error: 'Title and description required' }, { status: 400 });
  }

  const newTicket = {
    id: 'tkt-' + Date.now().toString().slice(-4),
    operatorId: user.id,
    operatorUsername: user.username,
    title: title.trim(),
    description: description.trim(),
    priority: priority || 'STANDARD',
    status: 'OPEN',
    createdAt: new Date().toISOString()
  };

  await env.DB.prepare(
    `INSERT INTO tickets (id, operator_id, operator_username, title, description, priority, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      newTicket.id,
      newTicket.operatorId,
      newTicket.operatorUsername,
      newTicket.title,
      newTicket.description,
      newTicket.priority,
      newTicket.status,
      newTicket.createdAt
    )
    .run();

  await logAudit(env, 'TICKET_SUBMITTED', user.username, `Filed dispatch: ${newTicket.title} [${newTicket.priority}]`);

  return json({ success: true, ticket: newTicket });
}
