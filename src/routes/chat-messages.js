import { requireAuth } from '../lib/auth.js';
import { rowToMessage, json } from '../lib/db.js';

export async function onRequestGet({ request, env }) {
  const { error } = await requireAuth(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const channel = url.searchParams.get('channel') || 'general';

  const { results } = await env.DB.prepare(
    'SELECT * FROM messages WHERE channel = ? ORDER BY timestamp ASC LIMIT 500'
  )
    .bind(channel)
    .all();

  return json({ messages: results.map(rowToMessage) });
}

export async function onRequestPost({ request, env }) {
  const { error, user } = await requireAuth(request, env);
  if (error) return error;

  const { text, channel } = await request.json();
  if (!text || !text.trim()) {
    return json({ error: 'Message text required' }, { status: 400 });
  }

  const newMsg = {
    id: 'msg-' + Date.now(),
    senderId: user.id,
    senderUsername: user.username,
    channel: channel || 'general',
    text: text.trim(),
    timestamp: new Date().toISOString()
  };

  await env.DB.prepare(
    'INSERT INTO messages (id, sender_id, sender_username, channel, text, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(newMsg.id, newMsg.senderId, newMsg.senderUsername, newMsg.channel, newMsg.text, newMsg.timestamp)
    .run();

  // Keep the channel history bounded.
  await env.DB.prepare(
    `DELETE FROM messages WHERE id IN (
       SELECT id FROM messages ORDER BY timestamp DESC LIMIT -1 OFFSET 500
     )`
  ).run();

  return json({ success: true, message: newMsg });
}
