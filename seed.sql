-- DO NOT put real credentials in this file — it's tracked in git.
-- Instead:
--   1. Copy this file to seed.local.sql (already gitignored)
--   2. Generate a password hash:  node scripts/hash-password.mjs "your-real-password"
--   3. Paste the printed pbkdf2$... string in place of REPLACE_*_PASSWORD below
--   4. Run:  npx wrangler d1 execute lvo-cloud-db --remote --file=./seed.local.sql
--
-- Re-running is safe: it overwrites the row for the same username.
-- Each account will be prompted to scan a fresh MFA QR code on first login.

INSERT INTO users (id, username, password, role, clearance, status, mfa_setup, mfa_secret, notes, created_at)
VALUES (
  'usr-admin-01',
  'REPLACE_ADMIN_USERNAME',
  'REPLACE_ADMIN_PASSWORD',
  'admin',
  'LEVEL-5 (MASTER)',
  'ACTIVE',
  0,
  NULL,
  '',
  datetime('now')
)
ON CONFLICT(username) DO UPDATE SET
  password = excluded.password,
  role = excluded.role,
  status = 'ACTIVE',
  mfa_setup = 0,
  mfa_secret = NULL;

-- Optional second account — delete this block if you only need one login.
INSERT INTO users (id, username, password, role, clearance, status, mfa_setup, mfa_secret, notes, created_at)
VALUES (
  'usr-operator-01',
  'REPLACE_OPERATOR_USERNAME',
  'REPLACE_OPERATOR_PASSWORD',
  'operator',
  'LEVEL-2 (RESTRICTED)',
  'ACTIVE',
  0,
  NULL,
  '',
  datetime('now')
)
ON CONFLICT(username) DO UPDATE SET
  password = excluded.password,
  role = excluded.role,
  status = 'ACTIVE',
  mfa_setup = 0,
  mfa_secret = NULL;
