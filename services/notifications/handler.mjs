import {beginRequest} from '../lib/http-boundary.mjs';
/** Independent bounded, authenticated notification route wrapper; absent activation delegates. */
export function notificationHandler({next,store,verifyPrincipal,origins,enabled=false,publicKey,offlineDataset=false,completionLogger=()=>{}}){
 return async(req,res)=>{
  let url;try{url=new URL(req.url,'http://local.invalid')}catch{return next(req,res)}
  if(!enabled||!url.pathname.startsWith('/api/notifications'))return next(req,res);
  let code='ok';
  const boundary=beginRequest(req,res,{origins,methods:['GET','POST','DELETE','PUT'],headers:['Authorization','Content-Type','X-MW-Wake-Deadline'],logger:completionLogger,
   record:({requestId,status})=>({event:'notification_request',requestId,method:['GET','POST','DELETE','PUT','OPTIONS'].includes(req.method)?req.method:'OTHER',status,code,durationMs:boundary.durationMs()})});
  const reply=(status,value)=>{code=status<400?'ok':value?.error??'notification_unavailable';res.statusCode=status;res.end(JSON.stringify(value));};
  if(boundary.originDenied)return reply(403,{error:'access_denied'});
  // A preflight needs an allowlisted Origin and a listed method and headers.
  if(req.method==='OPTIONS')return boundary.preflight()?reply(204,{}):reply(403,{error:'access_denied'});
  let principal;try{principal=await verifyPrincipal(req.headers.authorization)}catch{return reply(401,{error:'session_invalid',code:'session_invalid'})}
  if(!principal?.ok){const status=[401,403,503].includes(principal?.status)?principal.status:401,reason=typeof principal?.code==='string'?principal.code:'session_invalid';return reply(status,{error:reason,code:reason});}
  try{
   let value;const p=url.pathname;
   if(req.method==='POST'&&p==='/api/notifications/offline-dataset'&&offlineDataset){
    if(url.searchParams.get('protocol')!=='3'||[...url.searchParams.keys()].some(key=>key!=='protocol')||url.searchParams.getAll('protocol').length!==1||!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))return reply(400,{error:'invalid_request'});
    req.setTimeout(10000,()=>req.destroy());const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>524288)return reply(413,{error:'invalid_request'});chunks.push(chunk)}req.setTimeout(0);
    let request;try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return reply(400,{error:'invalid_request'})}
    const controller=new AbortController();res.once('close',()=>controller.abort());value=await store.offlineDataset(principal,controller.signal,{protocol:3,input:request});
   }
   else if(req.method==='GET'&&p==='/api/notifications/offline-dataset'&&offlineDataset){
    const cursor=url.searchParams.get('cursor');
    // Protocol 1 (whole history in one response) is retired: protocol=2 is required.
    if([...url.searchParams.keys()].some(key=>!['protocol','cursor'].includes(key))||url.searchParams.getAll('protocol').length!==1||url.searchParams.get('protocol')!=='2'||url.searchParams.getAll('cursor').length>1)return reply(400,{error:'invalid_request'});
    const controller=new AbortController();res.once('close',()=>controller.abort());value=await store.offlineDataset(principal,controller.signal,{protocol:2,cursor});
   }
   else if(req.method==='GET'&&p==='/api/notifications'&&[...url.searchParams.keys()].every(k=>k==='before')&&url.searchParams.getAll('before').length<=1)value=await store.history(principal,url.searchParams.get('before'));
   else if(req.method==='GET'&&p==='/api/notifications/status'&&[...url.searchParams.keys()].every(k=>k==='device')&&url.searchParams.getAll('device').length<=1)value=await store.status(principal,url.searchParams.get('device'));
   else if(req.method==='GET'&&p==='/api/notifications/push-config'&&!url.search){await store.status(principal,null);value={publicKey};}
   else if(req.method==='GET'&&/^\/api\/notifications\/[a-f0-9-]{36}$/.test(p)&&!url.search)value=await store.target(principal,p.split('/').at(-1));
   else if(req.method==='DELETE'&&/^\/api\/notifications\/subscriptions\/[a-f0-9-]{36}$/.test(p)&&!url.search)value=await store.revoke(principal,p.split('/').at(-1));
   else if((req.method==='POST'&&p==='/api/notifications/subscriptions'||req.method==='PUT'&&p==='/api/notifications/preference')&&!url.search){
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))return reply(400,{error:'invalid_request'});
    req.setTimeout(10000,()=>req.destroy());const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)return reply(413,{error:'invalid_request'});chunks.push(chunk);}
    req.setTimeout(0);let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'invalid_request'});}
    if(p.endsWith('/preference')){if(!body||Object.keys(body).join(',')!=='enabled')return reply(400,{error:'invalid_request'});value=await store.preference(principal,body.enabled);}else value=await store.subscribe(principal,body);
   }else return reply(404,{error:'not_found'});
   return reply(200,value);
  }catch(error){const code=['access_denied','not_found','invalid_request','invalid_subscription','dataset_changed'].includes(error?.message)?error.message:'notification_unavailable';return reply(code==='access_denied'?403:code==='not_found'?404:code==='dataset_changed'?409:code.startsWith('invalid_')?400:503,{error:code,code});}
 };
}
