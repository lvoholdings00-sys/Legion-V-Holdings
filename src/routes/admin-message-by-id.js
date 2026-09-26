import { requireAdmin } from '../lib/auth.js';
import { logAudit, json } from '../lib/db.js';

export async function onRequestDelete({ request, env, params }) {
  const { error, user: admin } = await requireAdmin(request, env);
  if (error) return error;

  const id = params.id;
  const { results } = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).all();
  const msg = results[0];
  if (!msg) return json({ error: 'Message not found' }, { status: 404 });

  await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
  await logAudit(env, 'MESSAGE_REDACTED', admin.username, `Redacted transmission from ${msg.sender_username}`);

  return json({ success: true });
}
