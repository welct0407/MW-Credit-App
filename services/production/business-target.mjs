export function createProductionConnectionGuard(config) {
  return async client=>{
    const rows=(await client.query(`SELECT current_database() AS database,current_user AS principal,session_user AS session,
      rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
      pg_has_role(session_user,$1,'MEMBER') AS member,pg_has_role(session_user,$2,'MEMBER') AS owner_member,
      EXISTS(SELECT 1 FROM pg_roles creator WHERE creator.rolname=ANY($3::text[]) AND pg_has_role(session_user,creator.oid,'MEMBER')) AS creator_member,
      EXISTS(SELECT 1 FROM pg_roles dev WHERE dev.rolname IN ('mw_app_dev','mw_app_dev_journal_owner') AND pg_has_role(session_user,dev.oid,'MEMBER')) AS dev_member
      FROM pg_roles WHERE rolname=session_user`,[config.applicationRole,config.journalOwnerRole,config.registeredCreators])).rows;
    const r=rows[0];
    if(rows.length!==1||r.database!==config.database||r.principal!==config.dbUser||r.session!==config.dbUser||r.rolcanlogin!==true||r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls||r.owner_member||r.creator_member||r.dev_member!==false||(config.serviceRole==='command'?r.member!==true:r.member!==false))throw Error('Production database identity unavailable');
  };
}
