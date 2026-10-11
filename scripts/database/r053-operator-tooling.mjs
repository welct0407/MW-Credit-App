// R053 DEV-only operator prerequisites. No credentials or automatic invocation.
import {createHash} from 'node:crypto';
const q=x=>'"'+x.replaceAll('"','""')+'"';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const r053Roles=['mw_notify_owner_dev','mw_notify_api_dev','mw_notify_dispatch_dev','mw_jobs_owner_dev','mw_jobs_dev'];
const owners=[r053Roles[0],r053Roles[3]];
async function context(c,config){
 if(!['loan_manager_dev','payment_rehearsal'].includes(config?.database)||!Array.isArray(config.creators)||config.creators.length!==1)throw Error('Explicit DEV operator required');
 const x=(await c.query("SELECT current_database() database,session_user operator,host(inet_server_addr()) host,inet_server_port() port,r.rolsuper,r.rolcreaterole,r.rolbypassrls,pg_get_userbyid(n.nspowner) schemaGrantor,pg_has_role(session_user,n.nspowner,'SET') schema_set,has_schema_privilege(session_user,n.oid,'CREATE') schema_create FROM pg_roles r CROSS JOIN pg_namespace n WHERE r.rolname=session_user AND n.nspname='public'")).rows[0];
 if(x.database!==config.database||x.operator!==config.creators[0]||x.rolsuper||!x.rolcreaterole||x.rolbypassrls||!x.schema_set||!x.schema_create)throw Error('True nonsuperuser exact schema operator required');
 let mode,grantor;
 if(x.host==='127.0.0.1'&&config.executionMode==='owned-loopback'){mode='explicit';grantor=x.operator;}
 else if(x.database==='loan_manager_dev'&&x.host==='34.21.174.215'&&x.port===5432&&x.operator==='postgres'&&config.executionMode==='cloudsql-dev'){mode='implicit-cloudsql';grantor='cloudsqladmin';}
 else throw Error('Unreviewed DEV operator route');
 return {database:x.database,operator:x.operator,host:x.host,port:x.port,schemaGrantor:x.schemagrantor??x.schemaGrantor,mode,grantor};
}
async function transaction(c,fn){await c.query('BEGIN');try{const x=await fn();await c.query('COMMIT');return x;}catch(e){await c.query('ROLLBACK');throw e;}}
async function roles(c){return(await c.query('SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname',[r053Roles])).rows;}
function closed(rows){if(rows.length!==5||rows.some(x=>x.rolcanlogin||x.rolinherit||x.rolsuper||x.rolcreatedb||x.rolcreaterole||x.rolreplication||x.rolbypassrls))throw Error('Five closed roles required');}
async function memberships(c){return(await c.query('SELECT r.rolname role,m.rolname member,g.rolname grantor,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor ORDER BY 1,2,3')).rows;}
async function selected(c,ctx){
 const ms=await memberships(c);if(ms.some(x=>r053Roles.includes(x.member)))throw Error('Worker roles must not inherit another role');
 if(ms.some(x=>owners.includes(x.role)&&x.member===ctx.operator&&x.grantor!==ctx.grantor&&(x.inherit_option||x.set_option)))throw Error('Unexpected additional operator authority');
 const acl=(await c.query("SELECT pg_get_userbyid(a.grantor) grantor,pg_get_userbyid(a.grantee) grantee,a.is_grantable grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public' AND a.privilege_type='CREATE' ORDER BY 1,2")).rows;
 return owners.map(role=>{const member=ms.filter(x=>x.role===role&&x.member===ctx.operator&&x.grantor===ctx.grantor);if(member.length!==1)throw Error('Exact reviewed owner creator tuple required');const a=acl.filter(x=>x.grantee===role);if(a.length>1||a.some(x=>x.grantor!==ctx.schemaGrantor))throw Error('Unknown owner CREATE grantor');return{role,membership:member[0],create:a[0]??null};});
}
function memberSql(ctx,m){return `GRANT ${q(m.role)} TO ${q(m.member)} WITH ${ctx.mode==='explicit'?`ADMIN ${m.admin_option?'TRUE':'FALSE'}, `:''}INHERIT ${m.inherit_option?'TRUE':'FALSE'}, SET ${m.set_option?'TRUE':'FALSE'}${ctx.mode==='explicit'?' GRANTED BY '+q(ctx.grantor):''}`;}
export async function provisionR053Roles(c,config,{apply=false}={}){
 const ctx=await context(c,config);if((await roles(c)).length)throw Error('Role package already exists; inspect retained provisioning evidence');
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
  closed(await roles(c));const after=await memberships(c);for(const role of r053Roles){const m=after.find(x=>x.role===role&&x.member===ctx.operator&&x.grantor===ctx.grantor);if(!m||m.admin_option||m.inherit_option||m.set_option)throw Error('New closed creator tuple mismatch');}
  return{mode:'roles-provisioned',context:ctx,roles:await roles(c),memberships:after.filter(x=>r053Roles.includes(x.role)||r053Roles.includes(x.member)),statements};
 });
}
export async function prepareR053Maintenance(c,config,{apply=false,expectedRestoreState=null}={}){
 const ctx=await context(c,config);closed(await roles(c));const baseline=await selected(c,ctx);
 if(baseline.some(x=>x.membership.admin_option||x.membership.inherit_option||x.membership.set_option||x.create))throw Error('Closed owner authority baseline required');
 const elevated=baseline.map(x=>({...x,membership:{...x.membership,inherit_option:true,set_option:true},create:{grantor:ctx.schemaGrantor,grantee:x.role,grantable:false}}));
 const state={version:1,context:ctx,baseline,elevated};if(expectedRestoreState&&!same(state,expectedRestoreState))throw Error('R053 maintenance baseline changed');
 const statements=elevated.flatMap(x=>[memberSql(ctx,x.membership),`SET LOCAL ROLE ${q(ctx.schemaGrantor)}`,`GRANT CREATE ON SCHEMA public TO ${q(x.role)}`,`RESET ROLE`]);
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);if(!same(await selected(c,ctx),elevated))throw Error('R053 elevation mismatch');});
 return{mode:apply?'authority-prepared':'authority-plan',restoreState:state,statements};
}
export async function restoreR053Maintenance(c,config,state,{apply=false}={}){
 const ctx=await context(c,config);if(state?.version!==1||!same(ctx,state.context))throw Error('R053 restore context mismatch');
 if(!Array.isArray(state.baseline)||state.baseline.length!==2||!same(state.baseline.map(x=>x.role),owners)||state.baseline.some(x=>x.create!==null||x.membership?.role!==x.role||x.membership?.member!==ctx.operator||x.membership?.grantor!==ctx.grantor||x.membership?.admin_option!==false||x.membership?.inherit_option!==false||x.membership?.set_option!==false)||!same(state.elevated,state.baseline.map(x=>({...x,membership:{...x.membership,inherit_option:true,set_option:true},create:{grantor:ctx.schemaGrantor,grantee:x.role,grantable:false}}))))throw Error('Invalid R053 restoration snapshot');
 closed(await roles(c));const actual=await selected(c,ctx);
 if(same(actual,state.baseline))return{mode:'authority-already-restored',statements:[]};if(!same(actual,state.elevated))throw Error('Owned authority changed concurrently');
 const statements=state.baseline.flatMap(x=>[`SET LOCAL ROLE ${q(ctx.schemaGrantor)}`,`REVOKE CREATE ON SCHEMA public FROM ${q(x.role)} RESTRICT`,`RESET ROLE`,memberSql(ctx,x.membership)]);
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);if(!same(await selected(c,ctx),state.baseline))throw Error('R053 restoration mismatch');});
 return{mode:apply?'authority-restored':'restore-plan',statements};
}
async function capture(c,ctx){const x=(await c.query("SELECT p.oid::text,pg_get_userbyid(p.proowner) owner,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('public.pwa_capture_notification_v1()')")).rows[0];if(!x||x.owner!==owners[0])throw Error('Exact capture ownership required');const h=(await c.query("SELECT 1 FROM public.flyway_schema_history WHERE version='88' AND success")).rowCount;if(!h)throw Error('Applied V88 required');return{database:ctx.database,...x};}
export async function configureR053Capture(c,config,{enabled,apply=false,expectedBefore=null}={}){
 if(typeof enabled!=='boolean')throw Error('Explicit capture boolean required');const ctx=await context(c,config),before=await capture(c,ctx);if(expectedBefore&&!same(before,expectedBefore))throw Error('Capture baseline changed');
 const value=enabled?'mw_pwa_capture_enabled_v1':'mw_pwa_capture_disabled_v1',statements=[`SET LOCAL ROLE ${q(owners[0])}`,`ALTER FUNCTION public.pwa_capture_notification_v1() SET application_name='${value}'`,`RESET ROLE`];let after=before;
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);after=await capture(c,ctx);const expected=[...(before.proconfig??[]).filter(x=>!x.startsWith('application_name=')),'application_name='+value].sort();if(after.owner!==before.owner||after.oid!==before.oid||!same([...(after.proconfig??[])].sort(),expected))throw Error('Capture config changed unexpectedly');});
 return{mode:apply?'capture-configured':'capture-plan',before,after,enabled,statements};
}

