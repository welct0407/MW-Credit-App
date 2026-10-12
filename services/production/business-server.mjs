import http from 'node:http';
import { initializeApp,applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createProductionBusinessRuntime } from './business-runtime.mjs';
let connector;
const runtime=await createProductionBusinessRuntime(process.env,{initializeApp,applicationDefault,getAuth,async createStorage(){const {Storage}=await import('@google-cloud/storage');return new Storage({projectId:'clever-oasis-508610-n7'})},completionLogger:r=>console.log(JSON.stringify(r)),async createPool(config){
  // Dynamic imports and connector creation happen only after complete candidate config/policy validation.
  const [{Connector,AuthTypes,IpAddressTypes},{default:pg}]=await Promise.all([import('@google-cloud/cloud-sql-connector'),import('pg')]);
  connector=new Connector();
  const options=await connector.getOptions({instanceConnectionName:config.instance,ipType:IpAddressTypes.PUBLIC,authType:AuthTypes.IAM});
  return new pg.Pool({...options,user:config.dbUser,database:config.database,max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:config.serviceRole==='reader'?5000:10000,query_timeout:config.serviceRole==='reader'?7000:12000});
}});
const server=http.createServer(runtime.handler);server.requestTimeout=20000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT||8080),'0.0.0.0');
process.on('SIGTERM',()=>server.close(async()=>{await runtime.close();connector?.close();process.exit(0);}));
