import Provider, { errors, type AdapterPayload, type Configuration } from 'oidc-provider';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Config } from './config.js';
import type { Store } from './store.js';
import { open, seal } from './events.js';
import { equal, hash, logEvent, SafeError } from './security.js';

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
    async destroy(id:string) {await store.atomic(async tx=>{tx.delete(this.path(id));if(this.model==='Grant')tx.set('revokedGrants/'+hash(id),{deleteAfter:new Date(now()+90*86400_000)});});}
    async consume(id:string) {
      await store.atomic(async tx=>{
        const row=await tx.get(this.path(id));
        if(!row || row.expiresAt<=now())throw new errors.InvalidGrant('Grant expired');
        const payload=JSON.parse(open(row.encrypted,key));
        if(payload.consumed)throw new errors.InvalidGrant('Grant already consumed');
        payload.consumed=Math.floor(now()/1000);
        tx.set(this.path(id),{...row,encrypted:seal(JSON.stringify(payload),key)});
      });
    }
    async revokeByGrantId(grantId:string) {
      // A tombstone also blocks tokens concurrently stored after revocation.
      await store.atomic(async tx=>{tx.set('revokedGrants/'+hash(grantId),{deleteAfter:new Date(now()+90*86400_000)});});
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
      const {tokens}=await client.getToken({code,codeVerifier:verifier,redirect_uri:config.googleRedirectUri});
      if(!tokens.id_token)throw new SafeError('google_missing_id_token');
      const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:config.googleClientId});
      return validateGoogleIdentity(ticket.getPayload(),config,nonce);
    },
  };
}

export function createOAuth(config:Config,store:Store,ownerActive:()=>Promise<boolean>,upstream:GoogleLogin=googleLogin(config)) {
  const options:Configuration={
    adapter:adapterFactory(store,config.stateKey,config.issuer), jwks:config.jwks,
    clients:[{client_id:config.clientId,redirect_uris:[config.redirectUri],response_types:['code'],grant_types:['authorization_code','refresh_token'],token_endpoint_auth_method:'none'}],
    scopes:['openid','offline_access','mcp:events','mcp:read'],
    pkce:{required:()=>true}, // v9 supports S256 exclusively.
    features:{devInteractions:{enabled:false},userinfo:{enabled:false},revocation:{
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
    ttl:{AccessToken:300,AuthorizationCode:60,Interaction:600,Session:86400,Grant:30*86400,RefreshToken:30*86400},
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
    (req as any).baseUrl='/oauth';
    (req as any).originalUrl=req.url;
    if(path.startsWith('/oauth/interaction/') || path==='/oauth/google/callback') {
      if(req.method!=='GET' || !(await ownerActive()))throw new SafeError('owner_denied',403);
      if(path==='/oauth/google/callback') {
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
      const details=await provider.interactionDetails(req,res).catch(error=>{
        if(error instanceof errors.SessionNotFound)throw new SafeError('interaction_session_missing');
        throw error;
      });
      const interactionPath='/oauth/interaction/'+details.uid;
      if(path===interactionPath+'/google/callback') {
        const state=url.searchParams.get('state') ?? '',code=url.searchParams.get('code');
        if(!state || !code)throw new SafeError('google_callback_invalid');
        const saved=await store.atomic(async tx=>{
          const row=await tx.get('googleStates/'+hash(state));
          if(!row || row.expiresAt<=Date.now() || row.uid!==details.uid)throw new SafeError('google_state_invalid');
          tx.delete('googleStates/'+hash(state));return row;
        });
        const login=JSON.parse(open(saved.encrypted,config.stateKey));
        const accountId=await upstream.complete(code,login.verifier,login.nonce);
        if(accountId!==config.ownerSub || !(await ownerActive()))throw new SafeError('google_owner_denied',403);
        await provider.interactionFinished(req,res,{login:{accountId}},{mergeWithLastSubmission:false});return;
      }
      if(path!==interactionPath)throw new SafeError('interaction_mismatch');
      if(details.prompt.name==='login') {
        const state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url');
        const start=await upstream.begin(state,nonce);
        await store.atomic(async tx=>{tx.set('googleStates/'+hash(state),{uid:details.uid,encrypted:seal(JSON.stringify({nonce,verifier:start.verifier}),config.stateKey),expiresAt:Date.now()+600_000,deleteAfter:new Date(Date.now()+86400_000)});});
        res.writeHead(302,{Location:start.url,'Cache-Control':'no-store'});res.end();return;
      }
      if(details.prompt.name==='consent' && details.session?.accountId===config.ownerSub) {
        const grant=details.grantId ? await provider.Grant.find(details.grantId) : new provider.Grant({accountId:config.ownerSub,clientId:config.clientId});
        if(!grant)throw new SafeError('grant_missing');
        const missing=details.prompt.details;
        if(missing.missingOIDCScope)grant.addOIDCScope(missing.missingOIDCScope as string[]);
        if(missing.missingOIDCClaims)grant.addOIDCClaims(missing.missingOIDCClaims as string[]);
        for(const [resource,scopes] of Object.entries(missing.missingResourceScopes ?? {})) {
          if(resource!==config.resource)throw new SafeError('invalid_resource');
          grant.addResourceScope(resource,scopes as string[]);
        }
        const grantId=await grant.save();
        await provider.interactionFinished(req,res,{consent:{grantId}},{mergeWithLastSubmission:true});return;
      }
      throw new SafeError('unsupported_interaction');
    }
    // Provider is mounted at /oauth; preserve originalUrl for correct issuer routing.
    const original=req.url;req.url=req.url!.slice('/oauth'.length) || '/';
    try {await provider.callback()(req,res);} finally {req.url=original;}
  };
  const authenticate=async (header:string|undefined,scope:string)=>{
    if(!(await ownerActive()) || !header?.startsWith('Bearer '))throw new SafeError('unauthorized',401);
    const token=await provider.AccessToken.find(header.slice(7));
    if(!token || token.isExpired || token.accountId!==config.ownerSub || token.clientId!==config.clientId || token.aud!==config.resource || !token.scope?.split(' ').includes(scope) || !await provider.Grant.find(token.grantId))throw new SafeError('unauthorized',401);
    return {token:header.slice(7),clientId:config.clientId,scopes:token.scope.split(' '),expiresAt:token.exp,extra:{owner:config.ownerSub,grantId:token.grantId}};
  };
  return {provider,route,authenticate};
}
