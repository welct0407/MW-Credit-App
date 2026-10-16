import {BUDGET} from './budget.mjs';
const defaultModules=()=>Promise.all([import('@google-cloud/cloud-sql-connector'),import('pg')]).then(([connector,pg])=>({connector,pg:pg.default}));
/**
 * IAM-authenticated Cloud SQL pool with the request budget (lib/budget.mjs).
 * Modules are imported only after the caller has validated its configuration.
 * Callers with a longer budget (scheduled jobs) pass explicit millisecond overrides.
 * The command service (offline dataset walks plus writes) keeps 4 connections; every
 * other service keeps 2, within the shared Cloud SQL max_connections budget.
 * @param {{instance:string,dbUser:string,database:string,serviceRole?:string,max?:number,connectMs?:number,statementMs?:number,queryMs?:number}} options
 * @param {() => Promise<{connector:any,pg:any}>} [loadModules]
 */
export async function createIamPool({instance,dbUser,database,serviceRole,max=serviceRole==='command'?4:2,connectMs=BUDGET.connectMs,statementMs=BUDGET.statementMs[serviceRole],queryMs=BUDGET.queryMs[serviceRole]},loadModules=defaultModules) {
  if(!Number.isSafeInteger(statementMs)||!Number.isSafeInteger(queryMs)||queryMs<=statementMs)throw Error('Invalid database budget');
  const {connector:{Connector,AuthTypes,IpAddressTypes},pg}=await loadModules();
  const connector=new Connector();
  try{
    const options=await connector.getOptions({instanceConnectionName:instance,ipType:IpAddressTypes.PUBLIC,authType:AuthTypes.IAM});
    const pool=new pg.Pool({...options,user:dbUser,database,max,connectionTimeoutMillis:connectMs,idleTimeoutMillis:30000,statement_timeout:statementMs,query_timeout:queryMs});
    return {pool,close:()=>connector.close()};
  }catch(error){connector.close();throw error;}
}
