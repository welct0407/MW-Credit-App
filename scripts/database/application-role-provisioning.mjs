// Operator-managed DEV capability prerequisites; migrations never create roles.
const APP='mw_app_dev',OWNER='mw_app_dev_journal_owner';
const ident=s=>'"'+s.replaceAll('"','""')+'"';
async function operator(client,config){
 if(!config||!['loan_manager_dev','payment_rehearsal'].includes(config.database)||!Array.isArray(config.creators)||!config.creators.length||config.creators.some(x=>typeof x!=='string'||!x))throw Error('Invalid registered DEV operator config');
 const {rows:[x]}=await client.query("SELECT current_database() database,session_user operator,r.rolsuper,r.rolcreaterole,r.rolbypassrls,has_schema_privilege(session_user,'public','CREATE') schema_create FROM pg_roles r WHERE r.rolname=session_user");
 if(x.database!==config.database||!config.creators.includes(x.operator)||x.rolsuper||!x.rolcreaterole||x.rolbypassrls||!x.schema_create)throw Error('True nonsuperuser registered migration operator required');
 return x.operator;
}
async function execute(client,statements,apply){if(apply){await client.query('BEGIN');try{for(const sql of statements)await client.query(sql);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}}}
export async function prepareApplicationRoles(client,config,{apply=false}={}){
 const name=await operator(client,config);
 const existing=await client.query('SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])',[[APP,OWNER]]);
 if(existing.rowCount)throw Error('Application role package already exists; inspect private provisioning evidence before recovery or continuation');
 const statements=[
  `CREATE ROLE ${ident(APP)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`,
  `CREATE ROLE ${ident(OWNER)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`,
  `GRANT ${ident(APP)} TO ${ident(OWNER)} WITH ADMIN FALSE, INHERIT TRUE, SET FALSE`,
  `GRANT ${ident(OWNER)} TO ${ident(name)} WITH INHERIT TRUE, SET TRUE`,
  `GRANT USAGE, CREATE ON SCHEMA public TO ${ident(OWNER)}`
 ];
 await execute(client,statements,apply);
 return {mode:apply?'applied':'plan',database:config.database,operator:name,statements,temporaryAuthority:'journal-owner temporary INHERIT/SET membership and public-schema CREATE until exact V79 transfer is verified; no runtime membership'};
}
export async function finalizeApplicationRoleProvisioning(client,config,{apply=false}={}){
 const name=await operator(client,config);
 const roles=await client.query('SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[])',[[APP,OWNER]]);
 if(roles.rowCount!==2||roles.rows.some(x=>x.rolcanlogin||x.rolsuper||x.rolcreatedb||x.rolcreaterole||x.rolreplication||x.rolbypassrls))throw Error('Application role flags differ from reviewed package');
 const funcs=await client.query("SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.prosecdef FROM pg_proc p WHERE p.oid IN (to_regprocedure('public.pwa_submit_selected_charges_v1(text)'),to_regprocedure('public.pwa_command_status_v1(uuid,text,text)'))");
 if(funcs.rowCount!==2||funcs.rows.some(x=>x.owner!==OWNER||!x.prosecdef))throw Error('Exact V79 definer owner proof required before finalizing prerequisites');
 const history=await client.query("SELECT 1 FROM public.flyway_schema_history WHERE version='79' AND success");
 if(!history.rowCount)throw Error('Successful V79 history required');
 const statements=[`REVOKE CREATE ON SCHEMA public FROM ${ident(OWNER)}`,`GRANT ${ident(OWNER)} TO ${ident(name)} WITH INHERIT FALSE, SET FALSE`];
 await execute(client,statements,apply);
 return {mode:apply?'applied':'plan',database:config.database,operator:name,statements,remainingAuthority:'role creator ADMIN retained; operator SET/INHERIT disabled; journal owner public schema USAGE retained'};
}



export async function cleanupTemporaryApplicationRoleAuthority(client,config,{apply=false}={}){
 const name=await operator(client,config);
 const roles=await client.query('SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[])',[[APP,OWNER]]);
 if(roles.rowCount!==2||roles.rows.some(x=>x.rolcanlogin||x.rolsuper||x.rolcreatedb||x.rolcreaterole||x.rolreplication||x.rolbypassrls))throw Error('Cannot clean changed/missing capability package');
 const statements=[`REVOKE CREATE ON SCHEMA public FROM ${ident(OWNER)}`,`GRANT ${ident(OWNER)} TO ${ident(name)} WITH INHERIT FALSE, SET FALSE`];
 await execute(client,statements,apply);
 return {mode:apply?'temporary-authority-removed':'cleanup-plan',database:config.database,operator:name,statements,scope:'temporary operator authority only; retain applied history and role package, never automatic migration/data reversal'};
}
