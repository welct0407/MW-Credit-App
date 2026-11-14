// R159: offline dataset reads run in three lanes per pool, each with its own FIFO queue, so a short request (an
// unchanged check, a row delta, a notification bundle) never waits behind a walk chunk or a reconciliation. The lanes
// hold at most 4 of the command pool's 6 connections (services/lib/pool.mjs); the rest stay for pages and commands.
// Command and notification bundles share the lanes of their pool.
export const OFFLINE_READ_LANES=Object.freeze({light:2,walk:1,reconcile:1});
/** A queue wait at or above this is logged by the caller (offline_read_wait). */
export const OFFLINE_READ_WAIT_LOG_MS=3000;
const pools=new WeakMap();
function laneState(pool,lane){
 let lanes=pools.get(pool);if(!lanes){lanes=new Map();pools.set(pool,lanes)}
 let state=lanes.get(lane);if(!state){state={active:0,queue:[]};lanes.set(lane,state)}
 return state;
}
/**
 * Runs work in a lane of the pool. wait:false rejects with offline_read_busy when the lane is full; unless names lanes
 * that must be idle (nothing running, nothing queued), else the same rejection. A cancelled request leaves the queue
 * before any database access. work receives {lane,waitMs}, the time it spent queued.
 * @template T
 * @param {object} pool
 * @param {AbortSignal|undefined} signal
 * @param {(slot:{lane:string,waitMs:number})=>Promise<T>} work
 * @param {{lane?:'light'|'walk'|'reconcile',wait?:boolean,unless?:string[]}} [options]
 * @returns {Promise<T>}
 */
export async function withOfflineReadSlot(pool,signal,work,{lane='light',wait=true,unless=[]}={}){
 const limit=OFFLINE_READ_LANES[lane];if(!limit)throw Error('invalid_lane');
 const state=laneState(pool,lane),queued=Date.now();
 if(signal?.aborted)throw Error('offline_read_cancelled');
 if(unless.some(name=>{const other=pools.get(pool).get(name);return !!other&&(other.active>0||other.queue.length>0)}))throw Error('offline_read_busy');
 if(!wait&&state.active>=limit)throw Error('offline_read_busy');
 const release=()=>{state.active--;const next=state.queue.shift();if(next)next()};
 await new Promise((resolve,reject)=>{
  const cancel=()=>{const index=state.queue.indexOf(start);if(index>=0)state.queue.splice(index,1);reject(Error('offline_read_cancelled'))};
  const start=()=>{signal?.removeEventListener('abort',cancel);state.active++;if(signal?.aborted){reject(Error('offline_read_cancelled'));release();return}resolve(undefined)};
  if(state.active>=limit){state.queue.push(start);signal?.addEventListener('abort',cancel,{once:true})}else start();
 });
 try{if(signal?.aborted)throw Error('offline_read_cancelled');return await work({lane,waitMs:Date.now()-queued})}finally{release()}
}
export function offlineReadClient(client,signal){let tail=Promise.resolve();return {query(...args){const next=tail.then(()=>{if(signal?.aborted)throw Error('offline_read_cancelled');return client.query(...args)});tail=next.catch(()=>{});return next}}}
