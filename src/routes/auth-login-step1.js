import { generateSecret, generateURI } from '../lib/totp.js';
import { rowToUser, logAudit, json } from '../lib/db.js';

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();
  const clean = (username || '').toLowerCase().trim();

  const { results } = await env.DB.prepare('SELECT * FROM users WHERE lower(username) = ?').bind(clean).all();
  const user = rowToUser(results[0]);

  if (!user) {
    await logAudit(env, 'LOGIN_FAILED', username, 'Unknown operator identifier');
    return json({ error: 'INVALID OPERATOR ID: Account does not exist. Public sign-up is disabled.' }, { status: 401 });
  }

  if (user.status === 'SUSPENDED') {
    await logAudit(env, 'LOGIN_DENIED', username, 'Attempt to access suspended account');
    return json({ error: 'ACCESS SUSPENDED: Account is deactivated by Master Administrator.' }, { status: 403 });
  }

  if (user.password !== password) {
    await logAudit(env, 'LOGIN_FAILED', username, 'Incorrect security passphrase');
    return json({ error: 'ACCESS DENIED: Invalid security passphrase.' }, { status: 401 });
  }

  if (!user.mfaSetup || !user.mfaSecret) {
    const secret = generateSecret();
    await env.DB.prepare('UPDATE users SET temp_secret = ? WHERE id = ?').bind(secret, user.id).run();

    const otpUri = generateURI({ issuer: 'LVO-Cloud', label: user.username, secret });

    return json({
      status: 'MFA_SETUP_REQUIRED',
      userId: user.id,
      username: user.username,
      secret,
      otpUri
    });
  }

  return json({
    status: 'MFA_VERIFY_REQUIRED',
    userId: user.id,
    username: user.username
  });
}
