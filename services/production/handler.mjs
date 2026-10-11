import { randomUUID } from 'node:crypto';
/** Deliberately has no store/storage/command dependencies or business dispatch. */
export function createProductionFoundationHandler({ config, verifyPrincipal, completionLogger = () => {} }) {
  return async (req, res) => {
    const requestId = randomUUID();
    let operation = 'denied', code = 'foundation_disabled';
    res.once('finish', () => { try { completionLogger({ event: 'foundation_request', requestId, serviceRole: config.serviceRole, operation, status: res.statusCode, code }); } catch {} });
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const send = (status, body) => { res.statusCode = status; code = body?.code ?? 'ok'; res.end(body === undefined ? undefined : JSON.stringify(body)); };
    const origin = req.headers.origin;
    if (origin !== undefined && (typeof origin !== 'string' || !config.origins.includes(origin))) return send(403, { ok: false, code: 'origin_denied' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID'); }
    // Exact raw targets reject query aliases, escaping, traversal and absolute-form URLs.
    if (!['/health', '/api/session'].includes(req.url)) return send(403, { ok: false, code: 'foundation_disabled' });
    operation = req.url === '/health' ? 'health' : 'session';
    if (req.method === 'OPTIONS') {
      if (!origin || req.headers['access-control-request-method'] !== 'GET'
        || (req.headers['access-control-request-headers'] ?? '').split(',').some(h => h.trim() && h.trim().toLowerCase() !== 'authorization')) return send(403, { ok: false, code: 'origin_denied' });
      res.setHeader('Access-Control-Allow-Methods', 'GET'); res.setHeader('Access-Control-Allow-Headers', 'Authorization');
      return send(204);
    }
    if (req.method !== 'GET') return send(405, { ok: false, code: 'method_not_allowed' });
    if (req.url === '/health') return send(200, { status: 'ok', mode: 'foundation' });
    try {
      const principal = await verifyPrincipal(req.headers.authorization);
      if (!principal.ok) return send(principal.status === 403 ? 403 : 401, { ok: false, code: ['sign_in_required', 'session_invalid', 'access_denied'].includes(principal.code) ? principal.code : 'session_invalid' });
      return send(200, { ok: true, authenticated: true, mode: 'foundation', capabilities: [], businessAccess: false, membershipVerified: false });
    } catch { return send(401, { ok: false, code: 'session_invalid' }); }
  };
}
