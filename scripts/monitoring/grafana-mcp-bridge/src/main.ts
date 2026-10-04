import { GoogleAuth } from 'google-auth-library';
import { inspectMonitoring, monitoringSeries } from './monitoring.js';
import { Firestore } from '@google-cloud/firestore';
import { loadConfig } from './config.js';
import { FirestoreStore } from './store.js';
import { safeCallback, logEvent } from './security.js';
import { createApp } from './app.js';

try {
  const config=loadConfig();
  const store=new FirestoreStore(new Firestore({projectId:config.projectId,databaseId:config.databaseId}));
  if(process.env.MONITORING_ENABLED!==undefined&&!['true','false'].includes(process.env.MONITORING_ENABLED))throw new Error();
  const enabled=process.env.MONITORING_ENABLED==='true';
  const auth=enabled?new GoogleAuth({scopes:['https://www.googleapis.com/auth/monitoring.write']}):undefined;
  const monitor=enabled?async()=>{
    const now=Date.now();
    const owner=config.ownerEnabled&&(await store.get('control/owner'))?.enabled!==false;
    const snapshot=await inspectMonitoring(store,owner,now,now);
    const client=await auth!.getClient();
    await client.request({url:'https://monitoring.googleapis.com/v3/projects/'+config.projectId+'/timeSeries',method:'POST',data:monitoringSeries(snapshot,config.projectId,now),timeout:10000});
  }:undefined;
  const app=createApp(config,store,safeCallback(config.callbackHosts),{monitor});
  const port=Number(process.env.PORT ?? 8080);
  if(!Number.isInteger(port) || port<1 || port>65535)throw new Error();
  app.server.listen(port,'0.0.0.0',()=>logEvent('bridge_started'));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
    app.server.close(()=>{void app.mcp.close().then(()=>process.exit(0));});
    setTimeout(()=>process.exit(1),10_000).unref();
  });
} catch {logEvent('startup_failed');process.exitCode=1;}
