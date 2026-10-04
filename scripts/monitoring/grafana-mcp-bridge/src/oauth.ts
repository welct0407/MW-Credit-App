import Provider, { errors, type AdapterPayload, type Configuration } from 'oidc-provider';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CHATGPT_CLIENT_ID, CHATGPT_REDIRECT_URI, metadataFetch } from './cimd.js';
import type { Config } from './config.js';
import type { Store } from './store.js';
import { open, seal } from './events.js';
import { equal, hash, logEvent, SafeError } from './security.js';

export const OFFLINE_AUTHORIZATION_SECONDS=730*86400; // Conservative two-year maximum.
const SESSION_AUTHORIZATION_SECONDS=30*86400;
const REVOCATION_RETENTION_MS=(OFFLINE_AUTHORIZATION_SECONDS+86400)*1000;

// Never log an exception, message, response body, URL or token. Only these
// fixed categories may distinguish upstream rejection from local failures.
function oauthFailureCategory(error:unknown) {
  const value=error as {code?:unknown;response?:{data?:{error?:unknown}}}|undefined;
  const upstream=value?.response?.data?.error;
  if(upstream==='invalid_client' || upstream==='invalid_grant' || upstream==='invalid_request')return upstream;
  if(value?.code===7)return 'datastore_permission';
  if(value?.code===9)return 'datastore_precondition';
  if(value?.code==='ENOTFOUND' || value?.code==='EAI_AGAIN' || value?.code==='ETIMEDOUT' || value?.code==='ECONNRESET')return 'network';
  return 'unexpected';
}
async function googleStep<T>(stage:'exchange'|'verify',operation:()=>Promise<T>):Promise<T> {
  try {return await operation();}
  catch(error) {
    logEvent('oauth_google_'+stage+'_'+oauthFailureCategory(error));
    throw new SafeError('google_sign_in_'+stage+'_failed',502);
  }
}

