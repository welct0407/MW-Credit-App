import {runUrl} from '../lib/identity.mjs';
export const wakeContext = Symbol('notification-wake-context');
/** A wake is only a hint. Financial success never depends on its delivery. */
export function loadDispatchConfig(env, environment) {
  if (env.NOTIFICATION_DISPATCH_ENABLED === undefined || env.NOTIFICATION_DISPATCH_ENABLED === 'false') return null;
  const audience = runUrl(`mw-credit-app-notify-${environment}`);
  if (env.NOTIFICATION_DISPATCH_ENABLED !== 'true' || !['dev', 'prod'].includes(environment)
    || env.NOTIFICATION_DISPATCH_AUDIENCE !== audience || env.NOTIFICATION_DISPATCH_URL !== audience + '/internal/dispatch') throw Error('invalid_dispatch_configuration');
  return Object.freeze({audience, url: audience + '/internal/dispatch'});
}

/** @param {{audience:string,url:string}|null} config @param {{fetch?:typeof globalThis.fetch,log?:(record:object)=>void,now?:()=>number}} [options] */
export function createPostCommitWake(config, {fetch: request = globalThis.fetch, log = () => {}, now = Date.now} = {}) {
  /** @param {{deadline?:number,signal?:AbortSignal}} [wake] */
  return async ({deadline = now() + 15000, signal} = {}) => {
    if (!config) return;
    const until = Math.min(deadline, now() + 15000);
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
      if (response.status !== 200) throw Error('wake_unavailable');
    } catch {
      try { log({component: 'notification-wake', event: 'deferred_to_recovery'}); } catch { /* Logging cannot alter a committed result. */ }
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
}
