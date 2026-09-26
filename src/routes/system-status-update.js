import { requireAuth } from '../lib/auth.js';
import { logAudit, json } from '../lib/db.js';

export async function onRequestPut({ request, env, params }) {
  const { error, user } = await requireAuth(request, env);
  if (error) return error;

  const name = params.name;
  const { down, message } = await request.json();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO system_status (name, down, message, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET down = excluded.down, message = excluded.message,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  )
    .bind(name, down ? 1 : 0, message || '', now, user.username)
    .run();

  await logAudit(env, 'SYSTEM_STATUS_CHANGE', user.username, `Updated ${name}: ${down ? 'OFFLINE' : 'ONLINE'} - ${message || ''}`);

  return json({ success: true, status: { down: !!down, message: message || '', updatedAt: now, user: user.username } });
}
