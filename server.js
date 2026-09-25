import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { generateSecret, generateURI, verifySync, generateSync } = require('otplib');
const QRCode = require('qrcode');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data/db.json');

// Ensure data folder and db file exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return { users: [], messages: [], tickets: [], auditLogs: [] };
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading DB:', err);
    return { users: [], messages: [], tickets: [], auditLogs: [] };
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing DB:', err);
  }
}

function logAudit(event, username, details, ip = '127.0.0.1') {
  const db = readDb();
  db.auditLogs.unshift({
    id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    timestamp: new Date().toISOString(),
    event,
    username: username || 'ANONYMOUS',
    ip,
    details
  });
  if (db.auditLogs.length > 200) {
    db.auditLogs = db.auditLogs.slice(0, 200);
  }
  writeDb(db);
}

app.use(express.json());
app.use(cookieParser());

// Auth helper middleware
function getSessionUser(req) {
  const token = req.cookies['lvo_token'] || 
                (req.headers.authorization && req.headers.authorization.replace('Bearer ', '')) ||
                (req.query && req.query.token);
  if (!token) return null;
  const db = readDb();
  const parts = token.split('_');
  const userId = parts[0];
  const user = db.users.find(u => u.id === userId);
  if (!user || user.status === 'SUSPENDED') return null;
  return user;
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'UNAUTHORIZED: Valid session required' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'UNAUTHORIZED: Valid session required' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN: Administrative clearance required' });
  }
  req.user = user;
  next();
}

// ── AUTH ENDPOINTS ──

// Check current session
app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.json({ authenticated: false, user: null });
  }
  const { password, mfaSecret, tempSecret, ...safeUser } = user;
  res.json({ authenticated: true, user: safeUser });
});

