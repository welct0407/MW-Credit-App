/** Notification payloads are ignored. SQL notification is only a wake-up hint. */
export async function createNotificationWakeup({createListener,guardConnection,run,log=()=>{},retryMs=1000}){
 let stopped=false,listener=null,reconnectTimer=null,drainTimer=null,draining=null,pending=false,connecting=null,failures=0;
 const safeLog=(event)=>log({component:'notify',event});
 function wake(){
  if(stopped)return;
  pending=true;
  if(!draining&&!drainTimer){drainTimer=setTimeout(()=>{drainTimer=null;draining=drain().finally(()=>{draining=null;if(pending)wake();});},0);}
 }
 async function drain(){
  while(pending&&!stopped){
   pending=false;
   try{
    const result=await run();
    // A full claim or successful enqueue can leave immediately runnable work.
    // Deferred identity lookups alone must not spin on the same candidate page.
    if(result.claimed===10||result.enqueued>0)pending=true;
    safeLog('drain_completed');
   }catch{safeLog('drain_failed');break;}
   if(pending&&!stopped)await new Promise(resolve=>setTimeout(resolve,0));
  }
 }
 function reconnect(){
  if(stopped||reconnectTimer)return;
  const delay=Math.min(30000,retryMs*2**Math.min(failures++,5))+Math.floor(Math.random()*250);
  reconnectTimer=setTimeout(()=>{reconnectTimer=null;connecting=connect().finally(()=>{connecting=null;});},delay);
 }
 async function connect(){
  if(stopped)return;
  let client;
  try{
   client=await createListener();
   if(stopped){await client.end();return;}
   listener=client;
   let lost=false;
   const onLost=()=>{if(lost)return;lost=true;if(listener===client)listener=null;safeLog('listener_disconnected');void client.end().catch(()=>{});reconnect();};
   client.on('error',onLost);client.on('end',onLost);
   client.on('notification',message=>{if(message.channel==='mw_pwa_notifications_v1')wake();});
   await client.connect();await guardConnection(client);
   // Autocommit LISTEN first; durable scan second closes startup/reconnect gaps.
   await client.query('LISTEN mw_pwa_notifications_v1');
   if(stopped){await client.end();return;}
   failures=0;safeLog('listener_connected');wake();
  }catch{if(listener===client)listener=null;try{await client?.end();}catch{}safeLog('listener_connect_failed');reconnect();}
 }
 // Startup does not require the listener to be available; recovery HTTP remains usable.
 connecting=connect().finally(()=>{connecting=null;});
 return{
  wake,
  async close(){stopped=true;pending=false;clearTimeout(reconnectTimer);clearTimeout(drainTimer);await connecting;try{await listener?.end();}catch{}await draining;},
  get stopped(){return stopped;}
 };
}
