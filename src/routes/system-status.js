import { json } from '../lib/db.js';

const DEFAULTS = {
  Alliance: 'All operational lines nominal.',
  Vindex: 'Tunnel relay cipher active.',
  Operations: 'Atmospheric cloud online.',
  Careers: 'Recruitment portal open.',
  Chat: 'Secure line relay functional.',
  Cloud: 'Infrastructure operating at 99.98% uptime.'
};

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT * FROM system_status').all();

  if (results.length === 0) {
    const now = new Date().toISOString();
    for (const [name, message] of Object.entries(DEFAULTS)) {
      await env.DB.prepare(
        'INSERT INTO system_status (name, down, message, updated_at) VALUES (?, 0, ?, ?)'
      )
        .bind(name, message, now)
        .run();
    }
    const status = {};
    for (const [name, message] of Object.entries(DEFAULTS)) {
      status[name] = { down: false, message };
    }
    return json(status);
  }

  const status = {};
  for (const row of results) {
    status[row.name] = {
      down: !!row.down,
      message: row.message || '',
      updatedAt: row.updated_at,
      user: row.updated_by
    };
  }
  return json(status);
}
