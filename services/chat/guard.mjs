/** Connection guard of the chat service (R090), checked on every transaction like services/lib/connection-guard.mjs:
 * exact database and IAM login, no elevated attributes, inherited membership of mw_chat_api_<env> (RPC EXECUTE) and
 * SET-only membership of mw_chat_read_<env> (INHERIT FALSE: native reads, the membership lookup and sql_query SET it
 * inside their transactions), and no membership of the chat owner, the application
 * or journal-owner roles, a registered creator or any role of the other environment. Grants nothing. */
const FOREIGN=Object.freeze({dev:['mw_app_prod','mw_app_prod_journal_owner','mw_chat_owner_prod','mw_chat_api_prod','mw_chat_read_prod'],
 prod:['mw_app_dev','mw_app_dev_journal_owner','mw_chat_owner_dev','mw_chat_api_dev','mw_chat_read_dev']});
export const chatRoles=environment=>Object.freeze({owner:`mw_chat_owner_${environment}`,api:`mw_chat_api_${environment}`,read:`mw_chat_read_${environment}`});
export function createChatConnectionGuard(config){
 const foreign=FOREIGN[config?.environment];
 if(!foreign||config.serviceRole!=='chat'||typeof config.database!=='string'||typeof config.dbUser!=='string'||typeof config.applicationRole!=='string'
  ||typeof config.journalOwnerRole!=='string'||!Array.isArray(config.registeredCreators)||!config.registeredCreators.length)throw Error('Invalid database target');
 const roles=chatRoles(config.environment);
 return async client=>{
  const rows=(await client.query(`SELECT current_database() AS database,current_user AS principal,session_user AS session,
   rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
   pg_has_role(session_user,$1,'USAGE') AS api_member,pg_has_role(session_user,$2,'SET') AS read_member,pg_has_role(session_user,$2,'USAGE') AS read_inherited,pg_has_role(session_user,$3,'MEMBER') AS owner_member,
   pg_has_role(session_user,$4,'MEMBER') AS app_member,pg_has_role(session_user,$5,'MEMBER') AS journal_member,
   EXISTS(SELECT 1 FROM pg_roles creator WHERE creator.rolname=ANY($6::text[]) AND pg_has_role(session_user,creator.oid,'MEMBER')) AS creator_member,
   EXISTS(SELECT 1 FROM pg_roles other WHERE other.rolname=ANY($7::text[]) AND pg_has_role(session_user,other.oid,'MEMBER')) AS foreign_member
   FROM pg_roles WHERE rolname=session_user`,[roles.api,roles.read,roles.owner,config.applicationRole,config.journalOwnerRole,config.registeredCreators,foreign])).rows;
  const r=rows[0];
  if(rows.length!==1||r.database!==config.database||r.principal!==config.dbUser||r.session!==config.dbUser||r.rolcanlogin!==true||r.rolsuper||r.rolcreatedb||r.rolcreaterole
   ||r.rolreplication||r.rolbypassrls||r.api_member!==true||r.read_member!==true||r.read_inherited!==false||r.owner_member!==false||r.app_member!==false||r.journal_member!==false
   ||r.creator_member!==false||r.foreign_member!==false)throw Error('Database identity unavailable');
 };
}
