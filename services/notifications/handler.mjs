/** Independent bounded, authenticated notification route wrapper; absent activation delegates. */
export function notificationHandler({next,store,verifyPrincipal,origins,enabled=false,publicKey,offlineDataset=false}){
 return async(req,res)=>{
  let url;try{url=new URL(req.url,'http://local.invalid')}catch{return next(req,res)}
  if(!enabled||!url.pathname.startsWith('/api/notifications'))return next(req,res);
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const reply=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  const origin=req.headers.origin;if(origin&&!origins.includes(origin))return reply(403,{error:'access_denied'});
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,PUT');return reply(204,{});}
  let principal;try{principal=await verifyPrincipal(req.headers.authorization)}catch{return reply(503,{error:'notification_unavailable'})}if(!principal?.ok)return reply(401,{error:'sign_in_required'});
  try{
   let value;const p=url.pathname;
   if(req.method==='POST'&&p==='/api/notifications/offline-dataset'&&offlineDataset){
    if(url.searchParams.get('protocol')!=='3'||[...url.searchParams.keys()].some(key=>key!=='protocol')||url.searchParams.getAll('protocol').length!==1||!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))return reply(400,{error:'invalid_request'});
    req.setTimeout(10000,()=>req.destroy());const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>524288)return reply(413,{error:'invalid_request'});chunks.push(chunk)}req.setTimeout(0);
    let request;try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return reply(400,{error:'invalid_request'})}
    const controller=new AbortController();res.once('close',()=>controller.abort());value=await store.offlineDataset(principal,controller.signal,{protocol:3,input:request});
   }
   else if(req.method==='GET'&&p==='/api/notifications/offline-dataset'&&offlineDataset){
    const protocol=url.searchParams.get('protocol'),cursor=url.searchParams.get('cursor');
    if([...url.searchParams.keys()].some(key=>!['protocol','cursor'].includes(key))||url.searchParams.getAll('protocol').length>1||url.searchParams.getAll('cursor').length>1||(protocol!==null&&protocol!=='2')||(cursor!==null&&protocol!=='2'))return reply(400,{error:'invalid_request'});
    const controller=new AbortController();res.once('close',()=>controller.abort());value=await store.offlineDataset(principal,controller.signal,{protocol:protocol==='2'?2:1,cursor});
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
