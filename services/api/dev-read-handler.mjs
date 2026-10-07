/** HTTP boundary: all data requests require a freshly verified ID token. */
export function createDevReadHandler({ config, verifyPrincipal, store }) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const send = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    const origin = req.headers.origin;
    const allowedOrigin = typeof origin === 'string' && config.origins.includes(origin);
    if (origin !== undefined && !allowedOrigin) return send(403, { ok: false, code: 'origin_denied' });
    if (allowedOrigin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') {
      if (!allowedOrigin || req.headers['access-control-request-method'] !== 'GET' || (req.headers['access-control-request-headers'] || '').split(',').some(header => header.trim() && header.trim().toLowerCase() !== 'authorization')) return send(403, { ok: false, code: 'origin_denied' });
      res.setHeader('Access-Control-Allow-Methods', 'GET'); res.setHeader('Access-Control-Allow-Headers', 'Authorization');
      return send(204, undefined);
    }
    if (req.method !== 'GET') return send(405, { ok: false, code: 'method_not_allowed' });
    try {
      const url = new URL(req.url, 'http://request.invalid');
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
        if ([...url.searchParams.keys()].some(key => !['limit', 'cursor'].includes(key)) || url.searchParams.getAll('limit').length > 1 || url.searchParams.getAll('cursor').length > 1 || (rawLimit !== null && !/^\d+$/.test(rawLimit))) return send(400, { ok: false, code: 'invalid_request' });
        const options = { limit: rawLimit === null ? 25 : Number(rawLimit), cursor: url.searchParams.get('cursor') };
        if (url.pathname === '/api/collection') result = await store.listCollection(principal.email, options);
        else {
          let borrowerId;
          try { borrowerId = decodeURIComponent(url.pathname.split('/')[3]); } catch { return send(400, { ok: false, code: 'invalid_request' }); }
          result = await store.getCollectionCharges(principal.email, borrowerId, options);
        }
      }
      else if (url.pathname === '/api/borrowers') {
        const rawLimit = url.searchParams.get('limit');
        if ([...url.searchParams.keys()].some(key => !['limit', 'cursor'].includes(key)) || url.searchParams.getAll('limit').length > 1 || url.searchParams.getAll('cursor').length > 1 || (rawLimit !== null && !/^\d+$/.test(rawLimit))) return send(400, { ok: false, code: 'invalid_request' });
        result = await store.listBorrowers(principal.email, { limit: rawLimit === null ? 25 : Number(rawLimit), cursor: url.searchParams.get('cursor') });
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
