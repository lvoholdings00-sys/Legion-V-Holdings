import { requireAdmin } from '../lib/auth.js';
import { rowToUser, logAudit, json } from '../lib/db.js';

export async function onRequestPut({ request, env, params }) {
  const { error, user: admin } = await requireAdmin(request, env);
  if (error) return error;

  const id = params.id;
  const { results } = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).all();
  const user = rowToUser(results[0]);
  if (!user) return json({ error: 'User not found' }, { status: 404 });

  await env.DB.prepare('UPDATE users SET mfa_setup = 0, mfa_secret = NULL, temp_secret = NULL WHERE id = ?')
    .bind(id)
    .run();

  await logAudit(env, 'MFA_RESET_BY_ADMIN', admin.username, `Reset MFA for ${user.username}`);

  return json({ success: true, message: `MFA reset for ${user.username}. They will be prompted to scan QR code on next login.` });
}
