/** Roles of the other environment; a runtime login must never inherit them. */
const FOREIGN_ROLES=Object.freeze({dev:Object.freeze(['mw_app_prod','mw_app_prod_journal_owner']),prod:Object.freeze(['mw_app_dev','mw_app_dev_journal_owner'])});
/**
 * Checked on every transaction: exact database and login, no elevated attributes, no creator or
 * journal-owner membership, no membership of the other environment, and application-role
 * membership only for the command service. Runtime identity checks grant nothing.
 */
export function createConnectionGuard(config) {
  const foreign=FOREIGN_ROLES[config?.environment];
  if(!foreign||!['reader','command'].includes(config.serviceRole)||typeof config.database!=='string'||typeof config.dbUser!=='string'
    ||typeof config.applicationRole!=='string'||typeof config.journalOwnerRole!=='string'||!Array.isArray(config.registeredCreators)||!config.registeredCreators.length)throw Error('Invalid database target');
  return async client=>{
    const rows=(await client.query(`SELECT current_database() AS database,current_user AS principal,session_user AS session,
      rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
      pg_has_role(session_user,$1,'MEMBER') AS member,pg_has_role(session_user,$2,'MEMBER') AS owner_member,
      EXISTS(SELECT 1 FROM pg_roles creator WHERE creator.rolname=ANY($3::text[]) AND pg_has_role(session_user,creator.oid,'MEMBER')) AS creator_member,
      EXISTS(SELECT 1 FROM pg_roles other WHERE other.rolname=ANY($4::text[]) AND pg_has_role(session_user,other.oid,'MEMBER')) AS foreign_member
      FROM pg_roles WHERE rolname=session_user`,[config.applicationRole,config.journalOwnerRole,config.registeredCreators,foreign])).rows;
    const r=rows[0];
    if(rows.length!==1||r.database!==config.database||r.principal!==config.dbUser||r.session!==config.dbUser||r.rolcanlogin!==true||r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls||r.owner_member||r.creator_member||r.foreign_member!==false||(config.serviceRole==='command'?r.member!==true:r.member!==false))throw Error('Database identity unavailable');
  };
}
