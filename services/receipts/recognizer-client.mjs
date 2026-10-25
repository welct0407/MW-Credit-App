import { createHash } from 'node:crypto';
// R075 client for the integration agent's receipt recognizer (POST /v1/receipt-recognition over the
// VPC). Authenticates with a Google ID token for exactly the configured URL, sends the archived,
// hash-verified receipt bytes with their SHA-256, and shape-validates the reply. Every failure is an
// "unavailable" outcome: recognition is optional and the receiving form continues manually.

const METADATA_IDENTITY = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
const RESULT_KEYS = ['account_numbers', 'amount', 'currency', 'date', 'is_payment_receipt', 'reference', 'time', 'transfer_successful'];
// R087: the recognizer returns every printed number as account_numbers. An agent still on the pre-R086
// key sends recipient_numbers; exactly one of the two is accepted. This fallback is removed in a later release.
const LEGACY_RESULT_KEYS = RESULT_KEYS.map(key => key === 'account_numbers' ? 'recipient_numbers' : key).sort();
// R095: the recognizer adds payer_name (the slip sender name as printed). During the rolling deploy a result
// without it is still accepted and read as an unreadable name (''); this fallback is removed in a later release.
const PAYER_RESULT_KEYS = [...RESULT_KEYS, 'payer_name'].sort();
const RESPONSE_KEYS = ['durationMs', 'imageSha256', 'model', 'provider', 'result', 'status'];
const MAX_RESPONSE = 65536;
/**
 * R077 timing chain: the agent recognizer gives up at 42 s, this route waits for it up to 45 s, and the
 * PWA waits up to 60 s (apps/pwa/src/recognition-timing.ts). The command service's Cloud Run request
 * timeout must exceed this upstream limit plus auth, receipt read and the rules transaction.
 */
export const RECOGNITION_UPSTREAM_TIMEOUT_MS = 45000;
const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keysAre = (value, keys) => plainObject(value) && Object.keys(value).sort().join(',') === keys.join(',');
const boundedText = (value, max) => typeof value === 'string' && value.length <= max && value.isWellFormed();

/** Exact recognizer reply shape; returns {provider,model,result} or null. */
export function validRecognition(body, imageSha256) {
  if (!keysAre(body, RESPONSE_KEYS) || body.status !== 'recognized' || body.imageSha256 !== imageSha256) return null;
  if (typeof body.provider !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(body.provider)) return null;
  if (typeof body.model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._@/:-]{0,127}$/.test(body.model)) return null;
  if (!Number.isSafeInteger(body.durationMs) || body.durationMs < 0) return null;
  const r = body.result;
  const legacy = keysAre(r, LEGACY_RESULT_KEYS), payer = keysAre(r, PAYER_RESULT_KEYS);
  if (!(legacy || payer || keysAre(r, RESULT_KEYS)) || typeof r.is_payment_receipt !== 'boolean' || typeof r.transfer_successful !== 'boolean') return null;
  if (['date', 'time', 'amount', 'currency', 'reference', ...(payer ? ['payer_name'] : [])].some(key => !boundedText(r[key], 256))) return null;
  const { recipient_numbers: legacyNumbers, account_numbers: currentNumbers, payer_name: payerName = '', ...fields } = r;
  const numbers = legacy ? legacyNumbers : currentNumbers;
  if (!Array.isArray(numbers) || numbers.length > 20 || numbers.some(n => !boundedText(n, 64))) return null;
  return Object.freeze({ provider: body.provider, model: body.model, result: Object.freeze({ ...fields, account_numbers: Object.freeze([...numbers]), payer_name: payerName }) });
}

/** Full endpoint http://<private IPv4>:8790/v1/receipt-recognition, or null when it is anything else. */
export function recognizerUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(url.hostname)?.slice(1).map(Number);
  const privateAddress = octets?.every(n => n <= 255) && (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
  if (url.protocol !== 'http:' || !privateAddress || url.port !== '8790' || url.pathname !== '/v1/receipt-recognition' || url.search || url.hash || url.username || url.password || url.href !== value) return null;
  return url.href;
}

/**
 * @param {{url:string,fetch?:typeof fetch,timeoutMs?:number,mintToken?:(audience:string,signal:AbortSignal)=>Promise<string>}} options
 */
export function createRecognizerClient({ url, fetch: fetchImpl = globalThis.fetch, timeoutMs = RECOGNITION_UPSTREAM_TIMEOUT_MS, mintToken }) {
  const endpoint = recognizerUrl(url);
  if (!endpoint || typeof fetchImpl !== 'function') throw Error('Invalid receipt recognizer configuration');
  const token = mintToken ?? (async (audience, signal) => {
    const response = await fetchImpl(`${METADATA_IDENTITY}?audience=${encodeURIComponent(audience)}&format=full`, { headers: { 'Metadata-Flavor': 'Google' }, redirect: 'error', signal });
    const text = response.ok ? await response.text() : '';
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text) || text.length > 8192) throw Error('identity_unavailable');
    return text;
  });
  return Object.freeze({
    /** @param {{bytes:Buffer,mimeType:string}} input */
    async recognize({ bytes, mimeType }) {
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5242880 || !['image/png', 'image/jpeg'].includes(mimeType)) return { status: 'unavailable', reason: 'invalid_image' };
      const imageSha256 = createHash('sha256').update(bytes).digest('hex');
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const bearer = await token(endpoint, signal);
        const response = await fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal, body: bytes,
          headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': mimeType, 'X-Content-SHA256': imageSha256 } });
        if (response.status !== 200) {
          try { await response.body?.cancel(); } catch { /* The status alone decides the outcome. */ }
          return { status: 'unavailable', reason: response.status === 503 ? 'recognizer_unavailable' : 'recognizer_refused' };
        }
        const text = await response.text();
        if (text.length > MAX_RESPONSE) return { status: 'unavailable', reason: 'invalid_response' };
        let body;
        try { body = JSON.parse(text); } catch { return { status: 'unavailable', reason: 'invalid_response' }; }
        const valid = validRecognition(body, imageSha256);
        return valid ? { status: 'recognized', ...valid } : { status: 'unavailable', reason: 'invalid_response' };
      } catch {
        return { status: 'unavailable', reason: signal.aborted ? 'timeout' : 'recognizer_unreachable' };
      }
    },
  });
}
