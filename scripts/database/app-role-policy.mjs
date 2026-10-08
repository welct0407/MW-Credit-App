// Stable DEV application capability policy. No credentials, ambient DSN or automatic live invocation.
const APP='mw_app_dev';
const JOURNAL_OWNER='mw_app_dev_journal_owner';
const readonly=new Set(['pwa_payment_commands','r005_cash_cutover_sources','r008_cash_account_cutover']);
const deniedRoutines=new Set(['attach_payment_receipt_evidence','reallocate_payment_interest','reallocate_payment_interest_audited','initialize_cash_accounts']);
const approvedDefiner=row=>row.schema==='public'&&((row.owner===JOURNAL_OWNER&&((row.name==='pwa_submit_selected_charges_v1'&&row.args==='text')||(row.name==='pwa_command_status_v1'&&row.args==='uuid, text, text')))||(row.owner==='postgres'&&row.name==='payment_reallocation_permitted'&&row.args==='text, jsonb, jsonb'));
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const protectedObject=row=>/^(flyway_|agent_|audit_|secret_|credential_|migration_)/.test(row.name)||/^mw-access:(governance|secret)/.test(row.comment||'');
export async function planApplicationRole(client,{database,creators}) {
 if(!['loan_manager_dev','payment_rehearsal'].includes(database)||!Array.isArray(creators)||!creators.length||new Set(creators).size!==creators.length||creators.some(x=>typeof x!=='string'||!x||x.includes('\0')))throw Error('Explicit DEV database and creators required');
 if((await client.query('SELECT current_database() AS db')).rows[0]?.db!==database)throw Error('Wrong application policy database');
 const roles=(await client.query('SELECT rolname,rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=ANY($1)',[[APP,JOURNAL_OWNER,...creators]])).rows;
 for(const name of [APP,JOURNAL_OWNER]){const role=roles.find(r=>r.rolname===name);if(!role||role.rolcanlogin||role.rolsuper||role.rolcreaterole||role.rolcreatedb||role.rolreplication||role.rolbypassrls)throw Error('Unsafe or missing capability role');}
 if(creators.some(name=>!roles.some(r=>r.rolname===name)))throw Error('Unknown registered creator');
 const statements=[`GRANT USAGE ON SCHEMA public TO ${APP}`,`GRANT CONNECT ON DATABASE ${quote(database)} TO ${APP}`],violations=[],inheritedExceptions=[];
 const defaults=(await client.query(`
  SELECT pg_get_userbyid(d.defaclrole) AS creator,
   coalesce(n.nspname,'*') AS schema,d.defaclobjtype AS kind,
   CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
   a.privilege_type AS privilege
  FROM pg_default_acl d
  LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE a.grantee=$1::regrole
   OR (pg_get_userbyid(d.defaclrole)=ANY($2::text[])
    AND d.defaclobjtype IN ('r','S')
    AND CASE WHEN a.grantee=0 THEN true
     ELSE pg_has_role($1,a.grantee,'MEMBER') END)
 `,[APP,creators])).rows;
 if(defaults.length)violations.push('Capability default ACLs bypass object classification');
 if((await client.query("SELECT has_schema_privilege($1,'public','CREATE') AS allowed",[APP])).rows[0].allowed)violations.push('Capability has schema CREATE');
 const relations=(await client.query("SELECT c.oid,n.nspname AS schema,c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner,obj_description(c.oid,'pg_class') AS comment FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') ORDER BY c.oid")).rows;
 for(const row of relations){
  const target=quote(row.schema)+'.'+quote(row.name),objectType=row.kind==='S'?'SEQUENCE':'TABLE';
  statements.push(`REVOKE ALL ON ${objectType} ${target} FROM ${APP}`);
  if(protectedObject(row)||readonly.has(row.name)){
   const forbidden=protectedObject(row)?['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
   const effective=(await client.query("SELECT privilege FROM unnest($3::text[]) privilege WHERE has_table_privilege($1,$2::oid,privilege) UNION SELECT privilege FROM unnest($4::text[]) privilege WHERE has_any_column_privilege($1,$2::oid,privilege)",[APP,row.oid,forbidden,forbidden.filter(x=>['SELECT','INSERT','UPDATE','REFERENCES'].includes(x))])).rows;
   if(effective.length)violations.push(`Protected relation has effective access: ${row.name}`);
  }
  if(protectedObject(row))continue;
  if(!creators.includes(row.owner)){violations.push(`Unregistered relation creator: ${row.owner}`);continue;}
  const privilege=readonly.has(row.name)||['v','m'].includes(row.kind)?'SELECT':row.kind==='S'?'USAGE,SELECT':'SELECT,INSERT,UPDATE,DELETE';
  statements.push(`GRANT ${privilege} ON ${objectType} ${target} TO ${APP}`);
 }
 const routines=(await client.query("SELECT p.oid,n.nspname AS schema,oidvectortypes(p.proargtypes) AS args,p.proname AS name,p.prokind AS kind,p.prosecdef AS definer,pg_get_userbyid(p.proowner) AS owner,p.oid::regprocedure::text AS signature,obj_description(p.oid,'pg_proc') AS comment,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.oid")).rows;
 for(const row of routines){
  // regprocedure text is generated by PostgreSQL from catalog identifiers, never caller input.
  const type=row.kind==='p'?'PROCEDURE':'FUNCTION';
  if(row.kind==='f'&&row.definer&&row.owner===JOURNAL_OWNER&&approvedDefiner(row)){
   // These two owner-bound routines are provisioned once. Later migration hooks
   // audit their ACLs without trying to reacquire journal-owner authority.
   const acl=(await client.query(`SELECT
    EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE a.grantee=$2::regrole AND a.privilege_type='EXECUTE') AS app_execute,
    EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE a.grantee=$2::regrole AND a.privilege_type='EXECUTE' AND a.is_grantable) AS app_grant_option,
    (pg_has_role(current_user,p.proowner,'USAGE') OR
     has_function_privilege(current_user,p.oid,'EXECUTE WITH GRANT OPTION')) AS may_grant
    FROM pg_proc p WHERE p.oid=$1`,[row.oid,APP])).rows[0];
   if(row.public_execute)violations.push(`Journal routine has PUBLIC execution: ${row.signature}`);
   if(acl.app_grant_option)violations.push(`Journal routine capability has grant option: ${row.signature}`);
   if(!acl.app_execute){
    if(acl.may_grant&&!row.public_execute)statements.push(`GRANT EXECUTE ON FUNCTION ${row.signature} TO ${APP}`);
    else violations.push(`Journal routine grant requires initial owner-authorized provisioning: ${row.signature}`);
   }
   continue;
  }
  statements.push(`REVOKE ALL ON ${type} ${row.signature} FROM ${APP}`);
  const protectedRoutine=protectedObject(row)||deniedRoutines.has(row.name);
  if(protectedRoutine||(row.definer&&!approvedDefiner(row))){if(row.public_execute){if(row.name==='initialize_cash_accounts')inheritedExceptions.push('initialize_cash_accounts: legacy PUBLIC execution; protected cutover writes remain denied');else violations.push(`Protected routine has PUBLIC execution: ${row.name}`);}continue;}
  if(!creators.includes(row.owner)&&!(row.owner===JOURNAL_OWNER&&approvedDefiner(row))){violations.push(`Unregistered routine creator: ${row.owner}`);continue;}
  statements.push(`GRANT EXECUTE ON ${type} ${row.signature} TO ${APP}`);
 }
 return {database,creators:[...creators],defaultAclCoverage:defaults,inheritedExceptions,statements,violations:[...new Set(violations)]};
}
export async function reconcileApplicationRole(client,config,{apply=false}={}) {
 if(!apply)return {...await planApplicationRole(client,config),mode:'plan'};
 await client.query('BEGIN');
 try{
  const plan=await planApplicationRole(client,config);
  if(plan.violations.length)throw Error('Application role readiness violations');
  for(const statement of plan.statements)await client.query(statement);
  await client.query('COMMIT');return {...plan,mode:'applied'};
 }catch(error){try{await client.query('ROLLBACK')}catch{}throw error;}
}