/** Encrypted durable adapter. IDs/indexes are hashes; token values never appear as document IDs. */
export function adapterFactory(store:Store,key:Buffer,issuer:string,now=()=>Date.now()) {
  return class Adapter {
    constructor(readonly model:string) {}
    path(id:string) {return 'oauth/'+hash(issuer+':'+this.model+':'+id);}
    async upsert(id:string,payload:AdapterPayload,expiresIn:number) {
      await store.atomic(async tx=>{tx.set(this.path(id),{
        model:this.model,issuerHash:hash(issuer),encrypted:seal(JSON.stringify(payload),key),expiresAt:now()+expiresIn*1000,
        uid:hash(String(payload.uid ?? '')),userCode:hash(String(payload.userCode ?? '')),
        grantId:payload.grantId ? hash(payload.grantId) : '',deleteAfter:new Date(now()+(expiresIn+86400)*1000),
      });});
    }
    async decode(row:any) {
      if(!row || row.expiresAt<=now() || (row.grantId && await store.get('revokedGrants/'+row.grantId)))return undefined;
      return JSON.parse(open(row.encrypted,key)) as AdapterPayload;
    }
    async find(id:string) {return this.decode(await store.get(this.path(id)));}
    async findByUid(uid:string) {return this.decode((await store.query('oauth',[['model','==',this.model],['issuerHash','==',hash(issuer)],['uid','==',hash(uid)]],1))[0]);}
    async findByUserCode(code:string) {return this.decode((await store.query('oauth',[['model','==',this.model],['issuerHash','==',hash(issuer)],['userCode','==',hash(code)]],1))[0]);}
    async destroy(id:string) {await store.atomic(async tx=>{tx.delete(this.path(id));if(this.model==='Grant')tx.set('revokedGrants/'+hash(id),{deleteAfter:new Date(now()+REVOCATION_RETENTION_MS)});});}
    async consume(id:string) {
      const reused=await store.atomic(async tx=>{
        const row=await tx.get(this.path(id));
        if(!row || row.expiresAt<=now())throw new errors.InvalidGrant('Grant expired');
        const payload=JSON.parse(open(row.encrypted,key));
        if(payload.consumed) {
          if(this.model==='RefreshToken' && payload.grantId)tx.set('revokedGrants/'+hash(payload.grantId),{deleteAfter:new Date(now()+REVOCATION_RETENTION_MS)});
          return true;
        }
        payload.consumed=Math.floor(now()/1000);
        tx.set(this.path(id),{...row,encrypted:seal(JSON.stringify(payload),key)});
        return false;
      });
      if(reused)throw new errors.InvalidGrant('Grant already consumed');
    }
    async revokeByGrantId(grantId:string) {
      // A tombstone also blocks tokens concurrently stored after revocation.
      await store.atomic(async tx=>{tx.set('revokedGrants/'+hash(grantId),{deleteAfter:new Date(now()+REVOCATION_RETENTION_MS)});});
    }
  };
}
export function validateGoogleIdentity(payload:TokenPayload|undefined,config:Config,nonce:string) {
  if(!payload || payload.sub!==config.ownerSub || payload.email_verified!==true || payload.email?.toLowerCase()!==config.ownerEmail.toLowerCase() || !equal((payload as any).nonce ?? '',nonce))throw new SafeError('google_owner_denied',403);
  // Google library verifies signature, issuer, audience, issued-at and expiry before here.
  return payload.sub;
}
export interface GoogleLogin {
  begin(state:string,nonce:string):Promise<{url:string;verifier:string}>;
  complete(code:string,verifier:string,nonce:string):Promise<string>;
}
export function googleLogin(config:Config):GoogleLogin {
  const client=new OAuth2Client(config.googleClientId,config.googleClientSecret,config.googleRedirectUri);
  return {
    async begin(state,nonce) {
      const pkce=await client.generateCodeVerifierAsync();
      return {url:client.generateAuthUrl({scope:['openid','email'],state,nonce,code_challenge:pkce.codeChallenge,code_challenge_method:'S256' as any,prompt:'select_account'}),verifier:pkce.codeVerifier};
    },
    async complete(code,verifier,nonce) {
      const {tokens}=await googleStep('exchange',()=>client.getToken({code,codeVerifier:verifier,redirect_uri:config.googleRedirectUri}));
      if(!tokens.id_token)throw new SafeError('google_missing_id_token');
      const ticket=await googleStep('verify',()=>client.verifyIdToken({idToken:tokens.id_token!,audience:config.googleClientId}));
      return validateGoogleIdentity(ticket.getPayload(),config,nonce);
    },
  };
}