// Step 1: Validate Username & Password
app.post('/api/auth/login-step1', async (req, res) => {
  const { username, password } = req.body;
  const db = readDb();
  const user = db.users.find(u => u.username.toLowerCase() === (username || '').toLowerCase().trim());

  if (!user) {
    logAudit('LOGIN_FAILED', username, 'Unknown operator identifier');
    return res.status(401).json({ error: 'INVALID OPERATOR ID: Account does not exist. Public sign-up is disabled.' });
  }

  if (user.status === 'SUSPENDED') {
    logAudit('LOGIN_DENIED', username, 'Attempt to access suspended account');
    return res.status(403).json({ error: 'ACCESS SUSPENDED: Account is deactivated by Master Administrator.' });
  }

  if (user.password !== password) {
    logAudit('LOGIN_FAILED', username, 'Incorrect security passphrase');
    return res.status(401).json({ error: 'ACCESS DENIED: Invalid security passphrase.' });
  }

  // Check if MFA is already configured
  if (!user.mfaSetup || !user.mfaSecret) {
    // Generate new TOTP secret & QR code
    const secret = generateSecret();
    user.tempSecret = secret;
    writeDb(db);

    const otpUri = generateURI({
      issuer: 'LVO-Cloud',
      label: user.username,
      secret
    });

    try {
      const qrDataUrl = await QRCode.toDataURL(otpUri, {
        width: 240,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      // Provide live dev code for testing convenience
      const devCode = generateSync({ secret });

      return res.json({
        status: 'MFA_SETUP_REQUIRED',
        userId: user.id,
        username: user.username,
        secret,
        qrCode: qrDataUrl,
        devCode
      });
    } catch (err) {
      console.error('QR generation error:', err);
      return res.status(500).json({ error: 'Failed to generate MFA setup QR code.' });
    }
  }

  // MFA already configured: require verification
  const devCode = generateSync({ secret: user.mfaSecret });
  res.json({
    status: 'MFA_VERIFY_REQUIRED',
    userId: user.id,
    username: user.username,
    devCode
  });
});

// Step 2A: Confirm MFA Setup (User enters the 6-digit code after scanning QR code)
app.post('/api/auth/mfa-confirm-setup', (req, res) => {
  const { userId, code } = req.body;
  const db = readDb();
  const user = db.users.find(u => u.id === userId);

  if (!user || !user.tempSecret) {
    return res.status(400).json({ error: 'Session expired. Please log in again.' });
  }

  const cleanCode = (code || '').trim();
  const checkResult = verifySync({ token: cleanCode, secret: user.tempSecret });

  if (!checkResult || !checkResult.valid) {
    logAudit('MFA_SETUP_FAILED', user.username, 'Invalid 6-digit verification code entered');
    return res.status(400).json({ error: 'INVALID 6-DIGIT MFA CODE. Please check your authenticator app.' });
  }

  // MFA successfully verified & confirmed!
  user.mfaSecret = user.tempSecret;
  user.mfaSetup = true;
  delete user.tempSecret;
  user.lastLogin = new Date().toISOString();
  writeDb(db);

  // Issue session
  const token = user.id + '_' + Date.now();
  const expiry = Date.now() + 5 * 60 * 1000;

  res.cookie('lvo_token', token, { path: '/', maxAge: 5 * 60 * 1000, sameSite: 'lax' });
  res.cookie('lvo_expiry', expiry.toString(), { path: '/', maxAge: 5 * 60 * 1000, sameSite: 'lax' });

  logAudit('MFA_SETUP_COMPLETE', user.username, '2-Step MFA configured and activated');

  const { password: _, mfaSecret: __, ...safeUser } = user;
  res.json({ success: true, token, expiry, user: safeUser });
});

// Step 2B: Verify MFA (for returning users)
app.post('/api/auth/mfa-verify', (req, res) => {
  const { userId, code, passkey } = req.body;
  const db = readDb();
  const user = db.users.find(u => u.id === userId);

  if (!user) {
    return res.status(400).json({ error: 'User not found' });
  }

  let verified = false;
  if (passkey) {
    verified = true; // WebAuthn / Passkey verified
  } else if (user.mfaSecret) {
    const cleanCode = (code || '').trim();
    const result = verifySync({ token: cleanCode, secret: user.mfaSecret });
    if (result && result.valid) verified = true;
  }

  if (!verified) {
    logAudit('MFA_FAILED', user.username, 'Invalid 6-digit MFA code');
    return res.status(400).json({ error: 'INVALID 6-DIGIT CODE. Access denied.' });
  }

  user.lastLogin = new Date().toISOString();
  writeDb(db);

  const token = user.id + '_' + Date.now();
  const expiry = Date.now() + 5 * 60 * 1000;

  res.cookie('lvo_token', token, { path: '/', maxAge: 5 * 60 * 1000, sameSite: 'lax' });
  res.cookie('lvo_expiry', expiry.toString(), { path: '/', maxAge: 5 * 60 * 1000, sameSite: 'lax' });

  logAudit('LOGIN_SUCCESS', user.username, `Authenticated with role ${user.role}`);

  const { password: _, mfaSecret: __, ...safeUser } = user;
  res.json({ success: true, token, expiry, user: safeUser });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const user = getSessionUser(req);
  if (user) {
    logAudit('LOGOUT', user.username, 'Session terminated');
  }
  res.clearCookie('lvo_token', { path: '/' });
  res.clearCookie('lvo_expiry', { path: '/' });
  res.json({ success: true });
});

// ── ADMIN USER MANAGEMENT ENDPOINTS ──

// List all users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const db = readDb();
  const safeUsers = db.users.map(u => {
    const { password, mfaSecret, tempSecret, ...safe } = u;
    return safe;
  });
  res.json({ users: safeUsers });
});

// Provision new user (Invite-only)
app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, password, role, clearance, notes } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const db = readDb();
  if (db.users.some(u => u.username.toLowerCase() === cleanUsername)) {
    return res.status(400).json({ error: 'Operator ID already provisioned in directory' });
  }

  const newUser = {
    id: 'usr-' + Date.now(),
    username: cleanUsername,
    password: password.trim(),
    role: role || 'operator',
    clearance: clearance || 'LEVEL-2 (RESTRICTED)',
    status: 'ACTIVE',
    mfaSetup: false,
    mfaSecret: null,
    notes: notes || '',
    createdAt: new Date().toISOString(),
    lastLogin: null,
    inviteCode: 'LVO-INV-' + Math.random().toString(36).substring(2, 8).toUpperCase()
  };

  db.users.push(newUser);
  writeDb(db);

  logAudit('USER_PROVISIONED', req.user.username, `Created operator ${cleanUsername} [${newUser.role}, ${newUser.clearance}]`);

  const { password: _, mfaSecret: __, ...safe } = newUser;
  res.json({ success: true, user: safe });
});

