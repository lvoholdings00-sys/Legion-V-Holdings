// PBKDF2-SHA256 password hashing using Web Crypto (works natively in
// Cloudflare Workers and in modern Node via globalThis.crypto.subtle).
// Stored format: pbkdf2$<iterations>$<saltHex>$<hashHex>

const ITERATIONS = 100000;
const HASH_BITS = 256;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function deriveHex(password, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    keyMaterial,
    HASH_BITS
  );
  return toHex(bits);
}

export async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await deriveHex(password, saltBytes, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(saltBytes)}$${hashHex}`;
}

// Returns true/false. Also treats a plain, unhashed legacy value as
// non-matching once migrated — see verifyPassword's isHashed check below
// if you need a migration path for existing plaintext rows.
export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.startsWith('pbkdf2$')) {
    return false;
  }
  const [, iterStr, saltHex, hashHex] = stored.split('$');
  const iterations = parseInt(iterStr, 10);
  if (!iterations || !saltHex || !hashHex) return false;

  const computedHex = await deriveHex(password, fromHex(saltHex), iterations);

  // Constant-time comparison.
  if (computedHex.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) {
    diff |= computedHex.charCodeAt(i) ^ hashHex.charCodeAt(i);
  }
  return diff === 0;
}

export function isHashed(value) {
  return typeof value === 'string' && value.startsWith('pbkdf2$');
}
