import {BUDGET} from './budget.mjs';
export const IDLE_COMMAND_MS=600000,IDLE_DEFAULT_MS=30000;
const defaultModules=()=>Promise.all([import('@google-cloud/cloud-sql-connector'),import('pg')]).then(([connector,pg])=>({connector,pg:pg.default}));
/**
 * IAM-authenticated Cloud SQL pool with the request budget (lib/budget.mjs).
 * Modules are imported only after the caller has validated its configuration.
 * Callers with a longer budget (scheduled jobs) pass explicit millisecond overrides.
 * The command service (offline dataset walks plus writes) keeps 4 connections; every
 * other service keeps 2, within the shared Cloud SQL max_connections budget.
 * R078: the command service keeps idle connections for 10 minutes (others 30 s) so a 30-second
 * dataset poll does not open a new IAM connector connection per request. Limits checked: the
 * instance sets no idle_session_timeout (flags: cloudsql.iam_authentication, max_connections);
 * the connector's IAM token and ephemeral certificate are used only at connect time; TCP
 * keepalive (60 s) keeps an idle connection from being dropped silently on the egress path.
 * An idle connection that still fails is removed by pg and reported to the pool 'error'
 * listener instead of crashing the process; the next checkout opens a fresh connection.
 * @param {{instance:string,dbUser:string,database:string,serviceRole?:string,max?:number,connectMs?:number,statementMs?:number,queryMs?:number}} options
 * @param {() => Promise<{connector:any,pg:any}>} [loadModules]
 */
export async function createIamPool({instance,dbUser,database,serviceRole,max=serviceRole==='command'?4:2,connectMs=BUDGET.connectMs,statementMs=BUDGET.statementMs[serviceRole],queryMs=BUDGET.queryMs[serviceRole]},loadModules=defaultModules) {
  if(!Number.isSafeInteger(statementMs)||!Number.isSafeInteger(queryMs)||queryMs<=statementMs)throw Error('Invalid database budget');
  const {connector:{Connector,AuthTypes,IpAddressTypes},pg}=await loadModules();
  const connector=new Connector();
  try{
    const options=await connector.getOptions({instanceConnectionName:instance,ipType:IpAddressTypes.PUBLIC,authType:AuthTypes.IAM});
    const pool=new pg.Pool({...options,user:dbUser,database,max,connectionTimeoutMillis:connectMs,idleTimeoutMillis:serviceRole==='command'?IDLE_COMMAND_MS:IDLE_DEFAULT_MS,keepAlive:true,keepAliveInitialDelayMillis:60000,statement_timeout:statementMs,query_timeout:queryMs});
    pool.on?.('error',()=>{});
    return {pool,close:()=>connector.close()};
  }catch(error){connector.close();throw error;}
}
