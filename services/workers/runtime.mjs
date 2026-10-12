import {loadWorkerConfig} from './config.mjs';
import {createWorkerConnectionGuard} from './target.mjs';
import {createNotificationWorker} from '../notifications/worker.mjs';
import {createCanonicalJobRunner} from '../jobs/runner.mjs';
export function scheduledBoundary(value){
 // Scheduler supplies RFC3339, which permits numeric UTC offsets as well as Z.
 const match=typeof value==='string'&&/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
 if(!match||Number(match[4]??0)>23||Number(match[5]??0)>59)throw Error('invalid_schedule_time');
 const offset=match[2]==='Z'?0:(match[3]==='-'?-1:1)*(Number(match[4])*60+Number(match[5]))*60000;
 const instant=new Date(value);
 if(!Number.isFinite(instant.getTime())||new Date(instant.getTime()+offset).toISOString().slice(0,19)!==match[1])throw Error('invalid_schedule_time');
 const local=new Date(instant.getTime()+7*60*60*1000).toISOString();
 return{day:local.slice(0,10),hour:local.slice(11,13)};
}
/** No browser route or caller-selected SQL; OIDC audience and scheduler are exact. */
export async function createWorkerRuntime(env,dependencies){
 const config=loadWorkerConfig(env);
 const respond=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(!config)return{handler:(req,res)=>req.method==='GET'&&req.url==='/health'?respond(res,200,{status:'ok',enabled:false}):respond(res,503,{error:'worker_disabled'}),close:async()=>{}};
 const pool=await dependencies.createPool(config),guardConnection=createWorkerConnectionGuard(config);
 try{
  const client=await pool.connect();try{await guardConnection(client);}finally{client.release();}
  let stopping=false,requestStopped=true,deadline=0,requestAbort;
  const shouldStop=()=>stopping||requestStopped||Date.now()>=deadline;
  const run=config.role==='notify'?await createNotificationWorker({enabled:true,pool,guardConnection,policy:config.policy,getUser:dependencies.getUser,vapid:config.vapid,shouldStop,remainingMs:()=>Math.max(0,deadline-Date.now()),signal:()=>requestAbort?.signal}):createCanonicalJobRunner({enabled:true,pool,guardConnection});
  let active=false;
  const handler=async(req,res)=>{
   if(req.method==='GET'&&req.url==='/health')return respond(res,200,{status:'ok',enabled:true});
   const path=req.url,job=path==='/internal/jobs/daily-charges'?'daily-charges':path==='/internal/jobs/recent-analytics'?'recent-analytics':null;
   if(req.method!=='POST'||(config.role==='notify'?path!=='/internal/dispatch':!job))return respond(res,404,{error:'not_found'});
   let caller;
   try{const match=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'');if(!match)return respond(res,401,{error:'unauthorized'});const p=await dependencies.verifyOidc(match[1],config.audience);if(!p||p.aud!==config.audience||!['https://accounts.google.com','accounts.google.com'].includes(p.iss)||!config.callers.includes(p.email)||p.email_verified!==true)return respond(res,403,{error:'access_denied'});caller=p.email;}catch{return respond(res,401,{error:'unauthorized'});}
   if(req.aborted||res.destroyed)return;
   if(stopping)return respond(res,503,{error:'worker_stopping'});
   if(active)return respond(res,409,{error:'worker_busy'});
   if(req.headers['transfer-encoding']||Number(req.headers['content-length']??0)!==0){if(job)dependencies.log?.({component:config.role,event:'rejected',job,code:'empty_body_required'});return respond(res,400,{error:'empty_body_required'});}
   let intended=null;
   if(job){try{intended=scheduledBoundary(req.headers['x-cloudscheduler-scheduletime']);}catch{dependencies.log?.({component:config.role,event:'rejected',job,code:'invalid_schedule_time'});return respond(res,400,{error:'invalid_schedule_time'});}}
   const requestId=job?`${job}|${intended.day}|${job==='daily-charges'?'daily':'hour:'+intended.hour}`:null;
   if(config.role==='notify'){
    const raw=req.headers['x-mw-wake-deadline'];
    if(caller!==config.scheduler&&(typeof raw!=='string'||!/^\d{13}$/.test(raw)))return respond(res,400,{error:'invalid_wake_deadline'});
    const local=Date.now()+(caller===config.scheduler?110000:15000);
    deadline=Math.min(local,raw===undefined?local:Number(raw))-1000;
    if(!Number.isFinite(deadline)||deadline<=Date.now())return respond(res,409,{error:'wake_deadline_expired'});
   }
   requestStopped=false;requestAbort=new AbortController();
   const expiry=config.role==='notify'?setTimeout(()=>requestAbort.abort(),Math.max(1,deadline-Date.now())):null;
   const disconnected=()=>{requestStopped=true;requestAbort.abort();};
   res.once?.('close',disconnected);req.once?.('aborted',disconnected);
   active=true;
   try{
    let result;
    if(config.role==='notify'){result=await run();}
    else{
     const c=await pool.connect();let clock;try{await guardConnection(c);clock=(await c.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS day,to_char(clock_timestamp() AT TIME ZONE 'Asia/Bangkok','HH24') AS hour,extract(epoch FROM clock_timestamp())*1000 AS milliseconds")).rows[0];}finally{c.release();}
     const lag=Number(clock.milliseconds)-Date.parse(req.headers['x-cloudscheduler-scheduletime']);
     if(!Number.isFinite(lag)||lag<0||lag>(job==='daily-charges'?3600000:600000)||clock.day!==intended.day||job==='recent-analytics'&&clock.hour!==intended.hour){dependencies.log?.({component:config.role,event:'rejected',job,requestId,code:'job_boundary_changed'});return respond(res,409,{error:'job_boundary_changed'});}
     result=await run({job,businessDate:intended.day,scope:job==='daily-charges'?'daily':'hour:'+intended.hour});
    }
    dependencies.log?.({component:config.role,event:'completed',job:job??'notifications',requestId});respond(res,200,result);
   }catch{dependencies.log?.({component:config.role,event:'failed',job:job??'notifications',requestId,code:'execution_failed'});respond(res,503,{error:'execution_failed'});}finally{clearTimeout(expiry);requestAbort.abort();requestStopped=true;res.removeListener?.('close',disconnected);req.removeListener?.('aborted',disconnected);active=false;}
  };
  return{handler,close:async()=>{stopping=true;requestAbort?.abort();await pool.end();}};
 }catch(error){await pool.end();throw error;}
}
