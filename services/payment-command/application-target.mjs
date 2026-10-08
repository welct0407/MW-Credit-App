import { assertDisposable } from '../../scripts/rehearsal/payment-command.mjs';
const issued=new WeakSet();
export async function attestDisposableApplicationTarget({adminPool,expectedDirectory,runtimeUser,registeredCreators=['postgres']}) {
 if(typeof runtimeUser!=='string'||!/^mw_app_dev_[a-z0-9_]+$/.test(runtimeUser)||runtimeUser==='mw_app_dev_journal_owner')throw Error('Explicit disposable application login required');
 if(!Array.isArray(registeredCreators)||!registeredCreators.length||registeredCreators.some(x=>typeof x!=='string'||!x))throw Error('Registered creators required');
 await assertDisposable(adminPool,expectedDirectory,79);
 const creatorMember=(await adminPool.query("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=ANY($2::text[]) AND pg_has_role($1,oid,'MEMBER')) AS forbidden",[runtimeUser,registeredCreators])).rows[0];
 if(creatorMember.forbidden)throw Error('Runtime must not inherit migration creators');
 const target=(await adminPool.query('SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port')).rows[0];
 const role=(await adminPool.query("SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,pg_has_role(oid,'mw_app_dev','MEMBER') AS member,pg_has_role(oid,'mw_app_dev_journal_owner','MEMBER') AS owner_member FROM pg_roles WHERE rolname=$1",[runtimeUser])).rows[0];
 if(!role?.rolcanlogin||role.rolsuper||role.rolcreatedb||role.rolcreaterole||role.rolreplication||role.rolbypassrls||!role.member||role.owner_member)throw Error('Unsafe application login');
 const proof=Object.freeze({...target,runtimeUser,registeredCreators:Object.freeze([...registeredCreators])});issued.add(proof);return proof;
}
export function applicationConnectionGuard(proof){
 if(!issued.has(proof))throw Error('Verified disposable target required');
 return async client=>{
  const creatorMember=(await client.query("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=ANY($1::text[]) AND pg_has_role(session_user,oid,'MEMBER')) AS forbidden",[proof.registeredCreators])).rows[0];
  if(creatorMember.forbidden)throw Error('Runtime must not inherit migration creators');
  const row=(await client.query("SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,current_user AS principal,session_user AS session,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,pg_has_role(session_user,'mw_app_dev','MEMBER') AS member,pg_has_role(session_user,'mw_app_dev_journal_owner','MEMBER') AS owner_member FROM pg_roles WHERE rolname=session_user")).rows[0];
  if(!row||row.database!==proof.database||row.host!==proof.host||row.port!==proof.port||row.principal!==proof.runtimeUser||row.session!==proof.runtimeUser||!row.rolcanlogin||row.rolsuper||row.rolcreatedb||row.rolcreaterole||row.rolreplication||row.rolbypassrls||!row.member||row.owner_member)throw Error('Application target mismatch');
 };
}
