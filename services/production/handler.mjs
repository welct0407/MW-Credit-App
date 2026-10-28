import { beginRequest } from '../lib/http-boundary.mjs';
/** Deliberately has no store/storage/command dependencies or business dispatch. */
export function createProductionFoundationHandler({ config, verifyPrincipal, completionLogger = () => {} }) {
  return async (req, res) => {
    let operation = 'denied', code = 'foundation_disabled';
    // R102-DEV-01: accepts the PWA's X-MW-Wake-Deadline in the preflight (value unused; the foundation starts no wake).
    const boundary = beginRequest(req, res, { origins: config.origins, methods: ['GET'], headers: ['Authorization', 'X-MW-Wake-Deadline'], logger: completionLogger,
      record: ({ requestId, status }) => ({ event: 'foundation_request', requestId, serviceRole: config.serviceRole, operation, status, code }) });
    const send = (status, body) => { res.statusCode = status; code = body?.code ?? 'ok'; res.end(body === undefined ? undefined : JSON.stringify(body)); };
    if (boundary.originDenied) return send(403, { ok: false, code: 'origin_denied' });
    // Exact raw targets reject query aliases, escaping, traversal and absolute-form URLs.
    if (!['/health', '/api/session'].includes(req.url)) return send(403, { ok: false, code: 'foundation_disabled' });
    operation = req.url === '/health' ? 'health' : 'session';
    if (req.method === 'OPTIONS') return boundary.preflight() ? send(204) : send(403, { ok: false, code: 'origin_denied' });
    if (req.method !== 'GET') return send(405, { ok: false, code: 'method_not_allowed' });
    if (req.url === '/health') return send(200, { status: 'ok', mode: 'foundation' });
    try {
      const principal = await verifyPrincipal(req.headers.authorization);
      if (!principal.ok) return send(principal.status === 403 ? 403 : principal.status === 503 ? 503 : 401, { ok: false, code: ['sign_in_required', 'session_invalid', 'access_denied', 'session_check_unavailable'].includes(principal.code) ? principal.code : 'session_invalid' });
      return send(200, { ok: true, authenticated: true, mode: 'foundation', capabilities: [], businessAccess: false, membershipVerified: false });
    } catch { return send(401, { ok: false, code: 'session_invalid' }); }
  };
}
