import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import ipaddr from 'ipaddr.js';

export class SafeError extends Error {
  constructor(readonly reason: string, readonly status = 400) { super(reason); }
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x,y);
}
export function verifyGrafana(body: Buffer, timestamp: string, signature: string, secrets: string[], now = Date.now()) {
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now/1000 - Number(timestamp)) > 300) throw new SafeError('invalid_grafana_timestamp',401);
  if (!/^[a-f0-9]{64}$/i.test(signature)) throw new SafeError('invalid_grafana_signature',401);
  const signed = Buffer.concat([Buffer.from(timestamp+':'), body]);
  if (!secrets.some(secret => equal(createHmac('sha256', secret).update(signed).digest('hex'),signature.toLowerCase()))) throw new SafeError('invalid_grafana_signature',401);
}
export function callbackUrl(value: string, hosts: string[]) {
  let url: URL;
  try { url = new URL(value); } catch { throw new SafeError('invalid_callback_url'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || !hosts.includes(url.hostname)) throw new SafeError('callback_not_allowed');
  return url;
}
export function publicAddress(address: string) {
  try {
    const ip = ipaddr.parse(address);
    // Reject IPv4-mapped IPv6 and every special-use range, including transition ranges.
    return ip.range() === 'unicast';
  } catch { return false; }
}
export interface CallbackResponse { status: number; body: string }
export type CallbackTransport = (url: string, body: string, headers: Record<string,string>) => Promise<CallbackResponse>;
export type Resolver = (host: string) => Promise<{address: string; family: number}[]>;
export type PinnedSender = (url: URL, address: {address: string; family: number}, body: string, headers: Record<string,string>, signal?:AbortSignal) => Promise<CallbackResponse>;

export const httpsPinned: PinnedSender = (url, destination, body, headers, signal=AbortSignal.timeout(10_000)) => new Promise((resolve,reject) => {
  const req = request(url, {
    method:'POST', headers:{...headers,'Content-Length':Buffer.byteLength(body)},
    // A fresh connection prevents a pooled socket bypassing this attempt's DNS check.
    agent:false, servername:url.hostname, rejectUnauthorized:true,signal,
    family:destination.family,
    lookup: (_hostname, _options, cb) => cb(null, destination.address, destination.family),
  }, response => {
    const chunks: Buffer[] = []; let size = 0;
    response.on('data', chunk => {
      size += chunk.length;
      if (size > 8192) { response.destroy(new SafeError('callback_response_too_large')); return; }
      chunks.push(chunk);
    });
    response.on('error', () => reject(new SafeError('callback_network_error')));
    response.on('end', () => resolve({status:response.statusCode ?? 0,body:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('error', () => reject(new SafeError('callback_network_error')));
  req.end(body);
});
export function safeCallback(hosts: string[], resolve: Resolver = host => lookup(host,{all:true,verbatim:true}), send: PinnedSender = httpsPinned): CallbackTransport {
  return async (value, body, headers) => {
    const url = callbackUrl(value,hosts);
    const signal=AbortSignal.timeout(10_000);
    const aborted=new Promise<never>((_,reject)=>signal.addEventListener('abort',()=>reject(new SafeError('callback_timeout')),{once:true}));
    let addresses;
    try { addresses = await Promise.race([resolve(url.hostname),aborted]); } catch { throw new SafeError('callback_dns_error'); }
    if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new SafeError('callback_nonpublic_address');
    signal.throwIfAborted();
    const response = await Promise.race([send(url,addresses[0]!,body,headers,signal),aborted]);
    if (response.status >= 300 && response.status < 400) throw new SafeError('callback_redirect_blocked');
    return response;
  };
}
/** Never include exceptions, URLs, request bodies, tokens or headers in logs. */
export function logEvent(event: string, fields: Record<string,string|number|boolean> = {}) {
  const allowed = ['count','status','attempt','duration_ms'];
  const clean = Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.includes(key)));
  process.stdout.write(JSON.stringify({event,...clean})+'\n');
}
