/** Asks the controlling worker for its build version (sw.js GET_BUILD_VERSION, as usePwa does); null when absent, invalid or slow. */
export function readRunningBuildVersion(worker:Pick<ServiceWorker,'postMessage'>|null|undefined=typeof navigator==='undefined'?null:navigator.serviceWorker?.controller,timeoutMs=3000):Promise<string|null>{
 if(!worker)return Promise.resolve(null);
 return new Promise(resolve=>{
  const channel=new MessageChannel(),timer=setTimeout(()=>finish(null),timeoutMs);
  function finish(value:string|null){clearTimeout(timer);channel.port1.onmessage=null;channel.port1.close();resolve(value)}
  channel.port1.onmessage=event=>{const version=event.data?.version;finish(typeof version==='string'&&/^[a-f0-9]{24}$/.test(version)?version:null)};
  try{worker.postMessage({type:'GET_BUILD_VERSION'},[channel.port2])}catch{finish(null)}
 });
}
