import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { SafeError } from './security.js';
import { CHATGPT_CLIENT_ID, CHATGPT_REDIRECT_URI } from './cimd.js';

export interface Config {
  baseUrl: string; issuer: string; resource: string; projectId: string; databaseId: string;
  ownerSub: string; ownerEmail: string; ownerEnabled: boolean; clientId: string; redirectUri: string; clientMetadataDocument?: boolean;
  googleClientId: string; googleClientSecret: string; googleRedirectUri: string;
  schedulerEmail: string; schedulerAudience: string; callbackHosts: string[]; sourceId: string;
  captureRejectedCallbackHost?: boolean;
  grafanaSecrets: string[]; stateKey: Buffer; cookieKeys: string[]; jwks: {keys: any[]};
}
const secretFile = (env: NodeJS.ProcessEnv, name: string) => {
  const path = env[name + '_FILE'];
  if (!path) throw new SafeError('missing_config_' + name);
  return readFileSync(path,'utf8').trim();
};
export function loadConfig(env = process.env): Config {
  const required = (name: string) => {
    const value = env[name]; if (!value) throw new SafeError('missing_config_'+name); return value;
  };
  const base = new URL(required('PUBLIC_BASE_URL'));
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new SafeError('invalid_public_base_url');
  const baseUrl = base.origin;
  const issuer = env.OAUTH_ISSUER ?? baseUrl + '/oauth';
  const resource = env.MCP_RESOURCE ?? baseUrl + '/mcp';
  // Routing and metadata must agree; hostname migration changes all three together.
  if (issuer !== baseUrl+'/oauth' || resource !== baseUrl+'/mcp') throw new SafeError('canonical_url_mismatch');
  // Production supports only the official stable ChatGPT CIMD identity.
  if ((env.CHATGPT_CLIENT_ID && env.CHATGPT_CLIENT_ID !== CHATGPT_CLIENT_ID) ||
      (env.CHATGPT_REDIRECT_URI && env.CHATGPT_REDIRECT_URI !== CHATGPT_REDIRECT_URI)) throw new SafeError('invalid_chatgpt_client_pin');
  const redirectUri = CHATGPT_REDIRECT_URI;
  const callbacks = env.CALLBACK_HOSTS?.trim() ?? '';
  const callbackHosts = callbacks ? callbacks.split(',').map(s=>s.trim()) : [];
  if (callbackHosts.some(h => !/^[a-z0-9.-]+$/.test(h) || h.includes('..'))) throw new SafeError('invalid_callback_hosts');
  if(env.CAPTURE_REJECTED_CALLBACK_HOST!==undefined && !['true','false'].includes(env.CAPTURE_REJECTED_CALLBACK_HOST))throw new SafeError('invalid_callback_capture_flag');
  const encodedStateKey = secretFile(env,'STATE_KEY');
  const stateKey = Buffer.from(encodedStateKey,'base64');
  if (stateKey.length !== 32 || stateKey.toString('base64') !== encodedStateKey) throw new SafeError('invalid_state_key');
  const cookieKeys = z.array(z.string().min(32)).min(1).max(3).parse(JSON.parse(secretFile(env,'COOKIE_KEYS')));
  const jwks = z.object({keys:z.array(z.record(z.string(),z.unknown())).min(1)}).parse(JSON.parse(secretFile(env,'OAUTH_JWKS')));
  const grafanaSecrets = z.array(z.string().min(32)).min(1).max(2).parse(JSON.parse(secretFile(env,'GRAFANA_SECRETS')));
  return {
    baseUrl, issuer, resource, projectId:required('GCP_PROJECT'), databaseId:required('FIRESTORE_DATABASE'),
    ownerSub:required('OWNER_GOOGLE_SUB'), ownerEmail:required('OWNER_EMAIL'), ownerEnabled:env.OWNER_ENABLED !== 'false',
    clientId:CHATGPT_CLIENT_ID, clientMetadataDocument:true, redirectUri, googleClientId:required('GOOGLE_CLIENT_ID'),
    googleClientSecret:secretFile(env,'GOOGLE_CLIENT_SECRET'), googleRedirectUri:baseUrl+'/oauth/google/callback',
    schedulerEmail:required('SCHEDULER_EMAIL'), schedulerAudience:baseUrl+'/internal/dispatch',
    callbackHosts, captureRejectedCallbackHost:env.CAPTURE_REJECTED_CALLBACK_HOST==='true', sourceId:required('GRAFANA_SOURCE_ID'), grafanaSecrets, stateKey, cookieKeys, jwks,
  };
}