// Exact reviewed dependency bytes are supplied by the operator CLI with a hash pin.
export async function grantR053JobDependencies(c,config,manifest,{apply=false,reviewedManifestSha256}={}){
 const ctx=await context(c,config);closed(await roles(c));
 if(!/^[a-f0-9]{64}$/.test(reviewedManifestSha256??'')||createHash('sha256').update(JSON.stringify(manifest)).digest('hex')!==reviewedManifestSha256)throw Error('Exact reviewed dependency hash required');
 if(manifest?.schemaVersion!==1||manifest.database!=='loan_manager_dev'||manifest.owner!=='mw_jobs_owner_dev'||!Array.isArray(manifest.executeRoots)||!manifest.select||!manifest.insert||!manifest.update)throw Error('Reviewed DEV dependency manifest required');
 const statements=[],before={relations:[],columns:[],routines:[]};
 for(const privilege of ['select','insert','update'])for(const [relation,columns]of Object.entries(manifest[privilege])){
  const row=(await c.query("SELECT c.oid FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=$1 AND c.relkind IN ('r','p','v','m')",[relation])).rows[0];if(!row)throw Error('Missing dependency relation');
  if(!before.relations.some(x=>x.name===relation)){
   before.relations.push((await c.query('SELECT relname name,relacl::text acl FROM pg_class WHERE oid=$1',[row.oid])).rows[0]);
   before.columns.push(...(await c.query('SELECT $2::text relation,attname name,attacl::text acl FROM pg_attribute WHERE attrelid=$1 AND attnum>0 AND NOT attisdropped ORDER BY attnum',[row.oid,relation])).rows);
  }
  if(columns!==null&&(!Array.isArray(columns)||!columns.length||new Set(columns).size!==columns.length||columns.some(x=>typeof x!=='string'||!x)))throw Error('Invalid dependency columns');
  if(columns)for(const col of columns)if(!(await c.query('SELECT 1 FROM pg_attribute WHERE attrelid=$1 AND attname=$2 AND attnum>0 AND NOT attisdropped',[row.oid,col])).rowCount)throw Error('Missing dependency column');
  statements.push(`GRANT ${privilege.toUpperCase()}${columns?'('+columns.map(q).join(',')+')':''} ON TABLE public.${q(relation)} TO mw_jobs_owner_dev`);
 }
 for(const signature of manifest.executeRoots){const x=(await c.query('SELECT p.oid::regprocedure::text signature,p.proacl::text acl FROM pg_proc p WHERE p.oid=to_regprocedure($1)',[signature])).rows[0];if(!x?.signature)throw Error('Missing exact canonical dependency');before.routines.push(x);statements.push(`GRANT EXECUTE ON FUNCTION ${x.signature} TO mw_jobs_owner_dev`);}
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);});return{mode:apply?'jobs-dependencies-applied':'jobs-dependencies-plan',context:ctx,before,reviewedManifestSha256,statements};
}
export async function bindR053Runtime(c,config,{kind,apply=false}={}){
 const ctx=await context(c,config);if(ctx.mode!=='implicit-cloudsql'||!['api','notify','jobs'].includes(kind))throw Error('Fixed DEV runtime binding required');
 const stem=kind==='api'?'command':kind,role=kind==='api'?'mw_notify_api_dev':kind==='notify'?'mw_notify_dispatch_dev':'mw_jobs_dev',user=`mw-credit-app-${stem}-dev@clever-oasis-508610-n7.iam`;
 const x=(await c.query('SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1',[user])).rows[0];if(!x?.rolcanlogin||x.rolsuper||x.rolcreatedb||x.rolcreaterole||x.rolreplication||x.rolbypassrls)throw Error('Existing closed IAM runtime required');
 const ms=await memberships(c);if(ms.some(x=>x.member===user&&(x.admin_option||x.set_option||![role,'cloudsqliamserviceaccount',...(kind==='api'?['mw_app_dev']:[])].includes(x.role))))throw Error('Runtime has unreviewed membership');
 const statements=[`GRANT ${q(role)} TO ${q(user)} WITH ADMIN FALSE, INHERIT TRUE, SET FALSE`];
 if(apply)await transaction(c,async()=>{for(const sql of statements)await c.query(sql);const now=await memberships(c);const x=now.filter(x=>x.member===user&&x.role===role);if(x.length!==1||x[0].admin_option||!x[0].inherit_option||x[0].set_option)throw Error('Runtime binding mismatch');});
 return{mode:apply?'runtime-bound':'runtime-plan',kind,user,capability:role,beforeMemberships:ms.filter(x=>x.member===user),statements};
}
