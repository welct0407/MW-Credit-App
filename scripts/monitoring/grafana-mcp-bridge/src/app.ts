import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { OAuth2Client } from 'google-auth-library';
import { createMcpHandler, McpServer, ProtocolError } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { z } from 'zod';
import type { Config } from './config.js';
import { Bridge, EVENT_NAME, Filters, Payload, type EventRecord } from './events.js';
import { createOAuth, type GoogleLogin } from './oauth.js';
import { hash, logEvent, SafeError, verifyGrafana, type CallbackTransport } from './security.js';
import type { Store } from './store.js';

export async function body(req:IncomingMessage,max=262144):Promise<Buffer> {
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of req) {size+=chunk.length;if(size>max)throw new SafeError('body_too_large',413);chunks.push(chunk);}
  return Buffer.concat(chunks);
}
const json=(res:ServerResponse,status:number,value:unknown,headers:Record<string,string>={})=>{
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value));
};
export type SchedulerVerifier=(header:string|undefined)=>Promise<void>;
export function schedulerVerifier(config:Config):SchedulerVerifier {
  const google=new OAuth2Client();
  return async header=>{
    if(!header?.startsWith('Bearer '))throw new SafeError('scheduler_unauthorized',401);
    try {
      const ticket=await google.verifyIdToken({idToken:header.slice(7),audience:config.schedulerAudience});
      const p=ticket.getPayload();
      if(!p || p.email!==config.schedulerEmail || p.email_verified!==true)throw new Error();
    } catch {throw new SafeError('scheduler_unauthorized',401);}
  };
}
function rpc<T>(fn:()=>Promise<T>):Promise<T> {
  return fn().catch(error=>{
    if(error instanceof SafeError)throw new ProtocolError(error.reason.startsWith('callback_') ? -32015 : -32602,error.reason,{reason:error.reason});
    if(error instanceof z.ZodError)throw new ProtocolError(-32602,'invalid_parameters');
    throw new ProtocolError(-32603,'bridge_operation_failed');
  });
}
export function createApp(config:Config,store:Store,send:CallbackTransport,dependencies:{google?:GoogleLogin;scheduler?:SchedulerVerifier;now?:()=>number}={}) {
  const bridge=new Bridge(store,config,send,dependencies.now);
  const oauth=createOAuth(config,store,()=>bridge.ownerActive(),dependencies.google);
  const mcp=createMcpHandler(()=>{
    const server=new McpServer({name:'mw-grafana-events',version:'0.1.0'},{capabilities:{events:{}}} as any);
    server.server.setRequestHandler('events/list',{params:z.object({cursor:z.string().nullable().optional()}).strict()},async()=>({events:[{
      name:EVENT_NAME,description:'A Grafana alert instance starts firing or resolves. Repeated reminders are suppressed.',delivery:['webhook'],inputSchema:z.toJSONSchema(Filters),payloadSchema:z.toJSONSchema(Payload),
    }]}));
    server.server.setRequestHandler('events/subscribe',{params:z.object({name:z.string(),arguments:Filters,delivery:z.object({mode:z.literal('webhook'),url:z.string().max(2048),secret:z.string().max(128)}).strict(),ttlMs:z.number().positive().nullable().optional(),cursor:z.string().nullable().optional()}).strict()},(params,ctx)=>rpc(async()=>{
      const grantId=ctx.http?.authInfo?.extra?.grantId;
      if(typeof grantId!=='string')throw new SafeError('missing_subscription_authority');
      return bridge.subscribe(params,grantId);
    }));
    server.server.setRequestHandler('events/unsubscribe',{params:z.object({name:z.string(),arguments:Filters,delivery:z.object({mode:z.literal('webhook'),url:z.string().max(2048)}).strict()}).strict()},params=>rpc(()=>bridge.unsubscribe(params)));
    server.registerTool('get_bridge_health',{description:'Read bridge delivery counts and owner access state. Counts are capped at 100 records per state.',inputSchema:z.object({}).strict(),annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},async()=>rpc(async()=>{
      const counts:Record<string,number>={};for(const state of ['pending','failed','delivered','cancelled'])counts[state]=(await store.query('deliveries',[['state','==',state]],100)).length;
      return {content:[{type:'text',text:JSON.stringify({owner_enabled:await bridge.ownerActive(),counts,count_cap:100})}]};
    }));
    server.registerTool('get_alert_event',{description:'Read one sanitized alert event previously accepted by this bridge.',inputSchema:z.object({event_id:z.string().regex(/^evt_[a-f0-9]{64}$/)}).strict(),annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},async ({event_id})=>rpc(async()=>{
      const event=await store.get<EventRecord>('events/'+event_id);
      return {content:[{type:'text',text:event?.body ?? 'Event unavailable.'}]};
    }));
    return server;
  },{legacy:'reject',maxRequestBodySize:262144,onerror:()=>logEvent('mcp_error')});
  const adapter=toNodeHandler(mcp,{maxRequestBodySize:262144,onerror:()=>logEvent('mcp_adapter_error')});
  const verifyScheduler=dependencies.scheduler ?? schedulerVerifier(config);
  const handler=async(req:IncomingMessage,res:ServerResponse)=>{
    try {
      if(req.headers.host!==new URL(config.baseUrl).host || !req.url?.startsWith('/') || req.url.startsWith('//'))throw new SafeError('invalid_host',400);
      const url=new URL(req.url,config.baseUrl),path=url.pathname;
      if(url.origin!==config.baseUrl)throw new SafeError('invalid_request_origin');
      // Canonical origin is configured; do not accept forwarded host/proto overrides.
      delete req.headers['x-forwarded-host'];req.headers['x-forwarded-proto']='https';
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Referrer-Policy','no-referrer');
      if(path==='/health' && req.method==='GET') {json(res,200,{status:'ok'});return;}
      if((path==='/.well-known/oauth-protected-resource' || path==='/.well-known/oauth-protected-resource/mcp') && req.method==='GET') {
        json(res,200,{resource:config.resource,authorization_servers:[config.issuer],scopes_supported:['mcp:events','mcp:read']});return;
      }
      if(path.startsWith('/oauth/') || path==='/oauth') {await oauth.route(req,res,path,url);return;}
      if(path==='/mcp') {
        const method=String(req.headers['mcp-method'] ?? '');
        const scope=method.startsWith('tools/') ? 'mcp:read' : 'mcp:events';
        (req as any).auth=await oauth.authenticate(req.headers.authorization,scope);
        await adapter(req,res);return;
      }
      if(path==='/grafana' && req.method==='POST') {
        const raw=await body(req);
        verifyGrafana(raw,String(req.headers['x-grafana-alerting-timestamp'] ?? ''),String(req.headers['x-grafana-alerting-signature'] ?? ''),config.grafanaSecrets,dependencies.now?.());
        let input;try {input=JSON.parse(raw.toString('utf8'));}catch{throw new SafeError('invalid_json');}
        const result=await bridge.ingest(input);logEvent('grafana_accepted',{count:result.created});json(res,202,result);return;
      }
      if(path==='/internal/dispatch' && req.method==='POST') {
        await verifyScheduler(req.headers.authorization);await body(req,1024);
        const result=await bridge.dispatch();logEvent('dispatch_completed',{count:result.attempted});json(res,200,result);return;
      }
      throw new SafeError('not_found',404);
    } catch(error) {
      logEvent('request_failed',{status:error instanceof SafeError?error.status:500});
      if(res.headersSent) {res.end();return;}
      const status=error instanceof SafeError?error.status:error instanceof z.ZodError?400:500;
      json(res,status,{error:error instanceof SafeError?error.reason:status===400?'invalid_parameters':'request_failed'},status===401 && req.url?.startsWith('/mcp') ? {'WWW-Authenticate':`Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource/mcp", scope="mcp:events mcp:read"`} : {});
    }
  };
  const server=createServer((req,res)=>{void handler(req,res);});
  server.requestTimeout=30_000;server.headersTimeout=15_000;
  return {server,handler,bridge,oauth,mcp};
}