export function createOAuth(config:Config,store:Store,ownerActive:()=>Promise<boolean>,upstream:GoogleLogin=googleLogin(config),fetchMetadata:typeof fetch=metadataFetch()) {
  if(config.clientMetadataDocument && (config.clientId!==CHATGPT_CLIENT_ID || config.redirectUri!==CHATGPT_REDIRECT_URI))throw new SafeError('invalid_chatgpt_client_pin');
  const options:Configuration={
    adapter:adapterFactory(store,config.stateKey,config.issuer), jwks:config.jwks,
    fetch:fetchMetadata, fetchResponseBodyLimits:{'client_id metadata document':8192}, clientAuthMethods:['none'],
    clients:config.clientMetadataDocument ? [] : [{client_id:config.clientId,redirect_uris:[config.redirectUri],response_types:['code'],grant_types:['authorization_code','refresh_token'],token_endpoint_auth_method:'none'}],
    scopes:['openid','offline_access','mcp:events','mcp:read'],
    pkce:{required:()=>true}, // v9 supports S256 exclusively.
    features:{clientIdMetadataDocument:{enabled:config.clientMetadataDocument ?? false,ack:'draft-02',
      allowFetch:(_ctx,id)=>id===CHATGPT_CLIENT_ID,
      allowClient:(_ctx,client)=>client.clientId===CHATGPT_CLIENT_ID && client.tokenEndpointAuthMethod==='none' && client.redirectUris?.length===1 && client.redirectUris[0]===CHATGPT_REDIRECT_URI,
      cacheDuration:{min:30,max:300}},registration:{enabled:false},devInteractions:{enabled:false},userinfo:{enabled:false},revocation:{
      enabled:true,
      allowedPolicy:(_ctx,client,token)=>client.clientId===config.clientId && token.clientId===client.clientId && 'accountId' in token && token.accountId===config.ownerSub,
    },resourceIndicators:{
      enabled:true,defaultResource:()=>config.resource,useGrantedResource:()=>true,
      getResourceServerInfo:(_ctx,resource,client)=>{
        if(resource!==config.resource || client.clientId!==config.clientId)throw new errors.InvalidTarget('Resource denied');
        return {scope:'mcp:events mcp:read',audience:config.resource,accessTokenTTL:300,accessTokenFormat:'opaque'};
      },
    }},
    cookies:{keys:config.cookieKeys,long:{secure:true,sameSite:'lax'},short:{secure:true,sameSite:'lax'}},
    interactions:{url:(_ctx,interaction)=>config.issuer+'/interaction/'+interaction.uid},
    findAccount:async (_ctx,id)=> id===config.ownerSub && await ownerActive() ? {accountId:id,claims:async()=>({sub:id})} : undefined,
    issueRefreshToken:()=>true,rotateRefreshToken:true,
    ttl:{AccessToken:300,AuthorizationCode:60,Interaction:600,Session:86400,
      Grant:(_ctx,grant)=>grant.getOIDCScope().split(' ').includes('offline_access') ? OFFLINE_AUTHORIZATION_SECONDS : SESSION_AUTHORIZATION_SECONDS,
      // Rotation never starts another two years; both grant and original token bound it.
      RefreshToken:(ctx,token)=>Math.max(1,Math.min(
        (token.iiat ?? token.iat ?? 0)+(token.scopes.has('offline_access') ? OFFLINE_AUTHORIZATION_SECONDS : SESSION_AUTHORIZATION_SECONDS)-Math.floor(Date.now()/1000),
        ctx.oidc.entities.Grant?.remainingTTL ?? SESSION_AUTHORIZATION_SECONDS,
        ctx.oidc.entities.RotatedRefreshToken?.remainingTTL ?? Infinity,
      )),
    },
    renderError:(ctx)=>{ctx.type='text/plain';ctx.body='Authorization failed. Restart connection.';},
  };
  const provider=new Provider(config.issuer,options);
  provider.proxy=true;
  provider.on('server_error',()=>logEvent('oauth_server_error'));
  // Refresh tokens are useless once the owner or grant is revoked; do not mint replacements.
  provider.use(async (ctx,next)=>{
    if(ctx.path.endsWith('/token') && !(await ownerActive())) {ctx.status=403;ctx.body={error:'access_denied'};return;}
    await next();
  });
  const route=async (req:IncomingMessage,res:ServerResponse,path:string,url:URL)=>{
    let stage:'provider'|'owner_check'|'callback_state'|'interaction_lookup'|'state_consume'|'google_complete'|'login_finish'|'google_begin'|'state_save'|'grant_save'|'consent_finish'='provider';
    try {
    (req as any).baseUrl='/oauth';
    (req as any).originalUrl=req.url;
    if(path.startsWith('/oauth/interaction/') || path==='/oauth/google/callback') {
      stage='owner_check';
      if((req.method!=='GET' && !(req.method==='POST' && path.endsWith('/consent'))) || !(await ownerActive()))throw new SafeError('owner_denied',403);
      if(path==='/oauth/google/callback') {
        stage='callback_state';
        // The provider scopes its signed interaction cookie to /interaction/<uid>.
        // Google cannot return to a dynamic registered URI, so bounce the unchanged
        // code/state to that cookie path before reading/consuming browser authority.
        const state=url.searchParams.get('state') ?? '',code=url.searchParams.get('code');
        if(!state || !code)throw new SafeError('google_callback_invalid');
        const saved=await store.get('googleStates/'+hash(state));
        if(!saved || saved.expiresAt<=Date.now() || typeof saved.uid!=='string')throw new SafeError('google_state_invalid');
        const target=new URL(config.issuer+'/interaction/'+encodeURIComponent(saved.uid)+'/google/callback');
        target.search=new URLSearchParams({state,code}).toString();
        res.writeHead(302,{Location:target.toString(),'Cache-Control':'no-store'});res.end();return;
      }
      stage='interaction_lookup';
      const details=await provider.interactionDetails(req,res).catch(error=>{
        if(error instanceof errors.SessionNotFound)throw new SafeError('interaction_session_missing');
        throw error;
      });
      const interactionPath='/oauth/interaction/'+details.uid;
      if(path===interactionPath+'/google/callback') {
        const state=url.searchParams.get('state') ?? '',code=url.searchParams.get('code');
        if(!state || !code)throw new SafeError('google_callback_invalid');
        stage='state_consume';
        const saved=await store.atomic(async tx=>{
          const row=await tx.get('googleStates/'+hash(state));
          if(!row || row.expiresAt<=Date.now() || row.uid!==details.uid)throw new SafeError('google_state_invalid');
          tx.delete('googleStates/'+hash(state));return row;
        });
        const login=JSON.parse(open(saved.encrypted,config.stateKey));
        stage='google_complete';
        const accountId=await upstream.complete(code,login.verifier,login.nonce);
        if(accountId!==config.ownerSub || !(await ownerActive()))throw new SafeError('google_owner_denied',403);
        stage='login_finish';
        await provider.interactionFinished(req,res,{login:{accountId}},{mergeWithLastSubmission:false});return;
      }
      if(path!==interactionPath && path!==interactionPath+'/consent')throw new SafeError('interaction_mismatch');
      if(path.endsWith('/consent') && details.prompt.name!=='consent')throw new SafeError('interaction_mismatch');
      if(details.prompt.name==='login') {
        const state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url');
        stage='google_begin';
        const start=await upstream.begin(state,nonce);
        stage='state_save';
        await store.atomic(async tx=>{tx.set('googleStates/'+hash(state),{uid:details.uid,encrypted:seal(JSON.stringify({nonce,verifier:start.verifier}),config.stateKey),expiresAt:Date.now()+600_000,deleteAfter:new Date(Date.now()+86400_000)});});
        res.writeHead(302,{Location:start.url,'Cache-Control':'no-store'});res.end();return;
      }
      if(details.prompt.name==='consent' && details.session?.accountId===config.ownerSub) {
        const requested=new Set(String(details.params.scope ?? '').split(' '));
        if(requested.has('offline_access')) {
          if(path===interactionPath && req.method==='GET') {
            const csrf=randomBytes(32).toString('base64url');
            await store.atomic(async tx=>tx.set('googleStates/'+hash('offline-consent:'+details.uid),{csrfHash:hash(csrf),expiresAt:Date.now()+600_000,deleteAfter:new Date(Date.now()+86400_000)}));
            res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
            res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Authorize monitoring access</title><h1>Authorize ChatGPT monitoring access</h1><p>Allow ChatGPT to read this bridge and receive the monitoring events you select for up to two years (730 days), even after you sign out of this browser. You can revoke this authorization earlier. Subscriptions still require renewal every 24 hours.</p><form method="post" action="'+interactionPath+'/consent"><input type="hidden" name="csrf" value="'+csrf+'"><button name="decision" value="allow">Allow two-year access</button><button name="decision" value="deny">Cancel</button></form></html>');return;
          }
          if(path!==interactionPath+'/consent' || req.method!=='POST' || req.headers.origin!==config.baseUrl || req.headers['content-type']!=='application/x-www-form-urlencoded')throw new SafeError('offline_consent_required',403);
          const chunks:Buffer[]=[];let size=0;
          for await(const chunk of req) {size+=chunk.length;if(size>1024)throw new SafeError('invalid_consent',400);chunks.push(chunk);}
          const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8')),decision=form.get('decision');
          if(!['allow','deny'].includes(decision ?? '') || [...form.keys()].sort().join(',')!=='csrf,decision')throw new SafeError('invalid_consent',400);
          await store.atomic(async tx=>{
            const saved=await tx.get('googleStates/'+hash('offline-consent:'+details.uid));
            if(!saved || saved.expiresAt<=Date.now() || !equal(saved.csrfHash,hash(form.get('csrf') ?? '')))throw new SafeError('invalid_consent',403);
            tx.delete('googleStates/'+hash('offline-consent:'+details.uid));
          });
          if(decision==='deny') {await provider.interactionFinished(req,res,{error:'access_denied',error_description:'Owner declined offline authorization'},{mergeWithLastSubmission:false});return;}
        } else if(req.method!=='GET' || path!==interactionPath)throw new SafeError('interaction_mismatch');
        stage='grant_save';
        let grant=details.grantId ? await provider.Grant.find(details.grantId) : new provider.Grant({accountId:config.ownerSub,clientId:config.clientId});
        if(!grant)throw new SafeError('grant_missing');
        // An explicitly consented upgrade creates a new grant; existing deadlines stay fixed.
        if(requested.has('offline_access') && !grant.getOIDCScope().split(' ').includes('offline_access')) {
          grant=new provider.Grant({accountId:config.ownerSub,clientId:config.clientId});
          grant.addOIDCScope([...requested].filter(scope=>scope==='openid' || scope==='offline_access'));
          grant.addResourceScope(config.resource,[...requested].filter(scope=>scope==='mcp:events' || scope==='mcp:read'));
        }
        const missing=details.prompt.details;
        if(missing.missingOIDCScope)grant.addOIDCScope(missing.missingOIDCScope as string[]);
        if(missing.missingOIDCClaims)grant.addOIDCClaims(missing.missingOIDCClaims as string[]);
        for(const [resource,scopes] of Object.entries(missing.missingResourceScopes ?? {})) {
          if(resource!==config.resource)throw new SafeError('invalid_resource');
          grant.addResourceScope(resource,scopes as string[]);
        }
        const grantId=await grant.save();
        stage='consent_finish';
        await provider.interactionFinished(req,res,{consent:{grantId}},{mergeWithLastSubmission:true});return;
      }
      throw new SafeError('unsupported_interaction');
    }
    // Provider is mounted at /oauth; preserve originalUrl for correct issuer routing.
    const original=req.url;req.url=req.url!.slice('/oauth'.length) || '/';
    try {await provider.callback()(req,res);} finally {req.url=original;}
    } catch(error) {
      if(!(error instanceof SafeError))logEvent('oauth_'+stage+'_'+oauthFailureCategory(error));
      throw error;
    }
  };
  const authenticate=async (header:string|undefined,scope:string)=>{
    if(!(await ownerActive()) || !header?.startsWith('Bearer '))throw new SafeError('unauthorized',401);
    const token=await provider.AccessToken.find(header.slice(7));
    if(!token || token.isExpired || token.accountId!==config.ownerSub || token.clientId!==config.clientId || token.aud!==config.resource || !token.scope?.split(' ').includes(scope))throw new SafeError('unauthorized',401);
    const grant=await provider.Grant.find(token.grantId);
    if(!grant || grant.isExpired)throw new SafeError('unauthorized',401);
    return {token:header.slice(7),clientId:config.clientId,scopes:token.scope.split(' '),expiresAt:token.exp,extra:{owner:config.ownerSub,grantId:token.grantId,grantExpiresAt:grant.exp! * 1000}};
  };
  return {provider,route,authenticate};
}
