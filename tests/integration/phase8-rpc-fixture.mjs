import pg from 'pg';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createWorkerConnectionGuard} from '../../services/workers/target.mjs';
export async function phase8RpcPools(admin){
 assert.equal(process.env.PHASE8_TEST_DISPOSABLE,'1');assert.equal(process.env.PHASE8_TEST_DATABASE,'loan_manager_dev');assert.equal(process.env.PHASE8_TEST_HOST,'127.0.0.1');
 const result={};for(const [kind,capability]of Object.entries({api:'mw_notify_api_dev',dispatch:'mw_notify_dispatch_dev',jobs:'mw_jobs_dev'})){
  const user='c_phase8_rpc_'+kind;
  if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[user])).rowCount){await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT ${capability} TO ${user} WITH INHERIT TRUE, SET FALSE, ADMIN FALSE; GRANT USAGE ON SCHEMA public TO ${user}`);if(kind==='api')await admin.query(`GRANT SELECT("Row ID","Login Email") ON public."Partners" TO ${user}`);}
  result[kind+'Pool']=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PHASE8_TEST_PORT),database:'loan_manager_dev',user,max:3});result[kind+'Guard']=createWorkerConnectionGuard({database:'loan_manager_dev',dbUser:user,capability});
 }
 const manifest=JSON.parse(await readFile('outputs/r053-notifications-jobs/jobs-owner-reviewed-dependencies.json','utf8'));
 for(const privilege of ['select','insert','update'])for(const [relation,cols]of Object.entries(manifest[privilege]))await admin.query(`GRANT ${privilege.toUpperCase()}${cols?'('+cols.map(c=>'"'+c+'"').join(',')+')':''} ON public."${relation}" TO mw_jobs_owner_dev`);
 result.close=()=>Promise.all(['api','dispatch','jobs'].map(kind=>result[kind+'Pool'].end()));return result;
}
