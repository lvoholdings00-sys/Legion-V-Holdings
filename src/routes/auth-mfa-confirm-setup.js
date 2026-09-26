import { verifyTotp } from '../lib/totp.js';
import { rowToUser, safeUser, logAudit, json } from '../lib/db.js';
import { sessionCookies, withSetCookies } from '../lib/auth.js';

export async function onRequestPost({ request, env }) {
  const { userId, code } = await request.json();

  const { results } = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).all();
  const user = rowToUser(results[0]);

  if (!user || !user.tempSecret) {
    return json({ error: 'Session expired. Please log in again.' }, { status: 400 });
  }

  const valid = await verifyTotp(code, user.tempSecret);
  if (!valid) {
    await logAudit(env, 'MFA_SETUP_FAILED', user.username, 'Invalid 6-digit verification code entered');
    return json({ error: 'INVALID 6-DIGIT MFA CODE. Please check your authenticator app.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE users SET mfa_secret = ?, mfa_setup = 1, temp_secret = NULL, last_login = ? WHERE id = ?'
  )
    .bind(user.tempSecret, now, user.id)
    .run();

  const token = user.id + '_' + Date.now();
  const expiry = Date.now() + 5 * 60 * 1000;

  await logAudit(env, 'MFA_SETUP_COMPLETE', user.username, '2-Step MFA configured and activated');

  const updatedUser = { ...user, mfaSecret: user.tempSecret, mfaSetup: true, tempSecret: null, lastLogin: now };
  const response = json({ success: true, token, expiry, user: safeUser(updatedUser) });
  return withSetCookies(response, sessionCookies(token, expiry));
}