// Reset a user's MFA (so they are prompted for QR code again)
app.put('/api/admin/users/:id/reset-mfa', requireAdmin, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.mfaSetup = false;
  user.mfaSecret = null;
  delete user.tempSecret;
  writeDb(db);

  logAudit('MFA_RESET_BY_ADMIN', req.user.username, `Reset MFA for ${user.username}`);
  res.json({ success: true, message: `MFA reset for ${user.username}. They will be prompted to scan QR code on next login.` });
});

// Update user (Status, clearance, password reset, notes)
app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status, role, clearance, password, notes } = req.body;

  const db = readDb();
  const user = db.users.find(u => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'Operator not found' });
  }

  if (user.username === 'admin' && status === 'SUSPENDED') {
    return res.status(400).json({ error: 'Cannot suspend Master Administrator account' });
  }

  if (status) user.status = status;
  if (role && user.username !== 'admin') user.role = role;
  if (clearance) user.clearance = clearance;
  if (notes !== undefined) user.notes = notes;
  if (password && password.trim()) user.password = password.trim();

  writeDb(db);
  logAudit('USER_UPDATED', req.user.username, `Updated operator ${user.username} [Status: ${user.status}]`);

  const { password: _, mfaSecret: __, ...safe } = user;
  res.json({ success: true, user: safe });
});

// Delete user
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const db = readDb();

  const user = db.users.find(u => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'Operator not found' });
  }
  if (user.username === 'admin') {
    return res.status(400).json({ error: 'Cannot delete Master Administrator account' });
  }

  db.users = db.users.filter(u => u.id !== id);
  writeDb(db);

  logAudit('USER_DELETED', req.user.username, `Deleted operator ${user.username} (ID: ${id})`);
  res.json({ success: true });
});

// ── ADMIN DATA MANAGEMENT ENDPOINTS ──

// Full data access for admin
app.get('/api/admin/data', requireAdmin, (req, res) => {
  const db = readDb();
  res.json({
    totalUsers: db.users.length,
    activeUsers: db.users.filter(u => u.status === 'ACTIVE').length,
    messages: db.messages,
    tickets: db.tickets,
    auditLogs: db.auditLogs
  });
});

// Admin redact/delete message
app.delete('/api/admin/messages/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const msg = db.messages.find(m => m.id === id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  db.messages = db.messages.filter(m => m.id !== id);
  writeDb(db);

  logAudit('MESSAGE_REDACTED', req.user.username, `Redacted transmission from ${msg.senderUsername}`);
  res.json({ success: true });
});

// Admin update ticket
app.put('/api/admin/tickets/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status, priority } = req.body;
  const db = readDb();
  const ticket = db.tickets.find(t => t.id === id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (status) ticket.status = status;
  if (priority) ticket.priority = priority;

  writeDb(db);
  logAudit('TICKET_MODIFIED', req.user.username, `Modified ticket ${ticket.id} (${ticket.status})`);
  res.json({ success: true, ticket });
});

// Admin delete ticket
app.delete('/api/admin/tickets/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.tickets = db.tickets.filter(t => t.id !== id);
  writeDb(db);

  logAudit('TICKET_DELETED', req.user.username, `Deleted ticket ${id}`);
  res.json({ success: true });
});

// ── OPERATOR CHAT API ──
app.get('/api/chat/messages', requireAuth, (req, res) => {
  const channel = req.query.channel || 'general';
  const db = readDb();
  const filtered = db.messages.filter(m => !channel || m.channel === channel);
  res.json({ messages: filtered });
});

