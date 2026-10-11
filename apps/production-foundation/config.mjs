export const PROJECT = 'clever-oasis-508610-n7';
const fail = () => { throw Error('Invalid production shell configuration'); };
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === expected.sort().join(',');
export function validateShellConfig(value) {
  if (!keys(value,['schemaVersion','environment','authIsolation','phase','origin','endpoints',...(value?.phase === 'maintenance' ? [] : ['firebase'])])
    || value.schemaVersion !== 1 || value.environment !== 'prod' || value.origin !== 'https://lm.mw-credit.com') fail();
  if (value.phase === 'maintenance') {
    if (value.authIsolation !== 'none' || value.endpoints !== null) fail();
    return Object.freeze({...value});
  }
  if (!['enrollment','foundation'].includes(value.phase) || value.authIsolation !== 'shared-default'
    || !keys(value.firebase,['projectId','apiKey','appId','authDomain'])) fail();
  const f = value.firebase;
  if (f.projectId !== PROJECT || f.authDomain !== `${PROJECT}.firebaseapp.com`
    || typeof f.apiKey !== 'string' || !/^AIza[A-Za-z0-9_-]{35}$/.test(f.apiKey)
    || typeof f.appId !== 'string' || !/^1:737787224638:web:[a-f0-9]+$/.test(f.appId)) fail();
  if (value.phase === 'enrollment') { if (value.endpoints !== null) fail(); }
  else {
    if (!keys(value.endpoints,['reader','command']) || value.endpoints.reader === value.endpoints.command) fail();
    for (const endpoint of Object.values(value.endpoints)) {
      let url;try { url = new URL(endpoint); } catch { fail(); }
      if (typeof endpoint !== 'string' || url.href !== endpoint || url.protocol !== 'https:' || url.username || url.password || url.port
        || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.run\.app$/.test(url.hostname) || /(^|-)dev(-|\.)/.test(url.hostname)
        || url.pathname !== '/api/session' || url.search || url.hash) fail();
    }
  }
  return Object.freeze({...value,firebase:Object.freeze({...f}),endpoints:value.endpoints && Object.freeze({...value.endpoints})});
}
