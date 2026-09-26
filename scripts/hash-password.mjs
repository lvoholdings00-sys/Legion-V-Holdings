// Usage: node scripts/hash-password.mjs "your-real-password"
// Prints a pbkdf2$... string identical in format to what the app's
// src/lib/password.js produces (Node's webcrypto matches Workers' Web Crypto).
//
// Paste the printed hash into seed.local.sql (NOT seed.sql) in place of
// REPLACE_ADMIN_PASSWORD / REPLACE_OPERATOR_PASSWORD.

import { webcrypto as crypto } from 'node:crypto';

const ITERATIONS = 100000;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `pbkdf2$${ITERATIONS}$${toHex(saltBytes)}$${toHex(bits)}`;
}

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "your-real-password"');
  process.exit(1);
}

hashPassword(password).then(hash => {
  console.log(hash);
});
