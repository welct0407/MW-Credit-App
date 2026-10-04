import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {request} from 'node:http';
import {once} from 'node:events';
import {MemoryStore} from '../dist/store.js';
import {createApp} from '../dist/app.js';
import {SafeError} from '../dist/security.js';

const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
export const config=()=>({
  baseUrl:'https://bridge.example',issuer:'https://bridge.example/oauth',resource:'https://bridge.example/mcp',
  projectId:'synthetic',databaseId:'bridge',ownerSub:'owner-sub',ownerEmail:'owner@example.com',ownerEnabled:true,
  clientId:'chatgpt-test-client',redirectUri:'https://chatgpt.com/connector_platform_oauth_redirect',
  googleClientId:'synthetic-google',googleClientSecret:'synthetic-only',googleRedirectUri:'https://bridge.example/oauth/google/callback',
  schedulerEmail:'scheduler@synthetic.iam.gserviceaccount.com',schedulerAudience:'https://bridge.example/internal/dispatch',
  callbackHosts:['callbacks.example'],sourceId:'synthetic-grafana',grafanaSecrets:['synthetic-hmac-key-only-32characters'],
  stateKey:randomBytes(32),cookieKeys:['synthetic-cookie-key-only-32characters'],jwks:{keys:[{...privateKey.export({format:'jwk'}),use:'sig',alg:'RS256',kid:'synthetic-key'}]},
});
export const signingSecret=()=> 'whsec_'+randomBytes(32).toString('base64');
export const subscription=(secret=signingSecret(),args={})=>({name:'grafana.alert.transition',arguments:args,delivery:{mode:'webhook',url:'https://callbacks.example/events',secret}});
export const fixture=(status='firing',overrides={})=>({alerts:[{
  status,fingerprint:'fingerprint-1',labels:{alertname:'CPU pressure',component:'database'},annotations:{summary:'Synthetic CPU alert'},
  startsAt:'2026-10-02T12:00:00Z',endsAt:status==='resolved'?'2026-10-02T12:05:00Z':'2026-10-02T12:10:00Z',dashboardURL:'https://monitor.mw-credit.com/d/test',...overrides,
}]});
export const echo=async (_url,body)=>({status:200,body:JSON.stringify({challenge:JSON.parse(body).challenge})});
// Requests use localhost transport but model the browser's canonical HTTPS origin.
// Preserve separate same-name cookies by domain/path, and honor Secure and expiry.
export class BrowserCookieJar {
  cookies=new Map();
  receive(value,origin,now=Date.now()) {
    const url=new URL(origin),parts=value.split(';'),first=parts.shift(),split=first.indexOf('=');
    if(split<=0)return;
    const name=first.slice(0,split).trim(),content=first.slice(split+1),attributes=new Map(parts.map(part=>{const i=part.indexOf('=');return i<0?[part.trim().toLowerCase(),'']:[part.slice(0,i).trim().toLowerCase(),part.slice(i+1).trim()];}));
    const hostOnly=!attributes.has('domain'),domain=(attributes.get('domain') ?? url.hostname).replace(/^\./,'').toLowerCase();
    if(url.hostname!==domain && (hostOnly || !url.hostname.endsWith('.'+domain)))return;
    const defaultPath=url.pathname.slice(0,url.pathname.lastIndexOf('/')) || '/';
    const suppliedPath=attributes.get('path'),path=suppliedPath?.startsWith('/')?suppliedPath:defaultPath;
    const secure=attributes.has('secure');if(secure && url.protocol!=='https:')return;
    if(name.startsWith('__Secure-') && !secure)return;
    if(name.startsWith('__Host-') && (!secure || !hostOnly || path!=='/'))return;
    let expiresAt=Infinity;
    if(attributes.has('expires')){const expiry=Date.parse(attributes.get('expires'));if(Number.isFinite(expiry))expiresAt=expiry;}
    if(/^-?\d+$/.test(attributes.get('max-age') ?? ''))expiresAt=now+Number(attributes.get('max-age'))*1000;
    const key=[name,domain,path].join('\0');
    if(expiresAt<=now)this.cookies.delete(key);
    else this.cookies.set(key,{name,content,domain,hostOnly,path,secure,expiresAt});
  }
  header(origin,now=Date.now()) {
    const url=new URL(origin),matches=[];
    for(const [key,cookie] of this.cookies){
      if(cookie.expiresAt<=now){this.cookies.delete(key);continue;}
      const domain=url.hostname===cookie.domain || !cookie.hostOnly && url.hostname.endsWith('.'+cookie.domain);
      const path=url.pathname===cookie.path || url.pathname.startsWith(cookie.path) && (cookie.path.endsWith('/') || url.pathname[cookie.path.length]==='/');
      if(domain && path && (!cookie.secure || url.protocol==='https:'))matches.push(cookie);
    }
    return matches.sort((a,b)=>b.path.length-a.path.length).map(c=>c.name+'='+c.content).join('; ');
  }
}
export async function application(deps={}) {
  const conf={...config(),...deps.config},store=deps.store ?? new MemoryStore();
  let lastLogin;
  const google={
    begin:async (state,nonce)=>{lastLogin={state,nonce};return {url:'https://accounts.example/login?state='+state,verifier:'synthetic-google-verifier'};},
    complete:async (code,verifier,nonce)=>{if(code!=='synthetic-owner-code' || verifier!=='synthetic-google-verifier' || nonce!==lastLogin?.nonce)throw new Error('sentinel-secret');return conf.ownerSub;},
  };
  const app=createApp(conf,store,deps.send ?? echo,{google,...deps,scheduler:deps.scheduler ?? (async header=>{if(header!=='Bearer synthetic-scheduler')throw new SafeError('scheduler_unauthorized',401);})});
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const port=app.server.address().port,cookieJar=new BrowserCookieJar();
  const call=async(path,opts={})=>new Promise((resolve,reject)=>{
    const raw=opts.body===undefined?undefined:typeof opts.body==='string'?opts.body:JSON.stringify(opts.body);
    const origin=new URL(path,opts.origin ?? conf.baseUrl);if(opts.headers?.host)origin.host=opts.headers.host;
    const cookie=opts.cookies===false?'':cookieJar.header(origin);
    const req=request({hostname:'127.0.0.1',port,path,method:opts.method ?? 'GET',headers:{host:origin.host,...(raw?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw)}:{}),...(cookie?{cookie}:{}),...opts.headers}},res=>{
      for(const item of res.headers['set-cookie'] ?? [])cookieJar.receive(item,origin);
      let body='';res.on('data',b=>{body+=b;});res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body,json:()=>JSON.parse(body)}));
    });req.on('error',reject);req.end(raw);
  });
  const follow=location=>call(new URL(location,conf.baseUrl).pathname+new URL(location,conf.baseUrl).search);
  return {...app,conf,store,call,follow,cookieJar,login:()=>lastLogin,close:async()=>{await app.mcp.close();await new Promise(r=>app.server.close(r));}};
}
export async function authorize(app,options={}) {
  const verifier='synthetic-pkce-verifier-012345678901234567890123456789', {createHash}=await import('node:crypto');
  const params=new URLSearchParams({client_id:app.conf.clientId,redirect_uri:app.conf.redirectUri,response_type:'code',scope:'mcp:events mcp:read',resource:app.conf.resource,state:'synthetic-client-state',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',...options});
  let res=await app.call('/oauth/auth?'+params);
  for(let i=0;i<10;i++){
    const location=res.headers.location;
    if(!location && res.status===200 && res.body.includes('name="csrf"')) {
      const csrf=res.body.match(/name="csrf" value="([A-Za-z0-9_-]+)"/)[1];
      const interaction=res.body.match(/action="([^"]+)"/)[1];
      res=await app.call(interaction,{method:'POST',headers:{Origin:app.conf.baseUrl,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,decision:'allow'}).toString()});continue;
    }
    if(!location)throw new Error('OAuth flow stopped: '+res.status+' '+res.body);
    if(location.startsWith(app.conf.redirectUri))return {code:new URL(location).searchParams.get('code'),verifier,response:res,redirect:new URL(location)};
    if(location.startsWith('https://accounts.example/'))res=await app.call('/oauth/google/callback?'+new URLSearchParams({state:app.login().state,code:'synthetic-owner-code'}));
    else res=await app.follow(location);
  }
  throw new Error('OAuth redirect loop');
}
export const tokenExchange=(app,code,verifier,extra={})=>app.call('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:app.conf.clientId,redirect_uri:app.conf.redirectUri,code,code_verifier:verifier,resource:app.conf.resource,...extra}).toString()});
export const mcpRequest=(app,method,params={},token)=>app.call('/mcp',{method:'POST',headers:{'Mcp-Method':method,'Mcp-Protocol-Version':'2026-07-28','Accept':'application/json, text/event-stream',...(method.startsWith('tools/') && params.name?{'Mcp-Name':params.name}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:{jsonrpc:'2.0',id:1,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}}}});
