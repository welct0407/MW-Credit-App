import {createConversationWorkloadVerifier} from './policy.mjs';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const identifier=value=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=256&&value.isWellFormed()&&!/[\u0000-\u001f]/.test(value);

/** Exact machine routes only. Providers own guarded transactions and fresh actors. */
export function createAgentConversationHandler({next,policy,verifyOidc,providers,now=Date.now}){
 const verify=createConversationWorkloadVerifier(policy,verifyOidc,now);
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 return async(req,res)=>{
  const match=/^\/internal\/agent\/(catalogue|query|commands)(?:\/([^/?]+))?$/.exec(req.url??'');
  if(!match)return next(req,res);
  const route=match[1],requestId=match[2],statusRoute=route==='commands'&&requestId!==undefined;
  if(!policy||requestId!==undefined&&(!statusRoute||!uuid.test(requestId))||req.method!==(statusRoute?'GET':'POST'))return send(res,404,{error:'not_found'});
  const received=now();let workload;
  try{workload=await verify(req.headers.authorization);}catch{return send(res,401,{error:'unauthorized'});}
  if(req.aborted||res.destroyed)return;
  const controller=new AbortController();const abort=()=>controller.abort();
  req.once?.('aborted',abort);res.once?.('close',abort);
  const raw=req.headers['x-mw-wake-deadline'];
  const deadline=typeof raw==='string'&&/^\d{13}$/.test(raw)?Math.min(received+14000,Number(raw)-1000):received;
  try{
   let input;
   if(statusRoute){
    if(req.headers['transfer-encoding']||Number(req.headers['content-length']??0)!==0)return send(res,400,{error:'invalid_request'});
   }else{
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))return send(res,400,{error:'invalid_request'});
    req.setTimeout?.(10000,()=>req.destroy());const chunks=[];let size=0;
    try{
     for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>524288)return send(res,413,{error:'invalid_request'});chunks.push(bytes);}
     input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
    }catch{return send(res,400,{error:'invalid_request'});}finally{req.setTimeout?.(0);}
    const keys=route==='catalogue'?['version','actorPartnerId','scope','resource']:route==='query'?['version','actorPartnerId','scope','resource','columns','predicate','limit']:['version','actorPartnerId','kind','command'];
    if(!exact(input,keys)||input.version!==1||!identifier(input.actorPartnerId))return send(res,400,{error:'invalid_request'});
    if(route!=='commands'&&(!['oltp','olap'].includes(input.scope)||(route==='catalogue'&&input.resource===null?false:!identifier(input.resource))))return send(res,400,{error:'invalid_request'});
    if(route==='query'&&(!Array.isArray(input.columns)||input.columns.length<1||input.columns.length>256||new Set(input.columns).size!==input.columns.length||input.columns.some(value=>!identifier(value))||!Number.isInteger(input.limit)||input.limit<1||input.limit>1001))return send(res,400,{error:'invalid_request'});
    if(route==='commands'&&(!['payment','operation','borrower'].includes(input.kind)||!input.command||typeof input.command!=='object'||Array.isArray(input.command)))return send(res,400,{error:'invalid_request'});
   }
   if(controller.signal.aborted||req.aborted||res.destroyed)return;
   const context={workload,deadline,signal:controller.signal};
   const result=statusRoute?await providers.status(context,requestId):await providers[route](context,input);
   if(!res.destroyed)send(res,result.status??200,result.value??result);
  }catch(error){
   const denied=error?.message==='access_denied'||error?.code==='42501';
   const invalid=['invalid_request','invalid_agent_query','unsupported_native_capability'].includes(error?.message);
   if(!res.destroyed)send(res,denied?403:invalid?400:503,{error:denied?'access_denied':invalid?error.message:'native_api_unavailable'});
  }finally{req.removeListener?.('aborted',abort);res.removeListener?.('close',abort);}
 };
}
