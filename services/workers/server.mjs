import {createNotificationIdentityLookup} from '../notifications/identity.mjs';
import http from 'node:http';
import {OAuth2Client} from 'google-auth-library';
import {createIamPool} from '../lib/pool.mjs';
import {log} from '../lib/log.mjs';
import {createWorkerRuntime} from './runtime.mjs';
let closeConnector,auth,oidc;
const runtime=await createWorkerRuntime(process.env,{
 async createPool(config){if(config.role==='notify')auth=createNotificationIdentityLookup(config.projectId);const jobs=config.role==='jobs';const {pool,close}=await createIamPool({instance:config.instance,dbUser:config.dbUser,database:config.database,connectMs:5000,statementMs:jobs?100000:5000,queryMs:jobs?105000:8000});closeConnector=close;return pool;},
 getUser:(subject,options)=>auth(subject,options),
 async verifyOidc(idToken,audience){oidc??=new OAuth2Client();return(await oidc.verifyIdToken({idToken,audience})).getPayload();},
 log:record=>log(record.event==='failed'?'WARNING':'INFO',record.event,record)
});
const server=http.createServer(runtime.handler);server.requestTimeout=120000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT||8080),'0.0.0.0');
process.on('SIGTERM',()=>{server.close();void runtime.close().finally(()=>{closeConnector?.();process.exit(0);});});
