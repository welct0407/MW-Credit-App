import { randomUUID } from 'node:crypto';
const resultCodes = new Set(['origin_denied', 'method_not_allowed', 'invalid_request', 'sign_in_required', 'session_invalid', 'access_denied', 'not_found', 'read_unavailable', 'source_unavailable', 'business_date_changed']);
function operationFor(rawUrl) {
  try {
    const path = new URL(rawUrl, 'http://request.invalid').pathname;
    // Validate escaping without ever retaining or logging decoded identifiers.
    decodeURIComponent(path);
    if (path === '/health') return 'health';
    if (path === '/api/session') return 'session';
    if (path === '/api/borrowers') return 'borrowers_list';
    if (/^\/api\/borrowers\/[^/]+$/.test(path)) return 'borrower_detail';
    if (/^\/api\/borrowers\/[^/]+\/loans$/.test(path)) return 'loans_list';
    if (/^\/api\/borrowers\/[^/]+\/loans\/[^/]+$/.test(path)) return 'loan_detail';
    if (path === '/api/collection') return 'collection_list';
    if (/^\/api\/collection\/[^/]+\/charges$/.test(path)) return 'collection_charges';
    if (/^\/api\/collection\/[^/]+\/upcoming$/.test(path)) return 'upcoming_summary';
    if (/^\/api\/collection\/[^/]+\/upcoming\/[^/]+$/.test(path)) return 'upcoming_date';
  } catch { /* Malformed routes have no diagnostic path payload. */ }
  return 'unknown';
}
/** HTTP boundary: all data requests require a freshly verified ID token. */
export function createDevReadHandler({ config, verifyPrincipal, store, completionLogger = () => {} }) {
  return async (req, res) => {
    const requestId = randomUUID();
    const started = performance.now();
    let completionCode = 'unknown_error';
    let logged = false;
    const operation = req.method === 'OPTIONS' ? 'preflight' : operationFor(req.url);
    res.once?.('finish', () => {
      if (logged) return;
      logged = true;
      try { completionLogger({ event: 'read_request', requestId, operation, method: ['GET', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER', status: res.statusCode, code: completionCode, durationMs: Math.max(0, Math.round(performance.now() - started)) }); }
      catch { /* Telemetry must never alter the response or log raw errors. */ }
    });
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const send = (status, value) => { completionCode = status < 400 ? 'ok' : resultCodes.has(value?.code) ? value.code : 'unknown_error'; res.statusCode = status; res.end(JSON.stringify(value)); };
    const origin = req.headers.origin;
    const allowedOrigin = typeof origin === 'string' && config.origins.includes(origin);
    if (origin !== undefined && !allowedOrigin) return send(403, { ok: false, code: 'origin_denied' });
    if (allowedOrigin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID'); }
    if (req.method === 'OPTIONS') {
      if (!allowedOrigin || req.headers['access-control-request-method'] !== 'GET' || (req.headers['access-control-request-headers'] || '').split(',').some(header => header.trim() && header.trim().toLowerCase() !== 'authorization')) return send(403, { ok: false, code: 'origin_denied' });
      res.setHeader('Access-Control-Allow-Methods', 'GET'); res.setHeader('Access-Control-Allow-Headers', 'Authorization');
      return send(204, undefined);
    }
    if (req.method !== 'GET') return send(405, { ok: false, code: 'method_not_allowed' });
    try {
      const url = new URL(req.url, 'http://request.invalid');
      if (url.searchParams.has('q') && !['/api/borrowers', '/api/collection'].includes(url.pathname)) return send(400, { ok: false, code: 'invalid_request' });
      if (url.pathname === '/health') return send(200, { status: 'ok', environment: 'dev', service: 'borrower-read' });
      const principal = await verifyPrincipal(req.headers.authorization);
      if (!principal.ok) return send(principal.status, { ok: false, code: principal.code });
      let result;
      if (url.pathname === '/api/session') { result = await store.session(principal.email); if (result.ok) result = { ...result, subject: principal.subject }; }
      else if (/^\/api\/collection\/[^/]+\/upcoming(?:\/[^/]+)?$/.test(url.pathname)) {
        const parts = url.pathname.split('/');
        let borrowerId, dueDate;
        try { borrowerId = decodeURIComponent(parts[3]); dueDate = parts.length === 6 ? decodeURIComponent(parts[5]) : null; }
        catch { return send(400, { ok: false, code: 'invalid_request' }); }
        const allowed = dueDate ? ['businessDate', 'limit', 'cursor'] : ['businessDate'];
        const rawLimit = url.searchParams.get('limit');
        if ([...url.searchParams.keys()].some(key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1) || url.searchParams.getAll('businessDate').length !== 1 || (rawLimit !== null && !/^\d+$/.test(rawLimit))) return send(400, { ok: false, code: 'invalid_request' });
        result = await store.getCollectionUpcoming(principal.email, borrowerId, { businessDate: url.searchParams.get('businessDate'), dueDate, limit: rawLimit === null ? 25 : Number(rawLimit), cursor: url.searchParams.get('cursor') });
      }
      else if (url.pathname === '/api/collection' || /^\/api\/collection\/[^/]+\/charges$/.test(url.pathname)) {
        const rawLimit = url.searchParams.get('limit');
        if ([...url.searchParams.keys()].some(key => !['limit', 'cursor', 'q'].includes(key)) || url.searchParams.getAll('limit').length > 1 || url.searchParams.getAll('cursor').length > 1 || url.searchParams.getAll('q').length > 1 || (rawLimit !== null && !/^\d+$/.test(rawLimit))) return send(400, { ok: false, code: 'invalid_request' });
        const options = { q: url.searchParams.get('q') ?? '', limit: rawLimit === null ? 25 : Number(rawLimit), cursor: url.searchParams.get('cursor') };
        if (url.pathname === '/api/collection') result = await store.listCollection(principal.email, options);
        else {
          let borrowerId;
          try { borrowerId = decodeURIComponent(url.pathname.split('/')[3]); } catch { return send(400, { ok: false, code: 'invalid_request' }); }
          result = await store.getCollectionCharges(principal.email, borrowerId, options);
        }
      }
      else if (url.pathname === '/api/borrowers') {
        const rawLimit = url.searchParams.get('limit');
        if ([...url.searchParams.keys()].some(key => !['limit', 'cursor', 'q'].includes(key)) || url.searchParams.getAll('limit').length > 1 || url.searchParams.getAll('cursor').length > 1 || url.searchParams.getAll('q').length > 1 || (rawLimit !== null && !/^\d+$/.test(rawLimit))) return send(400, { ok: false, code: 'invalid_request' });
        result = await store.listBorrowers(principal.email, { q: url.searchParams.get('q') ?? '', limit: rawLimit === null ? 25 : Number(rawLimit), cursor: url.searchParams.get('cursor') });
      } else if (url.pathname.startsWith('/api/borrowers/')) {
        const parts = url.pathname.split('/').slice(3);
        let ids;
        try { ids = parts.map(part => decodeURIComponent(part)); } catch { return send(400, { ok: false, code: 'invalid_request' }); }
        if (ids.length === 1) result = await store.getBorrower(principal.email, ids[0]);
        else if (ids.length === 2 && parts[1] === 'loans') {
          const rawLimit = url.searchParams.get('limit');
          if ([...url.searchParams.keys()].some(key => !['limit', 'cursor'].includes(key)) || url.searchParams.getAll('limit').length > 1 || url.searchParams.getAll('cursor').length > 1 || (rawLimit !== null && !/^\d+$/.test(rawLimit))) return send(400, { ok: false, code: 'invalid_request' });
          result = await store.listLoans(principal.email, ids[0], { limit: rawLimit === null ? 25 : Number(rawLimit), cursor: url.searchParams.get('cursor') });
        } else if (ids.length === 3 && parts[1] === 'loans') {
          if (url.search) return send(400, { ok: false, code: 'invalid_request' });
          result = await store.getLoan(principal.email, ids[0], ids[2]);
        } else return send(404, { ok: false, code: 'not_found' });
      }
      else return send(404, { ok: false, code: 'not_found' });
      const { status, ...body } = result;
      return send(result.ok ? 200 : status || 503, body);
    } catch { return send(503, { ok: false, code: 'read_unavailable' }); }
  };
}
