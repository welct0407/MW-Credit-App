import { randomUUID } from 'node:crypto';
import { canonicalCommand } from '../contracts/payment-command.mjs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codes = new Set(['ok','origin_denied','method_not_allowed','invalid_request','body_too_large','sign_in_required','session_invalid','access_denied','not_found','command_conflict','command_rejected','receipt_unsupported','receipt_unavailable','command_outcome_unknown','command_unavailable']);
const MAX_BODY = 524288;
function route(raw) {
  try {
    const url = new URL(raw, 'http://candidate.invalid');
    if (url.search || url.hash) return { invalid: true, operation: 'unknown' };
    if (url.pathname === '/api/payment-commands') return { operation: 'command_submit' };
    const match = /^\/api\/payment-commands\/([^/]+)$/.exec(url.pathname);
    if (match) { if (!uuid.test(match[1])) return { invalid: true, operation: 'unknown' }; return { operation: 'command_status', requestId: match[1].toLowerCase() }; }
  } catch { return { invalid: true, operation: 'unknown' }; }
  return { operation: 'unknown' };
}
function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, settled = false;
    const cleanup = () => { clearTimeout(timer); req.off('data', data);req.off('end', end);req.off('aborted', abort);req.off('error', abort); };
    const finish = (error, value) => { if(settled)return;settled=true;cleanup();error?reject(error):resolve(value); };
    const data = chunk => { const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>MAX_BODY){finish(Object.assign(new Error(),{bodyCode:'body_too_large'}));req.resume();return}chunks.push(bytes); };
    const end = () => { try { finish(null,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))); } catch { finish(new Error()); } };
    const abort = () => finish(new Error());
    const timer=setTimeout(()=>{finish(new Error());req.resume();},5000);
    req.on('data',data);req.once('end',end);req.once('aborted',abort);req.once('error',abort);
    if(req.aborted)abort();
  });
}
/** No listener or runtime auth switch. A test-owned server binds this handler to loopback only. */
export function createPaymentCommandHandler({ origins, verifyPrincipal, store, completionLogger = () => {} }) {
  if (!Array.isArray(origins) || !origins.length || new Set(origins).size !== origins.length || origins.some(origin => {
    try { const url = new URL(origin); return url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.origin !== origin; } catch { return true; }
  }) || typeof verifyPrincipal !== 'function' || !store) throw new Error('Explicit disposable loopback origins required');
  const allowedOrigins = Object.freeze([...origins]);
  return async (req, res) => {
    const reference = randomUUID(), started = performance.now(), target = route(req.url);
    const operation = req.method === 'OPTIONS' ? 'preflight' : target.operation;
    let code = 'command_unavailable';
    res.once('finish', () => { try { completionLogger({ event: 'command_request', requestId: reference, operation, method: ['GET','POST','OPTIONS'].includes(req.method) ? req.method : 'OTHER', status: res.statusCode, code, durationMs: Math.max(0, Math.round(performance.now()-started)) }); } catch { /* Logging cannot alter financial responses. */ } });
    res.setHeader('X-Request-ID', reference);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const send = (status, value) => { code = codes.has(value?.code) ? value.code : status < 400 ? 'ok' : 'command_unavailable'; res.statusCode = status; res.end(value === undefined ? undefined : JSON.stringify(value)); };
    const reject = (status, reason) => send(status, { ok: false, code: reason });
    const origin = req.headers.origin, allowed = typeof origin === 'string' && allowedOrigins.includes(origin);
    if (origin !== undefined && !allowed) return reject(403, 'origin_denied');
    if (allowed) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID'); }
    if (req.method === 'OPTIONS') {
      if (!allowed || !['GET','POST'].includes(req.headers['access-control-request-method']) || (req.headers['access-control-request-headers'] || '').split(',').some(value => value.trim() && !['authorization','content-type'].includes(value.trim().toLowerCase()))) return reject(403, 'origin_denied');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');return send(204);
    }
    if (!['GET','POST'].includes(req.method)) return reject(405, 'method_not_allowed');
    let principal;
    try { principal = await verifyPrincipal(req.headers.authorization); } catch { return reject(401, 'session_invalid'); }
    if (!principal?.ok) return reject(principal?.status === 403 ? 403 : 401, ['sign_in_required','session_invalid','access_denied'].includes(principal?.code) ? principal.code : 'session_invalid');
    if (target.invalid) return reject(400, 'invalid_request');
    if (target.operation === 'unknown') return reject(404, 'not_found');
    if ((target.operation === 'command_submit' && req.method !== 'POST') || (target.operation === 'command_status' && req.method !== 'GET')) return reject(405, 'method_not_allowed');
    let result;
    try {
      if (target.operation === 'command_submit') {
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '') || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) return reject(415, 'invalid_request');
        let command;
        try { command = canonicalCommand(await body(req)); } catch (error) { return reject(error.bodyCode === 'body_too_large' ? 413 : 400, error.bodyCode || 'invalid_request'); }
        if (req.aborted || res.destroyed) return;
        result = await store.submit(principal, command);
      } else result = await store.status(principal, target.requestId);
      const { status, ...value } = result;return send(status, value);
    } catch { return reject(503, target.operation === 'command_submit' ? 'command_outcome_unknown' : 'command_unavailable'); }
  };
}
