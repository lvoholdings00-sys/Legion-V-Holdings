// RFC 6238 TOTP implementation using the Web Crypto API — no npm dependency.
// Replaces otplib, which relies on Node-only crypto APIs not available in Workers.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(base32) {
  let bits = '';
  for (const char of base32.replace(/=+$/, '').toUpperCase()) {
    const val = ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

function base32Encode(bytes) {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let output = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    output += ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}

export function generateSecret(length = 20) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return base32Encode(bytes);
}

async function hmacSha1(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, msgBytes);
  return new Uint8Array(sig);
}

function counterToBytes(counter) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(4, counter >>> 0);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  return new Uint8Array(buf);
}

async function hotp(secretBytes, counter) {
  const hmac = await hmacSha1(secretBytes, counterToBytes(counter));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binCode % 1000000).toString().padStart(6, '0');
}

export async function verifyTotp(token, secret, { step = 30, window = 1 } = {}) {
  if (!token || !secret) return false;
  const clean = String(token).trim();
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(Date.now() / 1000 / step);
  const secretBytes = base32Decode(secret);
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const code = await hotp(secretBytes, counter + errorWindow);
    if (code === clean) return true;
  }
  return false;
}

export function generateURI({ issuer, label, secret }) {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedLabel = encodeURIComponent(label);
  return `otpauth://totp/${encodedIssuer}:${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}
