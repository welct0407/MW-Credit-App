// DEV-only administration helpers. Injected client; no credentials or ambient DSN.
import { planApplicationRole, reconcileApplicationRole } from './app-role-policy.mjs';
const APP='mw_app_dev', OWNER='mw_app_dev_journal_owner';
const quote=x=>'"'+x.replaceAll('"','""')+'"';
function configCheck(config){if(!['loan_manager_dev','payment_rehearsal'].includes(config?.database)||!Array.isArray(config.creators)||!config.creators.length)throw Error('Explicit DEV database and registered creators required');}
async function target(client,config){configCheck(config);if((await client.query('SELECT current_database() AS db')).rows[0]?.db!==config.database)throw Error('Wrong DEV administration target');}
export async function captureApplicationRoleSnapshot(client,config){
 await target(client,config);
 const objects=(await client.query(`
 SELECT 'DATABASE' kind,d.oid::text oid,quote_ident(d.datname) target,pg_get_userbyid(d.datdba) owner,d.datacl::text acl,NULL::text AS "column" FROM pg_database d WHERE d.datname=current_database()
 UNION ALL SELECT 'SCHEMA',n.oid::text,quote_ident(n.nspname),pg_get_userbyid(n.nspowner),n.nspacl::text,NULL FROM pg_namespace n WHERE n.nspname='public'
 UNION ALL SELECT CASE WHEN c.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,c.oid::text,format('%I.%I',n.nspname,c.relname),pg_get_userbyid(c.relowner),c.relacl::text,NULL FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')
 UNION ALL SELECT 'COLUMN',c.oid::text,format('%I.%I',n.nspname,c.relname),pg_get_userbyid(c.relowner),a.attacl::text,quote_ident(a.attname) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT CASE WHEN p.prokind='p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,p.oid::text,format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)),pg_get_userbyid(p.proowner),p.proacl::text,NULL FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')
 ORDER BY kind,oid,"column"`)).rows;
 const rights=[];
 for(const o of objects){if(!o.acl)continue;const entries=(await client.query('SELECT privilege_type privilege,bool_or(is_grantable) grantable FROM aclexplode($1::aclitem[]) WHERE grantee=$2::regrole GROUP BY privilege_type',[o.acl,APP])).rows;for(const e of entries)rights.push({kind:o.kind,oid:o.oid,target:o.target,column:o.column,owner:o.owner,...e});}
 const memberships=(await client.query(`SELECT r.rolname role,m.rolname member,a.admin_option admin,a.inherit_option inherit,a.set_option AS "set" FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member WHERE r.rolname=$1 ORDER BY member`,[APP])).rows;
 const defaultAcls=(await client.query(`SELECT d.oid::text oid,pg_get_userbyid(d.defaclrole) creator,coalesce(n.nspname,'*') schema,d.defaclobjtype kind,d.defaclacl::text acl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE d.defaclrole=ANY(SELECT oid FROM pg_roles WHERE rolname=ANY($1)) ORDER BY d.oid`,[config.creators])).rows;
 return {version:1,database:config.database,creators:[...config.creators],objects,rights,memberships,defaultAcls};
}
const rightKey=r=>JSON.stringify([r.kind,r.oid,r.target,r.column,r.privilege]);
const memberKey=m=>m.role+'\0'+m.member;
const onClause=r=>r.kind==='COLUMN'?`(${r.column}) ON TABLE ${r.target}`:`ON ${r.kind} ${r.target}`;
const grantSql=r=>`GRANT ${r.privilege} ${onClause(r)} TO ${APP}${r.grantable?' WITH GRANT OPTION':''}`;
const revokeSql=(r,option=false)=>`REVOKE ${option?'GRANT OPTION FOR ':''}${r.privilege} ${onClause(r)} FROM ${APP}`;
const memberSql=m=>`GRANT ${APP} TO ${quote(m.member)} WITH ADMIN ${m.admin?'TRUE':'FALSE'}, INHERIT ${m.inherit?'TRUE':'FALSE'}, SET ${m.set?'TRUE':'FALSE'}`;
const recoveryPrivileges={DATABASE:new Set(['CONNECT','CREATE','TEMPORARY']),SCHEMA:new Set(['USAGE','CREATE']),TABLE:new Set(['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']),COLUMN:new Set(['SELECT','INSERT','UPDATE','REFERENCES']),SEQUENCE:new Set(['USAGE','SELECT','UPDATE']),FUNCTION:new Set(['EXECUTE']),PROCEDURE:new Set(['EXECUTE'])};
function validateRecoverySnapshot(snapshot){
 if(!Array.isArray(snapshot?.rights)||!Array.isArray(snapshot?.memberships))throw Error('Malformed recovery snapshot');
 for(const right of snapshot.rights){if(!Object.hasOwn(recoveryPrivileges,right.kind)||!recoveryPrivileges[right.kind].has(right.privilege)||typeof right.grantable!=='boolean')throw Error('Invalid recovery privilege or grant option');}
 for(const membership of snapshot.memberships){if(membership.role!==APP||typeof membership.member!=='string'||!membership.member||['admin','inherit','set'].some(k=>typeof membership[k]!=='boolean'))throw Error('Invalid recovery membership');}
}
export function planApplicationRoleRecovery({before,after,current}){
 for(const snapshot of [before,after,current])validateRecoverySnapshot(snapshot);
 if([before,after,current].some(s=>s?.version!==1)||before.database!==after.database||before.database!==current.database||!['loan_manager_dev','payment_rehearsal'].includes(before.database))throw Error('Incompatible DEV recovery snapshots');
 if(JSON.stringify(before.defaultAcls)!==JSON.stringify(after.defaultAcls))throw Error('Recovery cannot alter shared default ACLs');
 const statements=[],violations=[];
 const b=new Map(before.rights.map(r=>[rightKey(r),r])),a=new Map(after.rights.map(r=>[rightKey(r),r])),c=new Map(current.rights.map(r=>[rightKey(r),r]));
 for(const key of new Set([...b.keys(),...a.keys()])){const old=b.get(key),applied=a.get(key),now=c.get(key);if(JSON.stringify(old)===JSON.stringify(applied))continue;const r=old??applied;const identity=current.objects.find(o=>o.kind===r.kind&&o.oid===r.oid&&o.column===r.column);if(!identity||identity.target!==r.target||identity.owner!==r.owner){violations.push('Recovery object identity/owner changed: '+r.target);continue;}
  if(!old&&applied&&now){if(now.grantable&&!applied.grantable){violations.push('Introduced privilege later upgraded: '+r.target);continue;}statements.push(revokeSql(r));}
  else if(old&&!applied&&!now)statements.push(grantSql(old));
  else if(old&&applied&&now&&old.grantable!==applied.grantable&&now.grantable===applied.grantable)statements.push(old.grantable?grantSql(old):revokeSql(r,true));
 }
 const bm=new Map(before.memberships.map(m=>[memberKey(m),m])),am=new Map(after.memberships.map(m=>[memberKey(m),m])),cm=new Map(current.memberships.map(m=>[memberKey(m),m]));
 for(const key of new Set([...bm.keys(),...am.keys()])){const old=bm.get(key),applied=am.get(key),now=cm.get(key);if(JSON.stringify(old)===JSON.stringify(applied))continue;if(now&&JSON.stringify(now)!==JSON.stringify(applied)){violations.push('Recovery membership changed after application: '+now.member);continue;}if(!old&&applied&&now)statements.push(`REVOKE ${APP} FROM ${quote(now.member)}`);else if(old&&(!now||JSON.stringify(now)===JSON.stringify(applied)))statements.push(memberSql(old));}
 return {database:before.database,statements,violations,mode:'recovery-plan'};
}
export async function recoverApplicationRole(client,{before,after},{apply=false}={}){
 const config={database:before.database,creators:before.creators};await target(client,config);if(apply)await client.query('BEGIN');try{const current=await captureApplicationRoleSnapshot(client,config);const plan=planApplicationRoleRecovery({before,after,current});if(apply){if(plan.violations.length)throw Error('Recovery readiness violations');for(const sql of plan.statements)await client.query(sql);await client.query('COMMIT');}return{...plan,mode:apply?'recovered':plan.mode};}catch(e){if(apply)await client.query('ROLLBACK').catch(()=>{});throw e;}
}
export async function provisionApplicationRuntimeMembership(client,config,{apply=false}={}){
 await target(client,config);if(typeof config.runtimeUser!=='string'||!config.runtimeUser||[APP,OWNER,'postgres'].includes(config.runtimeUser))throw Error('Explicit non-admin existing runtime login required');
 const roles=(await client.query('SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1)',[[APP,OWNER,config.runtimeUser]])).rows;
 const runtime=roles.find(r=>r.rolname===config.runtimeUser);if(!runtime?.rolcanlogin||runtime.rolsuper||runtime.rolcreatedb||runtime.rolcreaterole||runtime.rolreplication||runtime.rolbypassrls)throw Error('Unsafe or missing runtime login');
 if(!roles.some(r=>r.rolname===APP)||!roles.some(r=>r.rolname===OWNER))throw Error('Capability roles must be provisioned before membership');
 for(const name of [APP,OWNER]){const r=roles.find(x=>x.rolname===name);if(r.rolcanlogin||r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls)throw Error('Unsafe capability role');}
 if((await client.query("SELECT pg_has_role($1,$2,'MEMBER') AS owner_member",[config.runtimeUser,OWNER])).rows[0].owner_member)throw Error('Runtime inherits protected journal owner');
 for(const creator of config.creators){if((await client.query("SELECT pg_has_role($1,$2,'MEMBER') AS creator_member",[config.runtimeUser,creator])).rows[0].creator_member)throw Error('Runtime inherits registered migration creator');}
 const statement=memberSql({member:config.runtimeUser,admin:false,inherit:true,set:false});if(apply)await client.query(statement);return{database:config.database,runtimeUser:config.runtimeUser,statements:[statement],mode:apply?'membership-applied':'membership-plan'};
}
export async function runDevelopmentPostMigrationHook(client,config,{environment,command,apply=false}={}){
 if(environment!=='development'||command!=='migrate')return{mode:'skipped',reason:'DEV migrate only'};
 await target(client,config);if(!(await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[APP])).rowCount)return{mode:'skipped',reason:'Capability package absent'};
 const plan=await planApplicationRole(client,config);if(plan.violations.length)throw Error('Postmigration capability readiness violations');return reconcileApplicationRole(client,config,{apply});
}
