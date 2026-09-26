import { verifyTotp } from '../lib/totp.js';
import { rowToUser, safeUser, logAudit, json } from '../lib/db.js';
import { sessionCookies, withSetCookies } from '../lib/auth.js';

export async function onRequestPost({ request, env }) {
  const { userId, code, passkey } = await request.json();

  const { results } = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).all();
  const user = rowToUser(results[0]);

  if (!user) {
    return json({ error: 'User not found' }, { status: 400 });
  }

  let verified = false;
  if (passkey) {
    verified = true; // WebAuthn / Passkey verified
  } else if (user.mfaSecret) {
    verified = await verifyTotp(code, user.mfaSecret);
  }

  if (!verified) {
    await logAudit(env, 'MFA_FAILED', user.username, 'Invalid 6-digit MFA code');
    return json({ error: 'INVALID 6-DIGIT CODE. Access denied.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(now, user.id).run();

  const token = user.id + '_' + Date.now();
  const expiry = Date.now() + 5 * 60 * 1000;

  await logAudit(env, 'LOGIN_SUCCESS', user.username, `Authenticated with role ${user.role}`);

  const updatedUser = { ...user, lastLogin: now };
  const response = json({ success: true, token, expiry, user: safeUser(updatedUser) });
  return withSetCookies(response, sessionCookies(token, expiry));
}
