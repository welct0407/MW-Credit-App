import {runUrl} from '../lib/identity.mjs';
export const wakeContext = Symbol('notification-wake-context');
export const WAKE_MS = 30000;
/** R107: how long a caller holds its reply for the wake before handing it off (PROD wake latency p90 1.3 s, max 2.6 s). */
export const HANDOFF_MS = 2000;
/** A wake is only a hint. Financial success never depends on its delivery. */
export function loadDispatchConfig(env, environment) {
  if (env.NOTIFICATION_DISPATCH_ENABLED === undefined || env.NOTIFICATION_DISPATCH_ENABLED === 'false') return null;
  const audience = runUrl(`mw-credit-app-notify-${environment}`);
  if (env.NOTIFICATION_DISPATCH_ENABLED !== 'true' || !['dev', 'prod'].includes(environment)
    || env.NOTIFICATION_DISPATCH_AUDIENCE !== audience || env.NOTIFICATION_DISPATCH_URL !== audience + '/internal/dispatch') throw Error('invalid_dispatch_configuration');
  return Object.freeze({audience, url: audience + '/internal/dispatch'});
}

/**
 * handoffMs: how long a caller holds its reply for the wake (default HANDOFF_MS); null or Infinity awaits the full
 * answer (the jobs worker, which already runs with request-based CPU and must not leave a wake running after its reply).
 * @param {{audience:string,url:string}|null} config @param {{fetch?:typeof globalThis.fetch,log?:(record:object)=>void,now?:()=>number,handoffMs?:number|null}} [options]
 */
export function createPostCommitWake(config, {fetch: request = globalThis.fetch, log = () => {}, now = Date.now, handoffMs = HANDOFF_MS} = {}) {
  const capped = handoffMs !== null && Number.isFinite(handoffMs);
  // The notify worker caps a producer wake at 30 s from its arrival and enqueues only with 11 s left, so a wake sent
  // with a short deadline is a no-op on a cold worker: callers give up to 30 s, and the worker's own cap governs.
  // R107: command and chat run with request-based CPU, so the wake is sent before the reply. The caller waits at most
  // HANDOFF_MS; a slower wake is left running, never aborted (notify cancels its pass when its caller hangs up), and
  // still ends at its own deadline. The race never rejects: delivery catches every failure and logs the deferral.
  /** @param {{deadline?:number,signal?:AbortSignal}} [wake] */
  return async ({deadline = now() + WAKE_MS, signal} = {}) => {
    if (!config) return;
    const delivery = deliver(deadline, signal);
    if (!capped) return delivery;
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let handoff;
    await Promise.race([delivery, new Promise(resolve => { handoff = setTimeout(resolve, Number(handoffMs)); handoff.unref?.(); })]);
    clearTimeout(handoff);
  };
  /** @param {number} deadline @param {AbortSignal|undefined} signal */
  async function deliver(deadline, signal) {
    const until = Math.min(deadline, now() + WAKE_MS);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(() => controller.abort(), Math.max(0, until - now()));
    try {
      if (signal?.aborted || until <= now()) throw Error('wake_deadline');
      const tokenResponse = await request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=' + encodeURIComponent(config.audience) + '&format=full', {
        headers: {'Metadata-Flavor': 'Google'}, signal: controller.signal, redirect: 'error'
      });
      if (!tokenResponse.ok) throw Error('identity_unavailable');
      const token = await tokenResponse.text();
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw Error('invalid_identity');
      const response = await request(config.url, {method: 'POST', headers: {Authorization: 'Bearer ' + token, 'X-MW-Wake-Deadline': String(until)}, signal: controller.signal, redirect: 'error'});
      await response.body?.cancel();
      // 202: the worker was busy and queued this wake for its running dispatch (R090 batch 2).
      if (response.status !== 200 && response.status !== 202) throw Error('wake_unavailable');
    } catch {
      try { log({component: 'notification-wake', event: 'deferred_to_recovery'}); } catch { /* Logging cannot alter a committed result. */ }
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
}
