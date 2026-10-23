/** R090 chat service entry: node services/chat/server.mjs (the existing API image, a fifth Cloud Run service). */
import http from 'node:http';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {createChatRuntime} from './runtime.mjs';
import {createVertexTransport} from './gemini.mjs';
import {createIamPool} from '../lib/pool.mjs';
import {BUDGET} from '../lib/budget.mjs';
import {log,logRecord} from '../lib/log.mjs';

let closeConnector;
const runtime=await createChatRuntime(process.env,{initializeApp,applicationDefault,getAuth,
 completionLogger:record=>logRecord(record),
 log:record=>log(record.event==='chat_turn'&&record.ok?'INFO':'WARNING',record.event,record),
 async createPool(config){
  // Modules load and the connector starts only after the complete configuration validated.
  const {pool,close}=await createIamPool({...config,max:BUDGET.chat.poolMax});closeConnector=close;return pool;
 },
 async createVertexTransport(config){
  const {GoogleAuth}=await import('google-auth-library');
  const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
  return createVertexTransport({projectId:config.projectId,location:config.chat.location,getToken:async()=>(await auth.getAccessToken())??''});
 }});
const server=http.createServer(runtime.handler);
server.requestTimeout=BUDGET.chat.httpRequestTimeoutMs;server.headersTimeout=BUDGET.chat.headersTimeoutMs;
server.listen(Number(process.env.PORT||8080),'0.0.0.0');
process.on('SIGTERM',()=>server.close(async()=>{await runtime.close();closeConnector?.();process.exit(0);}));
