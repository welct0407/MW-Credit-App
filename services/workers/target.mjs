export function createWorkerConnectionGuard(config){
 return async client=>{
  const r=(await client.query(`SELECT current_database() AS database,current_user AS principal,session_user AS session,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,
   pg_has_role(session_user,$1,'USAGE') AS capability,
   EXISTS(SELECT 1 FROM pg_roles p WHERE p.rolname<>session_user AND p.rolname NOT IN ($1,'cloudsqliamserviceaccount') AND pg_has_role(session_user,p.oid,'MEMBER')) AS other_membership
   FROM pg_roles r WHERE r.rolname=session_user`,[config.capability])).rows[0];
  if(!r||r.database!==config.database||r.principal!==config.dbUser||r.session!==config.dbUser||!r.rolcanlogin||r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls||!r.capability||r.other_membership)throw Error('worker_database_identity_unavailable');
 };
}
