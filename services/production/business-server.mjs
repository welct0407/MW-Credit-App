import http from 'node:http';
import { initializeApp,applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createProductionBusinessRuntime } from './business-runtime.mjs';
import { createIamPool } from '../lib/pool.mjs';
import { BUDGET } from '../lib/budget.mjs';
import { PROJECT_ID } from '../lib/identity.mjs';
import { logRecord } from '../lib/log.mjs';
let closeConnector;
const runtime=await createProductionBusinessRuntime(process.env,{initializeApp,applicationDefault,getAuth,async createStorage(){const {Storage}=await import('@google-cloud/storage');return new Storage({projectId:PROJECT_ID})},completionLogger:record=>logRecord(record),async createPool(config){
  // Dynamic imports and connector creation happen only after complete candidate config/policy validation.
  const {pool,close}=await createIamPool(config);closeConnector=close;return pool;
}});
const server=http.createServer(runtime.handler);server.requestTimeout=BUDGET.httpRequestTimeoutMs;server.headersTimeout=BUDGET.headersTimeoutMs;
server.listen(Number(process.env.PORT||8080),'0.0.0.0');
process.on('SIGTERM',()=>server.close(async()=>{await runtime.close();closeConnector?.();process.exit(0);}));
