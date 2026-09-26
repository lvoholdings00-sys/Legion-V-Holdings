import { getSessionUser, clearSessionCookies, withSetCookies } from '../lib/auth.js';
import { logAudit, json } from '../lib/db.js';

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  if (user) {
    await logAudit(env, 'LOGOUT', user.username, 'Session terminated');
  }
  const response = json({ success: true });
  return withSetCookies(response, clearSessionCookies());
}
