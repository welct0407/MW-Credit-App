import { Firestore } from '@google-cloud/firestore';
import { loadConfig } from './config.js';
import { FirestoreStore } from './store.js';
import { safeCallback, logEvent } from './security.js';
import { createApp } from './app.js';

try {
  const config=loadConfig();
  const app=createApp(config,new FirestoreStore(new Firestore({projectId:config.projectId,databaseId:config.databaseId})),safeCallback(config.callbackHosts));
  const port=Number(process.env.PORT ?? 8080);
  if(!Number.isInteger(port) || port<1 || port>65535)throw new Error();
  app.server.listen(port,'0.0.0.0',()=>logEvent('bridge_started'));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
    app.server.close(()=>{void app.mcp.close().then(()=>process.exit(0));});
    setTimeout(()=>process.exit(1),10_000).unref();
  });
} catch {logEvent('startup_failed');process.exitCode=1;}