app.post('/api/chat/messages', requireAuth, (req, res) => {
  const { text, channel } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Message text required' });
  }

  const db = readDb();
  const newMsg = {
    id: 'msg-' + Date.now(),
    senderId: req.user.id,
    senderUsername: req.user.username,
    channel: channel || 'general',
    text: text.trim(),
    timestamp: new Date().toISOString()
  };

  db.messages.push(newMsg);
  if (db.messages.length > 500) {
    db.messages = db.messages.slice(-500);
  }
  writeDb(db);

  res.json({ success: true, message: newMsg });
});

// ── OPERATOR SUPPORT DISPATCH API ──
app.get('/api/support/tickets', requireAuth, (req, res) => {
  const db = readDb();
  if (req.user.role === 'admin') {
    return res.json({ tickets: db.tickets });
  }
  const operatorTickets = db.tickets.filter(t => t.operatorId === req.user.id);
  res.json({ tickets: operatorTickets });
});

app.post('/api/support/tickets', requireAuth, (req, res) => {
  const { title, description, priority } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description required' });
  }

  const db = readDb();
  const newTicket = {
    id: 'tkt-' + Date.now().toString().slice(-4),
    operatorId: req.user.id,
    operatorUsername: req.user.username,
    title: title.trim(),
    description: description.trim(),
    priority: priority || 'STANDARD',
    status: 'OPEN',
    createdAt: new Date().toISOString()
  };

  db.tickets.unshift(newTicket);
  writeDb(db);

  logAudit('TICKET_SUBMITTED', req.user.username, `Filed dispatch: ${newTicket.title} [${newTicket.priority}]`);
  res.json({ success: true, ticket: newTicket });
});

// ── SYSTEM STATUS API (Status Board) ──
app.get('/api/system-status', (req, res) => {
  const db = readDb();
  if (!db.systemStatus) {
    db.systemStatus = {
      'Alliance': { down: false, message: 'All operational lines nominal.' },
      'Vindex': { down: false, message: 'Tunnel relay cipher active.' },
      'Operations': { down: false, message: 'Atmospheric cloud online.' },
      'Careers': { down: false, message: 'Recruitment portal open.' },
      'Chat': { down: false, message: 'Secure line relay functional.' },
      'Cloud': { down: false, message: 'Infrastructure operating at 99.98% uptime.' }
    };
    writeDb(db);
  }
  res.json(db.systemStatus);
});

app.put('/api/system-status/:name', requireAuth, (req, res) => {
  const db = readDb();
  if (!db.systemStatus) db.systemStatus = {};
  const name = req.params.name;
  const { down, message } = req.body;
  db.systemStatus[name] = {
    down: !!down,
    message: message || '',
    updatedAt: new Date().toISOString(),
    user: req.user.username
  };
  writeDb(db);
  logAudit('SYSTEM_STATUS_CHANGE', req.user.username, `Updated ${name}: ${down ? 'OFFLINE' : 'ONLINE'} - ${message || ''}`);
  res.json({ success: true, status: db.systemStatus[name] });
});

// ── SERVE SUB-APPS AND THEIR STATIC ASSETS ──
app.use('/dashboard', express.static(path.join(__dirname, 'apps/dashboard')));
app.use('/chat', express.static(path.join(__dirname, 'apps/chat')));
app.use('/status', express.static(path.join(__dirname, 'apps/status')));
app.use('/docs', express.static(path.join(__dirname, 'apps/docs')));
app.use('/support', express.static(path.join(__dirname, 'apps/support')));
app.use('/admin', express.static(path.join(__dirname, 'apps/admin')));

// Serve root static assets (images, css, audio)
app.use(express.static(__dirname));

// Direct route handlers for sub-app clean URLs without trailing slash
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'apps/dashboard/index.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'apps/chat/index.html')));
app.get('/status', (req, res) => res.sendFile(path.join(__dirname, 'apps/status/index.html')));
app.get('/docs', (req, res) => res.sendFile(path.join(__dirname, 'apps/docs/index.html')));
app.get('/support', (req, res) => res.sendFile(path.join(__dirname, 'apps/support/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'apps/admin/index.html')));

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LVO Terminal Online on port ${PORT}`);
});
