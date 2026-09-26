// Maps D1 rows (snake_case, SQLite 0/1 booleans) to the JS-shaped objects
// the rest of the app expects (camelCase, real booleans) — keeps parity
// with the original db.json shape from the Express version.

export function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    password: row.password,
    role: row.role,
    clearance: row.clearance,
    status: row.status,
    mfaSetup: !!row.mfa_setup,
    mfaSecret: row.mfa_secret,
    tempSecret: row.temp_secret,
    notes: row.notes || '',
    createdAt: row.created_at,
    lastLogin: row.last_login
  };
}

export function safeUser(user) {
  if (!user) return null;
  const { password, mfaSecret, tempSecret, ...safe } = user;
  return safe;
}

export function rowToMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderUsername: row.sender_username,
    channel: row.channel,
    text: row.text,
    timestamp: row.timestamp
  };
}

export function rowToTicket(row) {
  return {
    id: row.id,
    operatorId: row.operator_id,
    operatorUsername: row.operator_username,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at
  };
}

export async function logAudit(env, event, username, details, ip = 'unknown') {
  await env.DB.prepare(
    'INSERT INTO audit_logs (id, timestamp, event, username, ip, details) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(
      'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      new Date().toISOString(),
      event,
      username || 'ANONYMOUS',
      ip,
      details
    )
    .run();
  // Keep the audit log bounded.
  await env.DB.prepare(
    `DELETE FROM audit_logs WHERE id NOT IN (
       SELECT id FROM audit_logs ORDER BY timestamp DESC LIMIT 200
     )`
  ).run();
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
}
