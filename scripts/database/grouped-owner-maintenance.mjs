// Temporary authority for the two historical/final journal owners. No automatic live invocation.
const owners=['mw_app_dev_journal_owner','mw_app_prod_journal_owner'];
export const temporarySchemaCapability='mw_app_prod_migration_schema_create';
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function context(client,config){
 if(config?.database!=='loan_manager_prod'||!Array.isArray(config.creators)||!config.creators.length||!Array.isArray(config.grantors)||config.grantors.length!==2)throw Error('Explicit PROD creators and both reviewed owner grantors required');
 const x=(await client.query("SELECT current_database() database,session_user operator,host(inet_server_addr()) host,inet_server_port() port,r.rolsuper,r.rolcreaterole,r.rolbypassrls,has_schema_privilege(session_user,'public','CREATE') schema_create FROM pg_roles r WHERE r.rolname=session_user")).rows[0];
 if(x.database!==config.database||!config.creators.includes(x.operator)||x.rolsuper||!x.rolcreaterole||x.rolbypassrls||!x.schema_create)throw Error('Registered true nonsuperuser grouped operator required');
 const schema=(await client.query("SELECT pg_get_userbyid(nspowner) grantor,pg_has_role(session_user,nspowner,'USAGE') owned,pg_has_role(session_user,nspowner,'SET') can_set FROM pg_namespace WHERE nspname='public'")).rows[0];
 if(!schema?.owned||!schema.can_set)throw Error('Verified exact schema grantor SET authority required');
 const roles=(await client.query('SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[])',[owners])).rows;
 if(roles.length!==2||roles.some(r=>r.rolcanlogin||r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls))throw Error('Both existing journal owner packages must have reviewed flags');
 const bindings=owners.map(owner=>{const g=config.grantors.find(v=>v.ownerRole===owner);if(!g||typeof g.membershipGrantor!=='string'||!g.membershipGrantor||g.schemaGrantor!==schema.grantor)throw Error('Unknown owner grantor binding');
  const cloud=g.membershipMode==='implicit-cloudsql';
  if(cloud){if(x.operator!=='postgres'||x.host!=='34.21.174.215'||x.port!==5432||g.membershipGrantor!=='cloudsqladmin')throw Error('Unverified Cloud SQL membership grantor');}
  else if(g.membershipMode!=='explicit'||x.host!=='127.0.0.1'||g.membershipGrantor!==x.operator)throw Error('Explicit grantor is limited to owned loopback proof');
  return {ownerRole:owner,membershipGrantor:g.membershipGrantor,schemaGrantor:g.schemaGrantor,membershipMode:g.membershipMode};});
 return {database:x.database,operator:x.operator,bindings};
}
async function rows(client,ctx){
 const memberships=(await client.query('SELECT r.rolname role,m.rolname member,g.rolname grantor,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor ORDER BY r.rolname,m.rolname,g.rolname')).rows;
 const acl=(await client.query("SELECT pg_get_userbyid(a.grantor) grantor,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,a.privilege_type privilege,a.is_grantable grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public' ORDER BY a.grantor,a.grantee,a.privilege_type")).rows;
 const selectedMembership=m=>ctx.bindings.some(b=>m.role===b.ownerRole&&m.member===ctx.operator&&m.grantor===b.membershipGrantor);
 const selectedCreate=a=>ctx.bindings.some(b=>a.grantee===b.ownerRole&&a.grantor===b.schemaGrantor&&a.privilege==='CREATE');
 const selected=ctx.bindings.map(b=>{const own=memberships.filter(m=>m.role===b.ownerRole&&m.member===ctx.operator&&m.grantor===b.membershipGrantor),create=acl.filter(a=>a.grantee===b.ownerRole&&a.privilege==='CREATE'&&a.grantor===b.schemaGrantor);if(own.length>1||create.length>1)throw Error('Ambiguous exact owned grantor tuple');return {ownerRole:b.ownerRole,membership:own[0]??null,schemaCreate:create[0]??null};});
 const role=(await client.query('SELECT oid::text,rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil::text,rolconfig FROM pg_roles WHERE rolname=$1',[temporarySchemaCapability])).rows[0]??null;
 const temporary=role?{role,memberships:memberships.filter(m=>m.role===temporarySchemaCapability||m.member===temporarySchemaCapability||m.grantor===temporarySchemaCapability),acl:acl.filter(a=>a.grantee===temporarySchemaCapability||a.grantor===temporarySchemaCapability),dependencies:(await client.query('SELECT dbid::text,classid::regclass::text,objid::text,objsubid,deptype FROM pg_shdepend WHERE refclassid=\'pg_authid\'::regclass AND refobjid=$1::oid ORDER BY dbid,classid,objid,objsubid,deptype',[role.oid])).rows}:null;
 return {selected,temporary,otherMemberships:memberships.filter(m=>!selectedMembership(m)&&m.role!==temporarySchemaCapability&&m.member!==temporarySchemaCapability&&m.grantor!==temporarySchemaCapability),otherSchemaAcl:acl.filter(a=>!selectedCreate(a)&&a.grantee!==temporarySchemaCapability&&a.grantor!==temporarySchemaCapability)};
}
export function planGroupedOwnerMaintenance(ctx,baseline){
 if(!ctx||ctx.database!=='loan_manager_prod'||typeof ctx.operator!=='string'||!ctx.operator||!Array.isArray(ctx.bindings)||ctx.bindings.length!==2||!owners.every(owner=>ctx.bindings.filter(b=>b.ownerRole===owner).length===1)||!Array.isArray(baseline?.selected)||baseline.selected.length!==2)throw Error('Invalid grouped authority snapshot');
 const statements=[],elevated=[];
 if(baseline.temporary!==null)throw Error('Temporary schema capability must be absent initially');
 for(const b of ctx.bindings){const original=baseline.selected.find(s=>s.ownerRole===b.ownerRole);if(!original||typeof b.membershipGrantor!=='string'||!b.membershipGrantor||typeof b.schemaGrantor!=='string'||!b.schemaGrantor||!['explicit','implicit-cloudsql'].includes(b.membershipMode))throw Error('Owner snapshot missing');
  if(original.membership!==null&&(!original.membership||original.membership.role!==b.ownerRole||original.membership.member!==ctx.operator||original.membership.grantor!==b.membershipGrantor||['admin_option','inherit_option','set_option'].some(k=>typeof original.membership[k]!=='boolean')))throw Error('Invalid owner membership snapshot');
  if(original.schemaCreate!==null&&(!original.schemaCreate||original.schemaCreate.grantor!==b.schemaGrantor||original.schemaCreate.grantee!==b.ownerRole||original.schemaCreate.privilege!=='CREATE'||typeof original.schemaCreate.grantable!=='boolean'))throw Error('Invalid owner schema CREATE snapshot');
  if(b.membershipMode==='implicit-cloudsql'&&original.membership?.admin_option!==false)throw Error('Original reviewed Cloud SQL ADMIN-false tuple required');
  const clause=b.membershipMode==='explicit'?' GRANTED BY '+quote(b.membershipGrantor):'';
  const membership={role:b.ownerRole,member:ctx.operator,grantor:b.membershipGrantor,admin_option:original.membership?.admin_option??false,inherit_option:true,set_option:true};
  const admin=b.membershipMode==='explicit'?`ADMIN ${membership.admin_option?'TRUE':'FALSE'}, `:'';
  statements.push(`GRANT ${quote(b.ownerRole)} TO ${quote(ctx.operator)} WITH ${admin}INHERIT TRUE, SET TRUE${clause}`);
  if(b.ownerRole===owners[0]&&original.schemaCreate)throw Error('Legacy direct schema CREATE must be absent');
  if(b.ownerRole===owners[1]&&!original.schemaCreate)statements.push(`SET LOCAL ROLE ${quote(b.schemaGrantor)}`,`GRANT CREATE ON SCHEMA public TO ${quote(b.ownerRole)}`,`RESET ROLE`);
  elevated.push({ownerRole:b.ownerRole,membership,schemaCreate:b.ownerRole===owners[0]?null:original.schemaCreate??{grantor:b.schemaGrantor,grantee:b.ownerRole,privilege:'CREATE',grantable:false}});
 }
 statements.push(`CREATE ROLE ${quote(temporarySchemaCapability)} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
  `SET LOCAL ROLE ${quote(ctx.bindings[0].schemaGrantor)}`,`GRANT CREATE ON SCHEMA public TO ${quote(temporarySchemaCapability)}`,`RESET ROLE`,
  `GRANT ${quote(temporarySchemaCapability)} TO ${quote(owners[0])} WITH ADMIN FALSE, INHERIT TRUE, SET FALSE`);
 return {statements,elevated};
}
async function transaction(client,statements,verify){await client.query('BEGIN');try{for(const sql of statements)await client.query(sql);await verify();await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}}
export async function prepareGroupedOwnerMaintenance(client,config,{apply=false,expectedRestoreState=null}={}){
 const ctx=await context(client,config),baseline=await rows(client,ctx),plan=planGroupedOwnerMaintenance(ctx,baseline);
 const restoreState={version:2,context:ctx,baseline,elevated:plan.elevated,temporary:null};
 if(expectedRestoreState&&!equal(restoreState,expectedRestoreState))throw Error('Grouped authority baseline changed');
 if(apply)await transaction(client,plan.statements,async()=>{const now=await rows(client,ctx);validateTemporary(now.temporary,ctx);if(!equal(now.selected,plan.elevated)||!equal(now.otherMemberships,baseline.otherMemberships)||!equal(now.otherSchemaAcl,baseline.otherSchemaAcl))throw Error('Grouped elevation changed unexpected tuples');restoreState.temporary=now.temporary;});
 return {mode:apply?'grouped-authority-prepared':'grouped-authority-plan',restoreState,statements:plan.statements};
}
export async function restoreGroupedOwnerMaintenance(client,config,state,{apply=false}={}){
 const ctx=await context(client,config);if(state?.version!==2||!equal(ctx,state.context)||!Array.isArray(state.baseline?.selected)||!Array.isArray(state.elevated))throw Error('Grouped restoration context invalid');
 const expected=planGroupedOwnerMaintenance(ctx,state.baseline).elevated;if(!equal(state.elevated,expected))throw Error('Grouped restoration snapshot invalid');
 const beforeRestore=await rows(client,ctx);
 if(equal(beforeRestore.selected,state.baseline.selected)&&beforeRestore.temporary===null)return {mode:'grouped-authority-already-restored',statements:[]};
 validateTemporary(state.temporary,ctx);
 if(!equal(beforeRestore.selected,state.elevated)||!equal(beforeRestore.temporary,state.temporary))throw Error('Helper-owned tuple changed concurrently; restoration refused');
 const capabilityMember=state.temporary.memberships.find(m=>m.member===owners[0]);
 const capabilityGrantorClause=ctx.bindings[0].membershipMode==='implicit-cloudsql'?'':' GRANTED BY '+quote(capabilityMember.grantor);
 const statements=[`REVOKE ${quote(temporarySchemaCapability)} FROM ${quote(owners[0])}${capabilityGrantorClause}`,
  `SET LOCAL ROLE ${quote(ctx.bindings[0].schemaGrantor)}`,`REVOKE CREATE ON SCHEMA public FROM ${quote(temporarySchemaCapability)}`,`RESET ROLE`,
  // DROP ROLE uses RESTRICT semantics; unexpected object dependencies abort the transaction.
  `DROP ROLE ${quote(temporarySchemaCapability)}`];
 for(const b of ctx.bindings){const original=state.baseline.selected.find(s=>s.ownerRole===b.ownerRole),clause=b.membershipMode==='explicit'?' GRANTED BY '+quote(b.membershipGrantor):'';
  if(b.ownerRole===owners[1]&&!original.schemaCreate)statements.push(`SET LOCAL ROLE ${quote(b.schemaGrantor)}`,`REVOKE CREATE ON SCHEMA public FROM ${quote(b.ownerRole)}`,`RESET ROLE`);
  const admin=b.membershipMode==='explicit'?`ADMIN ${original.membership?.admin_option?'TRUE':'FALSE'}, `:'';
  statements.push(original.membership?`GRANT ${quote(b.ownerRole)} TO ${quote(ctx.operator)} WITH ${admin}INHERIT ${original.membership.inherit_option?'TRUE':'FALSE'}, SET ${original.membership.set_option?'TRUE':'FALSE'}${clause}`:`REVOKE ${quote(b.ownerRole)} FROM ${quote(ctx.operator)}${clause}`);
 }
 if(apply)await transaction(client,statements,async()=>{const after=await rows(client,ctx);if(after.temporary!==null||!equal(after.selected,state.baseline.selected)||!equal(after.otherMemberships,beforeRestore.otherMemberships)||!equal(after.otherSchemaAcl,beforeRestore.otherSchemaAcl))throw Error('Exact restoration or unrelated post-migration tuples changed');});
 return {mode:apply?'grouped-authority-restored':'grouped-authority-restoration-plan',statements,scope:'Only helper-owned membership/schema CREATE tuples restored; caller must verify permanent V87 catalog separately; PUBLIC CONNECT never restored'};
}
export function validateTemporary(value,ctx){
 const r=value?.role;if(!r||r.rolname!==temporarySchemaCapability||r.rolcanlogin||r.rolinherit||r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls||r.rolconnlimit!==-1||r.rolvaliduntil!==null||r.rolconfig!==null)throw Error('Temporary capability flags invalid');
 // Cloud SQL's exact postgres/host/port binding is enforced by context(). Its
 // transactional CREATE/DROP preflight observed no automatic creator tuple.
 const cloud=ctx.operator==='postgres'&&ctx.bindings.length===2&&ctx.bindings.every(b=>b.membershipMode==='implicit-cloudsql'&&b.membershipGrantor==='cloudsqladmin');
 if(!Array.isArray(value.memberships)||value.memberships.length!==(cloud?1:2))throw Error('Temporary capability membership invalid');
 const creator=value.memberships.find(m=>m.role===temporarySchemaCapability&&m.member===ctx.operator),dev=value.memberships.find(m=>m.role===temporarySchemaCapability&&m.member===owners[0]);
 if((cloud?creator!==undefined:!creator||!creator.grantor||creator.admin_option!==true||creator.inherit_option!==false||creator.set_option!==false)||!dev||dev.grantor!==(cloud?'cloudsqladmin':ctx.operator)||dev.admin_option!==false||dev.inherit_option!==true||dev.set_option!==false)throw Error('Temporary capability creator/member tuple invalid');
 if(!equal(value.acl,[{grantor:ctx.bindings[0].schemaGrantor,grantee:temporarySchemaCapability,privilege:'CREATE',grantable:false}])||!Array.isArray(value.dependencies))throw Error('Temporary capability ACL invalid');
}
