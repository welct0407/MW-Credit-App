import { isIP } from 'node:net';

/** Conservative observation filter, not callback authority or DNS validation. */
export function diagnosticHostname(value:unknown):string|undefined {
  if(typeof value!=='string' || value.length>2048 || /[\s\\\u0000-\u001f\u007f]/.test(value))return;
  // Require a literal DNS authority. Do not normalize encoded hosts/userinfo.
  const authority=/^https:\/\/([A-Za-z0-9.-]+)(?::443)?(?:[/?]|$)/.exec(value)?.[1];
  if(!authority)return;
  let url:URL;try {url=new URL(value);} catch {return;}
  const hostname=authority.toLowerCase();
  if(url.protocol!=='https:' || url.username || url.password || url.hash || url.port || url.hostname!==hostname || hostname.length>253 || isIP(hostname))return;
  const labels=hostname.split('.');
  if(labels.length<2 || !/^[a-z]{2,24}$/.test(labels.at(-1)!))return;
  for(const label of labels) {
    if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))return;
    // Skip opaque/credential-like labels rather than risk recording a token.
    if(label.startsWith('xn--') || /(?:^|-)(?:secret|token|password|bearer|credential|whsec|apikey|api-key)(?:-|$)/.test(label) ||
       /^(?:ya29|ghp|gho|github-pat|sk-|eyj)/.test(label) ||
       label.split('-').some(part=>/^[a-z0-9]{24,}$/.test(part) || /^[a-f0-9]{16,}$/.test(part) || /^\d{12,}$/.test(part)) ||
       /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(label))return;
  }
  return hostname;
}

function exactSyntheticFilters(value:unknown):boolean {
  if(!value || typeof value!=='object' || Array.isArray(value))return false;
  const filters=value as Record<string,unknown>;
  if(Object.keys(filters).length!==2)return false;
  const names=filters.alert_names,statuses=filters.statuses;
  return Array.isArray(names) && names.length===1 && names[0]==='MW Grafana Bridge Synthetic Test' &&
    Array.isArray(statuses) && statuses.length===2 && statuses.includes('firing') && statuses.includes('resolved');
}

/** Invoked only after owner/grant authentication and callback_not_allowed.
 * Dedicated projection; no general logger expansion, request state or I/O.
 * The cap is per bridge process, not a global cap across Cloud Run instances.
 */
export function createRejectedHostCapture(enabled:boolean) {
  let captured=false;
  return (filters:unknown,value:unknown):void=>{
    try {
      if(!enabled || captured || !exactSyntheticFilters(filters))return;
      const hostname=diagnosticHostname(value);if(!hostname)return;
      captured=true;
      process.stdout.write(JSON.stringify({event:'callback_host_rejected',hostname})+'\n');
    } catch { /* Observation cannot change the original callback rejection. */ }
  };
}
