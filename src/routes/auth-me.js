import { getSessionUser } from '../lib/auth.js';
import { safeUser, json } from '../lib/db.js';

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ authenticated: false, user: null });
  return json({ authenticated: true, user: safeUser(user) });
}
