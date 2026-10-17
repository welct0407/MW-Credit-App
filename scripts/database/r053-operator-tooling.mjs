// R053 fixed-environment operator prerequisites. No credentials or automatic invocation.
import {createHash} from 'node:crypto';
const q=x=>'"'+x.replaceAll('"','""')+'"';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const r053Roles=['mw_notify_owner_dev','mw_notify_api_dev','mw_notify_dispatch_dev','mw_jobs_owner_dev','mw_jobs_dev'];
const owners=[r053Roles[0],r053Roles[3]];
const journalOwner='mw_app_dev_journal_owner';
export const r053AgentReceiptSignatures=['public.pwa_submit_agent_receipt_v1(text)','public.pwa_agent_receipt_status_v1(uuid,text,text)'];
const commandUser='mw-credit-app-command-dev@clever-oasis-508610-n7.iam';
export function r053Environment(database){
 if(!['loan_manager_dev','payment_rehearsal','loan_manager_prod'].includes(database))throw Error('Explicit DEV operator or guarded PROD operator required');
 const environment=database==='loan_manager_prod'?'prod':'dev';
 const roles=['notify_owner','notify_api','notify_dispatch','jobs_owner','jobs'].map(x=>'mw_'+x+'_'+environment);
 return {environment,roles,owners:[roles[0],roles[3]],journalOwner:'mw_app_'+environment+'_journal_owner',commandUser:'mw-credit-app-command-'+environment+'@clever-oasis-508610-n7.iam',appRole:'mw_app_'+environment,manifestDatabase:'loan_manager_'+environment};
}
// Cloud SQL was reached directly from VM-01 (`cloudsql-<env>`, retired by DB-ACCESS-07 on 17 October 2026);
// VM-01's local Auth Proxy and the Linux IAP tunnel to the Debian host's Auth Proxy use `cloudsql-<env>-tunnel`. The client-side tuple differs;
// the server-side identity (instance address/port, database, session_user) is required in both cases.
const cloudsqlModes=environment=>['cloudsql-'+environment,'cloudsql-'+environment+'-tunnel'];
async function context(c,config,{backupPreparation=false,ownerAuthority=false}={}){
 const binding=r053Environment(config?.database);
 if(!Array.isArray(config.creators)||config.creators.length!==1)throw Error('Explicit DEV operator required');
 if(ownerAuthority&&binding.environment==='prod'&&config.executionMode!=='owned-loopback'){const a=config.productionAuthorization;if(!cloudsqlModes('prod').includes(config.executionMode)||!a?.approvalReference?.trim()||! /^[a-f0-9]{40}$/.test(a.sourceCommit??'')||! /^[a-f0-9]{64}$/.test(a.backupSha256??''))throw Error('Explicit DEV operator or guarded PROD operator required');}
 else if(binding.environment==='prod'&&config.executionMode!=='owned-loopback'){const a=config.productionAuthorization;const backupOnly=backupPreparation&&((a?.purpose==='r056-backup-preparation'&&a.baselineVersion===90&&a.targetVersion===91)||(a?.purpose==='r062-backup-preparation'&&a.baselineVersion===91&&a.targetVersion===92))&&a.backupSha256===undefined;const backed= /^[a-f0-9]{64}$/.test(a?.backupSha256??'')&&!a?.purpose;if(config.executionMode!=='cloudsql-prod'||!a?.approvalReference?.trim()||! /^[a-f0-9]{40}$/.test(a.sourceCommit??'')||!(backupOnly||backed)||!(a.baselineVersion===87||(a.baselineVersion===89&&a.targetVersion===90)||(a.baselineVersion===90&&a.targetVersion===91)||(a.baselineVersion===91&&a.targetVersion===92&&backupPreparation)))throw Error('Explicit DEV operator or guarded PROD operator required');}
 const x=(await c.query("SELECT current_database() database,session_user operator,host(inet_server_addr()) host,inet_server_port() port,r.rolsuper,r.rolcreaterole,r.rolbypassrls,pg_get_userbyid(n.nspowner) schemaGrantor,pg_has_role(session_user,n.nspowner,'SET') schema_set,has_schema_privilege(session_user,n.oid,'CREATE') schema_create FROM pg_roles r CROSS JOIN pg_namespace n WHERE r.rolname=session_user AND n.nspname='public'")).rows[0];
 if(x.database!==config.database||x.operator!==config.creators[0]||x.rolsuper||!x.rolcreaterole||x.rolbypassrls||!x.schema_set||!x.schema_create)throw Error('True nonsuperuser exact schema operator required');
 let mode,grantor;
 if(x.host==='127.0.0.1'&&config.executionMode==='owned-loopback'){mode='explicit';grantor=x.operator;}
 else if(x.database===binding.manifestDatabase&&x.host==='136.85.127.134'&&x.port===5432&&x.operator==='postgres'&&cloudsqlModes(binding.environment).includes(config.executionMode)){mode='implicit-cloudsql';grantor='cloudsqladmin';}
 // Owner-approved 17 October 2026: through the Debian host's Auth Proxy the server sees a socket, so
 // inet_server_addr()/port() are NULL. Only the tunnel route accepts that, and only with the exact
 // database, session_user postgres and the Cloud SQL service role present (the tunnel script pins
 // the Debian host key). The VM-01 direct route above keeps its exact address check.
 else if(config.executionMode===cloudsqlModes(binding.environment)[1]&&x.database===binding.manifestDatabase&&x.host===null&&x.port===null&&x.operator==='postgres'&&(await c.query("SELECT 1 FROM pg_roles WHERE rolname='cloudsqladmin'")).rowCount===1){mode='implicit-cloudsql';grantor='cloudsqladmin';}
 else throw Error('Unreviewed DEV operator route');
 return {database:x.database,operator:x.operator,host:x.host,port:x.port,schemaGrantor:x.schemagrantor??x.schemaGrantor,mode,grantor};
}
async function transaction(c,fn){await c.query('BEGIN');try{const x=await fn();await c.query('COMMIT');return x;}catch(e){await c.query('ROLLBACK');throw e;}}
async function roles(c,roleNames=r053Roles){return(await c.query('SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname',[roleNames])).rows;}
function closed(rows){if(rows.length!==5||rows.some(x=>x.rolcanlogin||x.rolinherit||x.rolsuper||x.rolcreatedb||x.rolcreaterole||x.rolreplication||x.rolbypassrls))throw Error('Five closed roles required');}
async function memberships(c){return(await c.query('SELECT r.rolname role,m.rolname member,g.rolname grantor,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor ORDER BY 1,2,3')).rows;}
async function selected(c,ctx,maintenanceOwners=r053Environment(ctx.database).owners){
 const r053Roles=r053Environment(ctx.database).roles;
 const ms=await memberships(c);if(ms.some(x=>r053Roles.includes(x.member)))throw Error('Worker roles must not inherit another role');
 if(ms.some(x=>maintenanceOwners.includes(x.role)&&x.member===ctx.operator&&x.grantor!==ctx.grantor&&(x.inherit_option||x.set_option)))throw Error('Unexpected additional operator authority');
 const acl=(await c.query("SELECT pg_get_userbyid(a.grantor) grantor,pg_get_userbyid(a.grantee) grantee,a.is_grantable grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public' AND a.privilege_type='CREATE' ORDER BY 1,2")).rows;
 return maintenanceOwners.map(role=>{const member=ms.filter(x=>x.role===role&&x.member===ctx.operator&&x.grantor===ctx.grantor);if(member.length!==1)throw Error('Exact reviewed owner creator tuple required');const a=acl.filter(x=>x.grantee===role);if(a.length>1||a.some(x=>x.grantor!==ctx.schemaGrantor))throw Error('Unknown owner CREATE grantor');return{role,membership:member[0],create:a[0]??null};});
}
function memberSql(ctx,m){return `GRANT ${q(m.role)} TO ${q(m.member)} WITH ${ctx.mode==='explicit'?`ADMIN ${m.admin_option?'TRUE':'FALSE'}, `:''}INHERIT ${m.inherit_option?'TRUE':'FALSE'}, SET ${m.set_option?'TRUE':'FALSE'}${ctx.mode==='explicit'?' GRANTED BY '+q(ctx.grantor):''}`;}
export async function provisionR053Roles(c,config,{apply=false}={}){
 const ctx=await context(c,config);const {roles:r053Roles,owners,journalOwner,commandUser,appRole,environment,manifestDatabase}=r053Environment(ctx.database);if((await roles(c,r053Roles)).length)throw Error('Role package already exists; inspect retained provisioning evidence');
 const statements=r053Roles.map(role=>`CREATE ROLE ${q(role)} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
 if(!apply)return{mode:'roles-plan',context:ctx,statements};
 return transaction(c,async()=>{for(const sql of statements)await c.query(sql);const ms=await memberships(c);
  for(const role of r053Roles){const tuples=ms.filter(x=>x.role===role||x.member===role);if(tuples.some(x=>x.member!==ctx.operator))throw Error('Unexpected new role membership');
   if(ctx.mode==='implicit-cloudsql'){
    if(tuples.length)throw Error('Unexpected Cloud SQL automatic creator tuple');
    await c.query(`GRANT ${q(role)} TO ${q(ctx.operator)} WITH INHERIT FALSE, SET FALSE`);
   }else{
    // PostgreSQL creates a bootstrap-granted ADMIN tuple; leave it closed and
    // add the exact operator-owned ADMIN-false tuple that maintenance owns.
    if(tuples.length!==1||!tuples[0].admin_option||tuples[0].inherit_option||tuples[0].set_option)throw Error('Unsafe local automatic creator tuple');
    await c.query(`GRANT ${q(role)} TO ${q(ctx.operator)} WITH ADMIN FALSE, INHERIT FALSE, SET FALSE GRANTED BY ${q(ctx.operator)}`);
   }
  }
  closed(await roles(c,r053Roles));const after=await memberships(c);for(const role of r053Roles){const m=after.find(x=>x.role===role&&x.member===ctx.operator&&x.grantor===ctx.grantor);if(!m||m.admin_option||m.inherit_option||m.set_option)throw Error('New closed creator tuple mismatch');}
  return{mode:'roles-provisioned',context:ctx,roles:await roles(c,r053Roles),memberships:after.filter(x=>r053Roles.includes(x.role)||r053Roles.includes(x.member)),statements};
 });
}
export async function prepareR053Maintenance(c,config,{apply=false,expectedRestoreState=null,includeAgentReceipts=false,conversationOnly=false}={}){
 const ctx=await context(c,config,{backupPreparation:true});const {roles:r053Roles,owners,journalOwner,commandUser,appRole,environment,manifestDatabase}=r053Environment(ctx.database);closed(await roles(c,r053Roles));
 if(typeof includeAgentReceipts!=='boolean'||typeof conversationOnly!=='boolean'||(includeAgentReceipts&&conversationOnly))throw Error('Explicit exclusive agent maintenance boolean required');
 if(config.productionAuthorization?.baselineVersion===89&&!conversationOnly)throw Error('PROD89 permits journal-only V90 maintenance');
 if(config.productionAuthorization?.baselineVersion===90){if(includeAgentReceipts||conversationOnly)throw Error('PROD90 permits notification/jobs maintenance only');const history=(await c.query("SELECT max(version::integer) FILTER(WHERE success) AS version,count(*) FILTER(WHERE NOT success)::integer AS failed FROM public.flyway_schema_history")).rows[0];if(Number(history?.version)!==90||Number(history?.failed)!==0)throw Error('Exact successful V90 maintenance baseline required');}
 if(config.productionAuthorization?.baselineVersion===91){const backup=config.productionAuthorization.purpose==='r062-backup-preparation';if(backup?(!includeAgentReceipts||conversationOnly):(!conversationOnly||includeAgentReceipts))throw Error('PROD91 permits scoped backup owners or journal-only V92 maintenance');const history=(await c.query("SELECT max(version::integer) FILTER(WHERE success) AS version,count(*) FILTER(WHERE NOT success)::integer AS failed FROM public.flyway_schema_history")).rows[0];if(Number(history?.version)!==91||Number(history?.failed)!==0)throw Error('Exact successful V91 maintenance baseline required');}
 const maintenanceOwners=conversationOnly?[journalOwner]:includeAgentReceipts?[...owners,journalOwner]:owners;
 if(conversationOnly){const history=(await c.query("SELECT max(version::integer) FILTER(WHERE success) AS version,count(*) FILTER(WHERE NOT success)::integer AS failed FROM public.flyway_schema_history")).rows[0];if(Number(history?.version)!==(config.productionAuthorization?.baselineVersion===91?91:89)||Number(history?.failed)!==0)throw Error('Exact successful journal maintenance baseline required');}
 if(includeAgentReceipts||conversationOnly){const r=(await c.query('SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1',[journalOwner])).rows[0];if(!r||Object.values(r).some(Boolean))throw Error('Existing closed journal owner required');}
 const baseline=await selected(c,ctx,maintenanceOwners);
 if(baseline.some(x=>x.membership.admin_option||x.membership.inherit_option||x.membership.set_option||x.create))throw Error('Closed owner authority baseline required');
 const elevated=baseline.map(x=>({...x,membership:{...x.membership,inherit_option:true,set_option:true},create:{grantor:ctx.schemaGrantor,grantee:x.role,grantable:false}}));
 const state={version:conversationOnly?3:includeAgentReceipts?2:1,context:ctx,baseline,elevated};if(expectedRestoreState&&!same(state,expectedRestoreState))throw Error('R053 maintenance baseline changed');
 const statements=elevated.flatMap(x=>[memberSql(ctx,x.membership),`SET LOCAL ROLE ${q(ctx.schemaGrantor)}`,`GRANT CREATE ON SCHEMA public TO ${q(x.role)}`,`RESET ROLE`]);
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);if(!same(await selected(c,ctx,maintenanceOwners),elevated))throw Error('R053 elevation mismatch');});
 return{mode:apply?'authority-prepared':'authority-plan',restoreState:state,statements};
}
export async function restoreR053Maintenance(c,config,state,{apply=false}={}){
 const ctx=await context(c,config,{backupPreparation:true});const {roles:r053Roles,owners,journalOwner,commandUser,appRole,environment,manifestDatabase}=r053Environment(ctx.database);if(![1,2,3].includes(state?.version)||!same(ctx,state.context))throw Error('R053 restore context mismatch');
 if(config.productionAuthorization?.baselineVersion===89&&state.version!==3)throw Error('PROD89 requires journal-only restoration');
 if(config.productionAuthorization?.baselineVersion===90&&state.version!==1)throw Error('PROD90 requires notification/jobs restoration');
 if(config.productionAuthorization?.baselineVersion===91&&state.version!==(config.productionAuthorization.purpose==='r062-backup-preparation'?2:3))throw Error('PROD91 requires matching scoped restoration');
 const maintenanceOwners=state.version===3?[journalOwner]:state.version===2?[...owners,journalOwner]:owners;
 if(!Array.isArray(state.baseline)||state.baseline.length!==maintenanceOwners.length||!same(state.baseline.map(x=>x.role),maintenanceOwners)||state.baseline.some(x=>x.create!==null||x.membership?.role!==x.role||x.membership?.member!==ctx.operator||x.membership?.grantor!==ctx.grantor||x.membership?.admin_option!==false||x.membership?.inherit_option!==false||x.membership?.set_option!==false)||!same(state.elevated,state.baseline.map(x=>({...x,membership:{...x.membership,inherit_option:true,set_option:true},create:{grantor:ctx.schemaGrantor,grantee:x.role,grantable:false}}))))throw Error('Invalid R053 restoration snapshot');
 closed(await roles(c,r053Roles));const actual=await selected(c,ctx,maintenanceOwners);
 if(same(actual,state.baseline))return{mode:'authority-already-restored',statements:[]};if(!same(actual,state.elevated))throw Error('Owned authority changed concurrently');
 const statements=state.baseline.flatMap(x=>[`SET LOCAL ROLE ${q(ctx.schemaGrantor)}`,`REVOKE CREATE ON SCHEMA public FROM ${q(x.role)} RESTRICT`,`RESET ROLE`,memberSql(ctx,x.membership)]);
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);if(!same(await selected(c,ctx,maintenanceOwners),state.baseline))throw Error('R053 restoration mismatch');});
 return{mode:apply?'authority-restored':'restore-plan',statements};
}

// Generic closed-owner provisioning and temporary owner authority (A-design §9.3). Same tuple rules,
// elevation shape and private before/after record as the R053 functions above, for an explicit owner
// list and without the R053 role-package/version gates. First consumer: V93's ledger owner, whose
// ALTER FUNCTION ... OWNER needs the runner to SET ROLE to the owner and the owner to hold CREATE on public.
const ownerName=/^mw_[a-z0-9_]+$/;
// Owners hold no login/privilege flags; INHERIT is not forbidden because the journal owner inherits the capability role (prepareR053Maintenance's journal check).
function closedOwners(rows,expected){if(rows.length!==expected.length||rows.some(x=>x.rolcanlogin||x.rolsuper||x.rolcreatedb||x.rolcreaterole||x.rolreplication||x.rolbypassrls))throw Error('Closed owner roles required');}
function ownerList(owners,environment){if(!Array.isArray(owners)||!owners.length||new Set(owners).size!==owners.length||owners.some(x=>typeof x!=='string'||!ownerName.test(x)))throw Error('Explicit owner role list required');
 // An environment token in the name (mw_ledger_owner_dev, mw_app_dev_journal_owner) must match; shared owners (mw_business_audit_owner) carry none.
 if(owners.some(x=>{const token=/_(dev|prod)(?=_|$)/.exec(x)?.[1];return token&&token!==environment;}))throw Error('Owner role belongs to another environment');return[...owners];}
export async function provisionClosedOwnerRole(c,config,{role,apply=false}={}){
 const [owner]=ownerList([role],r053Environment(config?.database).environment);const ctx=await context(c,config,{ownerAuthority:true});
 if((await roles(c,[owner])).length)throw Error('Owner role already exists; inspect retained provisioning evidence');
 const statements=[`CREATE ROLE ${q(owner)} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`];
 if(!apply)return{mode:'role-plan',context:ctx,role:owner,statements};
 return transaction(c,async()=>{for(const sql of statements)await c.query(sql);const tuples=(await memberships(c)).filter(x=>x.role===owner||x.member===owner);if(tuples.some(x=>x.member!==ctx.operator))throw Error('Unexpected new role membership');
  if(ctx.mode==='implicit-cloudsql'){if(tuples.length)throw Error('Unexpected Cloud SQL automatic creator tuple');await c.query(`GRANT ${q(owner)} TO ${q(ctx.operator)} WITH INHERIT FALSE, SET FALSE`);}
  else{if(tuples.length!==1||!tuples[0].admin_option||tuples[0].inherit_option||tuples[0].set_option)throw Error('Unsafe local automatic creator tuple');await c.query(`GRANT ${q(owner)} TO ${q(ctx.operator)} WITH ADMIN FALSE, INHERIT FALSE, SET FALSE GRANTED BY ${q(ctx.operator)}`);}
  closedOwners(await roles(c,[owner]),[owner]);const after=await memberships(c);const m=after.find(x=>x.role===owner&&x.member===ctx.operator&&x.grantor===ctx.grantor);if(!m||m.admin_option||m.inherit_option||m.set_option)throw Error('New closed creator tuple mismatch');
  return{mode:'role-provisioned',context:ctx,role:owner,roles:await roles(c,[owner]),memberships:after.filter(x=>x.role===owner||x.member===owner),statements};
 });
}
export async function prepareOwnerAuthority(c,config,{owners,apply=false,expectedRestoreState=null}={}){
 const maintenanceOwners=ownerList(owners,r053Environment(config?.database).environment);const ctx=await context(c,config,{ownerAuthority:true});
 closedOwners(await roles(c,maintenanceOwners),maintenanceOwners);
 const baseline=await selected(c,ctx,maintenanceOwners);
 if(baseline.some(x=>x.membership.admin_option||x.membership.inherit_option||x.membership.set_option||x.create))throw Error('Closed owner authority baseline required');
 const elevated=baseline.map(x=>({...x,membership:{...x.membership,inherit_option:true,set_option:true},create:{grantor:ctx.schemaGrantor,grantee:x.role,grantable:false}}));
 const state={version:4,owners:maintenanceOwners,context:ctx,baseline,elevated};if(expectedRestoreState&&!same(state,expectedRestoreState))throw Error('Owner authority baseline changed');
 const statements=elevated.flatMap(x=>[memberSql(ctx,x.membership),`SET LOCAL ROLE ${q(ctx.schemaGrantor)}`,`GRANT CREATE ON SCHEMA public TO ${q(x.role)}`,`RESET ROLE`]);
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);if(!same(await selected(c,ctx,maintenanceOwners),elevated))throw Error('Owner authority elevation mismatch');});
 return{mode:apply?'authority-prepared':'authority-plan',restoreState:state,statements};
}
export async function restoreOwnerAuthority(c,config,state,{apply=false}={}){
 if(state?.version!==4)throw Error('Owner authority restore context mismatch');const maintenanceOwners=ownerList(state.owners,r053Environment(config?.database).environment);
 const ctx=await context(c,config,{ownerAuthority:true});if(!same(ctx,state.context))throw Error('Owner authority restore context mismatch');
 if(!Array.isArray(state.baseline)||!same(state.baseline.map(x=>x.role),maintenanceOwners)||state.baseline.some(x=>x.create!==null||x.membership?.role!==x.role||x.membership?.member!==ctx.operator||x.membership?.grantor!==ctx.grantor||x.membership?.admin_option!==false||x.membership?.inherit_option!==false||x.membership?.set_option!==false)||!same(state.elevated,state.baseline.map(x=>({...x,membership:{...x.membership,inherit_option:true,set_option:true},create:{grantor:ctx.schemaGrantor,grantee:x.role,grantable:false}}))))throw Error('Invalid owner authority restoration snapshot');
 closedOwners(await roles(c,maintenanceOwners),maintenanceOwners);const actual=await selected(c,ctx,maintenanceOwners);
 if(same(actual,state.baseline))return{mode:'authority-already-restored',statements:[]};if(!same(actual,state.elevated))throw Error('Owned authority changed concurrently');
 const statements=state.baseline.flatMap(x=>[`SET LOCAL ROLE ${q(ctx.schemaGrantor)}`,`REVOKE CREATE ON SCHEMA public FROM ${q(x.role)} RESTRICT`,`RESET ROLE`,memberSql(ctx,x.membership)]);
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);if(!same(await selected(c,ctx,maintenanceOwners),state.baseline))throw Error('Owner authority restoration mismatch');});
 return{mode:apply?'authority-restored':'restore-plan',statements};
}
async function capture(c,ctx){const {owners}=r053Environment(ctx.database);const x=(await c.query("SELECT p.oid::text,pg_get_userbyid(p.proowner) owner,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('public.pwa_capture_notification_v1()')")).rows[0];if(!x||x.owner!==owners[0])throw Error('Exact capture ownership required');const h=(await c.query("SELECT 1 FROM public.flyway_schema_history WHERE version='88' AND success")).rowCount;if(!h)throw Error('Applied V88 required');return{database:ctx.database,...x};}
export async function configureR053Capture(c,config,{enabled,apply=false,expectedBefore=null}={}){
 if(typeof enabled!=='boolean')throw Error('Explicit capture boolean required');const ctx=await context(c,config),{owners}=r053Environment(ctx.database),before=await capture(c,ctx);if(expectedBefore&&!same(before,expectedBefore))throw Error('Capture baseline changed');
 const value=enabled?'mw_pwa_capture_enabled_v1':'mw_pwa_capture_disabled_v1',statements=[`SET LOCAL ROLE ${q(owners[0])}`,`ALTER FUNCTION public.pwa_capture_notification_v1() SET application_name='${value}'`,`RESET ROLE`];let after=before;
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);after=await capture(c,ctx);const expected=[...(before.proconfig??[]).filter(x=>!x.startsWith('application_name=')),'application_name='+value].sort();if(after.owner!==before.owner||after.oid!==before.oid||!same([...(after.proconfig??[])].sort(),expected))throw Error('Capture config changed unexpectedly');});
 return{mode:apply?'capture-configured':'capture-plan',before,after,enabled,statements};
}

// Exact reviewed dependency bytes are supplied by the operator CLI with a hash pin.
export async function grantR053JobDependencies(c,config,manifest,{apply=false,reviewedManifestSha256}={}){
 const ctx=await context(c,config);const {roles:r053Roles,owners,journalOwner,commandUser,appRole,environment,manifestDatabase}=r053Environment(ctx.database);closed(await roles(c,r053Roles));
 if(!/^[a-f0-9]{64}$/.test(reviewedManifestSha256??'')||createHash('sha256').update(JSON.stringify(manifest)).digest('hex')!==reviewedManifestSha256)throw Error('Exact reviewed dependency hash required');
 if(manifest?.schemaVersion!==1||manifest.database!==manifestDatabase||manifest.owner!==r053Roles[3]||!Array.isArray(manifest.executeRoots)||!manifest.select||!manifest.insert||!manifest.update)throw Error('Reviewed DEV dependency manifest required');
 const statements=[],before={relations:[],columns:[],routines:[]};
 for(const privilege of ['select','insert','update'])for(const [relation,columns]of Object.entries(manifest[privilege])){
  const row=(await c.query("SELECT c.oid FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=$1 AND c.relkind IN ('r','p','v','m')",[relation])).rows[0];if(!row)throw Error('Missing dependency relation');
  if(!before.relations.some(x=>x.name===relation)){
   before.relations.push((await c.query('SELECT relname name,relacl::text acl FROM pg_class WHERE oid=$1',[row.oid])).rows[0]);
   before.columns.push(...(await c.query('SELECT $2::text relation,attname name,attacl::text acl FROM pg_attribute WHERE attrelid=$1 AND attnum>0 AND NOT attisdropped ORDER BY attnum',[row.oid,relation])).rows);
  }
  if(columns!==null&&(!Array.isArray(columns)||!columns.length||new Set(columns).size!==columns.length||columns.some(x=>typeof x!=='string'||!x)))throw Error('Invalid dependency columns');
  if(columns)for(const col of columns)if(!(await c.query('SELECT 1 FROM pg_attribute WHERE attrelid=$1 AND attname=$2 AND attnum>0 AND NOT attisdropped',[row.oid,col])).rowCount)throw Error('Missing dependency column');
  statements.push(`GRANT ${privilege.toUpperCase()}${columns?'('+columns.map(q).join(',')+')':''} ON TABLE public.${q(relation)} TO ${q(r053Roles[3])}`);
 }
 for(const signature of manifest.executeRoots){const x=(await c.query('SELECT p.oid::regprocedure::text signature,p.proacl::text acl FROM pg_proc p WHERE p.oid=to_regprocedure($1)',[signature])).rows[0];if(!x?.signature)throw Error('Missing exact canonical dependency');before.routines.push(x);statements.push(`GRANT EXECUTE ON FUNCTION ${x.signature} TO ${q(r053Roles[3])}`);}
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);});return{mode:apply?'jobs-dependencies-applied':'jobs-dependencies-plan',context:ctx,before,reviewedManifestSha256,statements};
}
export async function bindR053Runtime(c,config,{kind,apply=false}={}){
 const ctx=await context(c,config);const {roles:r053Roles,owners,journalOwner,commandUser,appRole,environment,manifestDatabase}=r053Environment(ctx.database);if(ctx.mode!=='implicit-cloudsql'||!['api','notify','jobs'].includes(kind))throw Error('Fixed DEV runtime binding required');
 const stem=kind==='api'?'command':kind,role=kind==='api'?r053Roles[1]:kind==='notify'?r053Roles[2]:r053Roles[4],user=`mw-credit-app-${stem}-${environment}@clever-oasis-508610-n7.iam`;
 const x=(await c.query('SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1',[user])).rows[0];if(!x?.rolcanlogin||x.rolsuper||x.rolcreatedb||x.rolcreaterole||x.rolreplication||x.rolbypassrls)throw Error('Existing closed IAM runtime required');
 const ms=await memberships(c);if(ms.some(x=>x.member===user&&(
  x.role==='cloudsqliamserviceaccount' ? !(x.grantor==='cloudsqladmin'&&x.admin_option===false&&x.inherit_option===true&&x.set_option===true) :
  (x.admin_option||x.set_option||![role,...(kind==='api'?[appRole]:[])].includes(x.role)||x.grantor!=='cloudsqladmin'||x.inherit_option!==true)
  )))throw Error('Runtime has unreviewed membership');
 const statements=[`GRANT ${q(role)} TO ${q(user)} WITH ADMIN FALSE, INHERIT TRUE, SET FALSE`];
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);const now=await memberships(c);const x=now.filter(x=>x.member===user&&x.role===role);if(x.length!==1||x[0].admin_option||!x[0].inherit_option||x[0].set_option)throw Error('Runtime binding mismatch');});
 return{mode:apply?'runtime-bound':'runtime-plan',kind,user,capability:role,beforeMemberships:ms.filter(x=>x.member===user),statements};
}

// V89 machine entrypoints are granted directly to the existing command login only.
export async function grantR053AgentReceiptApi(c,config,{apply=false,expectedBefore=null}={}){
 const ctx=await context(c,config);const {roles:r053Roles,owners,journalOwner,commandUser,appRole,environment,manifestDatabase}=r053Environment(ctx.database);
 if(!(await c.query("SELECT 1 FROM public.flyway_schema_history WHERE version='89' AND success")).rowCount)throw Error('Applied V89 required');
 const user=(await c.query('SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1',[commandUser])).rows[0];
 if(!user?.rolcanlogin||user.rolsuper||user.rolcreatedb||user.rolcreaterole||user.rolreplication||user.rolbypassrls)throw Error('Existing closed DEV command login required');
 async function snapshot(){const rows=[];for(const signature of r053AgentReceiptSignatures){
  const r=(await c.query("SELECT p.oid::text,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proacl::text acl,has_function_privilege($2,p.oid,'EXECUTE') command_execute,has_function_privilege($3,p.oid,'EXECUTE') app_execute FROM pg_proc p WHERE p.oid=to_regprocedure($1)",[signature,commandUser,appRole])).rows[0];
  if(!r||r.owner!==journalOwner||!r.definer||r.app_execute)throw Error('Exact journal-owned machine-only function required');
  const acl=(await c.query("SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,pg_get_userbyid(a.grantor) grantor,a.privilege_type privilege,a.is_grantable grantable FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1",[r.oid])).rows;
  if(acl.some(a=>![journalOwner,commandUser].includes(a.grantee)||a.grantor!==journalOwner||a.privilege!=='EXECUTE'||(a.grantee===commandUser&&a.grantable)))throw Error('Unreviewed machine function ACL');
  rows.push({signature,...r});
 }return rows;}
 const before=await snapshot();if(expectedBefore&&!same(before,expectedBefore))throw Error('Agent API ACL baseline changed');
 const statements=[`SET LOCAL ROLE ${q(journalOwner)}`,...r053AgentReceiptSignatures.map(s=>`GRANT EXECUTE ON FUNCTION ${s} TO ${q(commandUser)}`),'RESET ROLE'];let after=before;
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);after=await snapshot();if(after.some((r,i)=>!r.command_execute||r.oid!==before[i].oid||r.owner!==before[i].owner))throw Error('Machine function grant mismatch');});
 return{mode:apply?'agent-api-granted':'agent-api-plan',context:ctx,user:commandUser,before,after,statements};
}
