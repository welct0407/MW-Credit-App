// The small application pool keeps one connection available for active pages
// and commands. Command and notification bundles share this reservation.
const slots=new WeakMap();
export async function withOfflineReadSlot(pool,signal,work){
 let state=slots.get(pool);if(!state){state={busy:false,queue:[]};slots.set(pool,state)}
 const release=()=>{state.busy=false;const next=state.queue.shift();if(next)next()};
 await new Promise((resolve,reject)=>{
  const cancel=()=>{const index=state.queue.indexOf(start);if(index>=0)state.queue.splice(index,1);reject(Error('offline_read_cancelled'))};
  const start=()=>{signal?.removeEventListener('abort',cancel);if(signal?.aborted){cancel();release();return;}state.busy=true;resolve()};
  if(signal?.aborted){cancel();return;}
  if(state.busy){state.queue.push(start);signal?.addEventListener('abort',cancel,{once:true})}else start();
 });
 try{if(signal?.aborted)throw Error('offline_read_cancelled');return await work()}finally{release()}
}
export function offlineReadClient(client,signal){let tail=Promise.resolve();return {query(...args){const next=tail.then(()=>{if(signal?.aborted)throw Error('offline_read_cancelled');return client.query(...args)});tail=next.catch(()=>{});return next}}}
