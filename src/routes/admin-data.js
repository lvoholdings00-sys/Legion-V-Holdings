import { requireAdmin } from '../lib/auth.js';
import { rowToMessage, rowToTicket, json } from '../lib/db.js';

export async function onRequestGet({ request, env }) {
  const { error } = await requireAdmin(request, env);
  if (error) return error;

  const [totalUsers, activeUsers, messages, tickets, auditLogs] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM users').all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'ACTIVE'").all(),
    env.DB.prepare('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 500').all(),
    env.DB.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all(),
    env.DB.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200').all()
  ]);

  return json({
    totalUsers: totalUsers.results[0].n,
    activeUsers: activeUsers.results[0].n,
    messages: messages.results.map(rowToMessage),
    tickets: tickets.results.map(rowToTicket),
    auditLogs: auditLogs.results
  });
}
