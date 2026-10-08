// Operator-managed DEV capability prerequisites; migrations never create roles.
const APP='mw_app_dev',OWNER='mw_app_dev_journal_owner';
const ident=s=>'"'+s.replaceAll('"','""')+'"';
async function operator(client,config){
 if(!config||!['loan_manager_dev','payment_rehearsal'].includes(config.database)||!Array.isArray(config.creators)||!config.creators.length||config.creators.some(x=>typeof x!=='string'||!x))throw Error('Invalid registered DEV operator config');
 const {rows:[x]}=await client.query("SELECT current_database() database,session_user operator,r.rolsuper,r.rolcreaterole,r.rolbypassrls,has_schema_privilege(session_user,'public','CREATE') schema_create FROM pg_roles r WHERE r.rolname=session_user");
 if(x.database!==config.database||!config.creators.includes(x.operator)||x.rolsuper||!x.rolcreaterole||x.rolbypassrls||!x.schema_create)throw Error('True nonsuperuser registered migration operator required');
 return x.operator;
}
async function execute(client,statements,apply,verify=null){if(apply){await client.query('BEGIN');try{for(const sql of statements)await client.query(sql);if(verify)await verify();await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}}}
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

// Closed existing-package authority paths; no fallback or runtime elevation.
async function maintenanceContext(client,config,name){
 const x=(await client.query("SELECT host(inet_server_addr()) host,inet_server_port() port,'mw_app_dev_journal_owner'::regrole::oid::int owner_id,session_user::regrole::oid::int operator_id")).rows[0];
 const schema=(await client.query("SELECT pg_get_userbyid(nspowner) grantor,nspowner::int grantor_id,pg_has_role(session_user,nspowner,'USAGE') owned FROM pg_namespace WHERE nspname='public'")).rows[0];
 if(!schema?.owned)throw Error('Verified operator schema ownership required');
 let mode,membershipGrantor;
 if(config.database==='loan_manager_dev'){
  if(name!=='postgres'||x.host!=='34.21.174.215'||x.port!==5432||!(await client.query("SELECT pg_has_role(session_user,'cloudsqlsuperuser','USAGE') ok")).rows[0].ok)throw Error('Exact Cloud SQL maintenance operator required');
  mode='cloudsql-default';membershipGrantor='cloudsqladmin';
 }else{
  if(x.host!=='127.0.0.1')throw Error('Owned loopback maintenance proof required');
  mode='disposable-explicit';membershipGrantor=name;
 }
 const grantor=(await client.query('SELECT $1::regrole::oid::int id',[membershipGrantor])).rows[0].id;
 return {...x,schema,mode,membershipGrantor,grantor,clause:mode==='cloudsql-default'?'':` GRANTED BY ${ident(name)}`};
}
async function maintenanceRows(client,ctx){
 const memberships=(await client.query('SELECT roleid::int roleid,member::int member,grantor::int grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor')).rows;
 const schemaAcl=(await client.query("SELECT a.grantor::int grantor,a.grantee::int grantee,a.privilege_type privilege,a.is_grantable grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public' ORDER BY a.grantor,a.grantee,a.privilege_type")).rows;
 const selected=m=>m.roleid===ctx.owner_id&&m.member===ctx.operator_id&&m.grantor===ctx.grantor;
 const create=a=>a.grantor===ctx.schema.grantor_id&&a.grantee===ctx.owner_id&&a.privilege==='CREATE';
 const own=memberships.filter(selected),acl=schemaAcl.filter(create);
 if(own.length>1||acl.length>1)throw Error('Ambiguous maintenance grantor rows');
 return {membership:own[0]?{admin_option:own[0].admin_option,inherit_option:own[0].inherit_option,set_option:own[0].set_option}:null,schemaCreate:acl[0]?{is_grantable:acl[0].grantable}:null,otherMemberships:memberships.filter(m=>!selected(m)),otherSchemaAcl:schemaAcl.filter(a=>!create(a))};
}
const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
async function verifyMaintenance(client,ctx,state,elevated){
 const now=await maintenanceRows(client,ctx);
 if(!same(now.otherMemberships,state.otherMemberships)||!same(now.otherSchemaAcl,state.otherSchemaAcl))throw Error('Unrelated maintenance privilege drift; transaction rolled back');
 const expectedMembership=elevated?{admin_option:state.membership?.admin_option??false,inherit_option:true,set_option:true}:state.membership;
 const expectedCreate=elevated?(state.schemaCreate??{is_grantable:false}):state.schemaCreate;
 if(!same(now.membership,expectedMembership)||!same(now.schemaCreate,expectedCreate))throw Error('Maintenance grantor delta differs; transaction rolled back');
}
export async function prepareExistingApplicationRoleMaintenance(client,config,{apply=false,expectedRestoreState=null}={}){
 const name=await operator(client,config),ctx=await maintenanceContext(client,config,name);
 const roles=await client.query('SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[])',[[APP,OWNER]]);
 if(roles.rowCount!==2||roles.rows.some(x=>x.rolcanlogin||x.rolsuper||x.rolcreatedb||x.rolcreaterole||x.rolreplication||x.rolbypassrls))throw Error('Existing application role flags differ');
 const funcs=await client.query("SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.prosecdef FROM pg_proc p WHERE p.oid IN (to_regprocedure('public.pwa_submit_selected_charges_v1(text)'),to_regprocedure('public.pwa_command_status_v1(uuid,text,text)'))");
 if(funcs.rowCount!==2||funcs.rows.some(x=>x.owner!==OWNER||!x.prosecdef))throw Error('Existing exact journal definer ownership required');
 const rows=await maintenanceRows(client,ctx);
 if(ctx.mode==='cloudsql-default'&&(!rows.membership||rows.membership.admin_option))throw Error('Known Cloud SQL grantor row/unchanged ADMIN false required');
 const restoreState={version:1,database:config.database,operator:name,mode:ctx.mode,membershipGrantor:ctx.membershipGrantor,schemaGrantor:ctx.schema.grantor,...rows};
 if(expectedRestoreState&&!same(expectedRestoreState,restoreState))throw Error('Maintenance baseline changed before elevation');
 const statements=[`GRANT ${ident(OWNER)} TO ${ident(name)} WITH INHERIT TRUE, SET TRUE${ctx.clause}`];
 if(!rows.schemaCreate)statements.push(`GRANT CREATE ON SCHEMA public TO ${ident(OWNER)}`);
 await execute(client,statements,apply,()=>verifyMaintenance(client,ctx,restoreState,true));
 return {mode:apply?'maintenance-applied':'maintenance-plan',database:config.database,operator:name,restoreState,statements,scope:'temporary exact proven grantor membership/schema CREATE; no role/runtime/PUBLIC changes'};
}
export async function restoreExistingApplicationRoleMaintenance(client,config,state,{apply=false}={}){
 const name=await operator(client,config),ctx=await maintenanceContext(client,config,name),bool=x=>typeof x==='boolean';
 if(!state||Object.keys(state).sort().join(',')!=='database,membership,membershipGrantor,mode,operator,otherMemberships,otherSchemaAcl,schemaCreate,schemaGrantor,version'||state.version!==1||state.database!==config.database||state.operator!==name||state.mode!==ctx.mode||state.membershipGrantor!==ctx.membershipGrantor||state.schemaGrantor!==ctx.schema.grantor||!Array.isArray(state.otherMemberships)||!Array.isArray(state.otherSchemaAcl)||
   (state.membership!==null&&(Object.keys(state.membership).sort().join(',')!=='admin_option,inherit_option,set_option'||!Object.values(state.membership).every(bool)))||
   (state.schemaCreate!==null&&(Object.keys(state.schemaCreate).join(',')!=='is_grantable'||!bool(state.schemaCreate.is_grantable)))||
   (ctx.mode==='cloudsql-default'&&(!state.membership||state.membership.admin_option)))throw Error('Invalid maintenance restoration state');
 const now=await maintenanceRows(client,ctx);
 if(same(now,{membership:state.membership,schemaCreate:state.schemaCreate,otherMemberships:state.otherMemberships,otherSchemaAcl:state.otherSchemaAcl}))return {mode:'maintenance-already-restored',database:config.database,operator:name,statements:[]};
 await verifyMaintenance(client,ctx,state,true);
 const statements=[];
 if(state.schemaCreate===null)statements.push(`REVOKE CREATE ON SCHEMA public FROM ${ident(OWNER)}`);
 statements.push(state.membership===null?`REVOKE ${ident(OWNER)} FROM ${ident(name)}${ctx.clause}`:`GRANT ${ident(OWNER)} TO ${ident(name)} WITH INHERIT ${state.membership.inherit_option?'TRUE':'FALSE'}, SET ${state.membership.set_option?'TRUE':'FALSE'}${ctx.clause}`);
 await execute(client,statements,apply,()=>verifyMaintenance(client,ctx,state,false));
 return {mode:apply?'maintenance-restored':'maintenance-restoration-plan',database:config.database,operator:name,statements,scope:'restore exact original selected-grantor rights; unchanged other memberships/schema ACL verified before COMMIT'};
}
