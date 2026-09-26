import * as authMe from './routes/auth-me.js';
import * as authLoginStep1 from './routes/auth-login-step1.js';
import * as authMfaConfirmSetup from './routes/auth-mfa-confirm-setup.js';
import * as authMfaVerify from './routes/auth-mfa-verify.js';
import * as authLogout from './routes/auth-logout.js';
import * as adminUsers from './routes/admin-users.js';
import * as adminUserById from './routes/admin-user-by-id.js';
import * as adminUserResetMfa from './routes/admin-user-reset-mfa.js';
import * as adminData from './routes/admin-data.js';
import * as adminMessageById from './routes/admin-message-by-id.js';
import * as adminTicketById from './routes/admin-ticket-by-id.js';
import * as chatMessages from './routes/chat-messages.js';
import * as supportTickets from './routes/support-tickets.js';
import * as systemStatus from './routes/system-status.js';
import * as systemStatusUpdate from './routes/system-status-update.js';

// Each entry: a URLPattern for the path, plus one handler per HTTP method it supports.
const routes = [
  { pattern: new URLPattern({ pathname: '/api/auth/me' }), GET: authMe.onRequestGet },
  { pattern: new URLPattern({ pathname: '/api/auth/login-step1' }), POST: authLoginStep1.onRequestPost },
  { pattern: new URLPattern({ pathname: '/api/auth/mfa-confirm-setup' }), POST: authMfaConfirmSetup.onRequestPost },
  { pattern: new URLPattern({ pathname: '/api/auth/mfa-verify' }), POST: authMfaVerify.onRequestPost },
  { pattern: new URLPattern({ pathname: '/api/auth/logout' }), POST: authLogout.onRequestPost },

  { pattern: new URLPattern({ pathname: '/api/admin/users' }), GET: adminUsers.onRequestGet, POST: adminUsers.onRequestPost },
  { pattern: new URLPattern({ pathname: '/api/admin/users/:id' }), PUT: adminUserById.onRequestPut, DELETE: adminUserById.onRequestDelete },
  { pattern: new URLPattern({ pathname: '/api/admin/users/:id/reset-mfa' }), PUT: adminUserResetMfa.onRequestPut },
  { pattern: new URLPattern({ pathname: '/api/admin/data' }), GET: adminData.onRequestGet },
  { pattern: new URLPattern({ pathname: '/api/admin/messages/:id' }), DELETE: adminMessageById.onRequestDelete },
  { pattern: new URLPattern({ pathname: '/api/admin/tickets/:id' }), PUT: adminTicketById.onRequestPut, DELETE: adminTicketById.onRequestDelete },

  { pattern: new URLPattern({ pathname: '/api/chat/messages' }), GET: chatMessages.onRequestGet, POST: chatMessages.onRequestPost },
  { pattern: new URLPattern({ pathname: '/api/support/tickets' }), GET: supportTickets.onRequestGet, POST: supportTickets.onRequestPost },

  { pattern: new URLPattern({ pathname: '/api/system-status' }), GET: systemStatus.onRequestGet },
  { pattern: new URLPattern({ pathname: '/api/system-status/:name' }), PUT: systemStatusUpdate.onRequestPut }
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    for (const route of routes) {
      const match = route.pattern.exec(url);
      const handler = match && route[request.method];
      if (handler) {
        try {
          return await handler({ request, env, params: match.pathname.groups });
        } catch (err) {
          console.error('Route error:', err);
          return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // Not an /api/* route we handle — let static assets serving take it
    // (in practice the assets binding already intercepts these before the
    // Worker runs; this is only reached for an unmatched /api/* path).
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
