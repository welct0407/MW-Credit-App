import {createNotificationIdentityLookup} from '../notifications/identity.mjs';
import http from 'node:http';
import {OAuth2Client} from 'google-auth-library';
import {Connector,AuthTypes,IpAddressTypes} from '@google-cloud/cloud-sql-connector';
import pg from 'pg';
import {createWorkerRuntime} from './runtime.mjs';
let connector,auth,oidc;
const runtime=await createWorkerRuntime(process.env,{
 async createPool(config){connector=new Connector();const options=await connector.getOptions({instanceConnectionName:config.instance,ipType:IpAddressTypes.PUBLIC,authType:AuthTypes.IAM});if(config.role==='notify')auth=createNotificationIdentityLookup(config.projectId);return new pg.Pool({...options,user:config.dbUser,database:config.database,max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:config.role==='jobs'?100000:5000,query_timeout:config.role==='jobs'?105000:8000});},
 getUser:(subject,options)=>auth(subject,options),
 async verifyOidc(idToken,audience){oidc??=new OAuth2Client();return(await oidc.verifyIdToken({idToken,audience})).getPayload();},
 log:record=>console.log(JSON.stringify(record))
});
const server=http.createServer(runtime.handler);server.requestTimeout=120000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT||8080),'0.0.0.0');
process.on('SIGTERM',()=>{server.close();void runtime.close().finally(()=>{connector?.close();process.exit(0);});});
