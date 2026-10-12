import test from 'node:test';import assert from 'node:assert/strict';
import {planGroupedOwnerMaintenance,temporarySchemaCapability,validateTemporary} from '../../scripts/database/grouped-owner-maintenance.mjs';
const owners=['mw_app_dev_journal_owner','mw_app_prod_journal_owner'];
const context={database:'loan_manager_prod',operator:'migration_operator',bindings:owners.map(ownerRole=>({ownerRole,membershipGrantor:'migration_operator',schemaGrantor:'schema_owner',membershipMode:'explicit'}))};
const membership=owner=>({role:owner,member:'migration_operator',grantor:'migration_operator',admin_option:true,inherit_option:false,set_option:false});
const baseline=()=>({temporary:null,selected:owners.map(ownerRole=>({ownerRole,membership:membership(ownerRole),schemaCreate:null}))});
test('temporary capability replaces direct DEV CREATE; owner ADMIN and existing PROD grant option retained',()=>{
 const before=baseline();before.selected[1].schemaCreate={grantor:'schema_owner',grantee:owners[1],privilege:'CREATE',grantable:true};
 const plan=planGroupedOwnerMaintenance(context,before);
 assert.equal(plan.elevated[0].schemaCreate,null);assert.equal(plan.elevated[1].schemaCreate.grantable,true);
 for(const row of plan.elevated){assert.equal(row.membership.admin_option,true);assert.equal(row.membership.inherit_option,true);assert.equal(row.membership.set_option,true);}
 assert.ok(plan.statements.includes(`GRANT "${temporarySchemaCapability}" TO "${owners[0]}" WITH ADMIN FALSE, INHERIT TRUE, SET FALSE`));
 assert.equal(plan.statements.some(sql=>sql===`GRANT CREATE ON SCHEMA public TO "${owners[0]}"`),false);
 assert.equal(plan.statements.filter(sql=>sql.startsWith('GRANT CREATE ON SCHEMA')).length,1);
});
test('only exact Cloud SQL binding accepts observed absent creator and fixed cloudsqladmin member tuple',()=>{
 const cloud={...context,operator:'postgres',bindings:context.bindings.map(b=>({...b,membershipMode:'implicit-cloudsql',membershipGrantor:'cloudsqladmin'}))};
 const value={role:{oid:'123',rolname:temporarySchemaCapability,rolcanlogin:false,rolinherit:false,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false,rolconnlimit:-1,rolvaliduntil:null,rolconfig:null},memberships:[{role:temporarySchemaCapability,member:owners[0],grantor:'cloudsqladmin',admin_option:false,inherit_option:true,set_option:false}],acl:[{grantor:'schema_owner',grantee:temporarySchemaCapability,privilege:'CREATE',grantable:false}],dependencies:[]};
 assert.doesNotThrow(()=>validateTemporary(value,cloud));assert.throws(()=>validateTemporary(value,context));
 for(const change of [{grantor:'postgres'},{admin_option:true},{set_option:true},{inherit_option:false}])assert.throws(()=>validateTemporary({...value,memberships:[{...value.memberships[0],...change}]},cloud));
 assert.throws(()=>validateTemporary({...value,memberships:[...value.memberships,{role:temporarySchemaCapability,member:'postgres',grantor:'cloudsqladmin',admin_option:true,inherit_option:false,set_option:false}]},cloud));
});
test('missing owner grants use exact tuples, closed capability and PROD CREATE only',()=>{
 const before=baseline();for(const row of before.selected)row.membership=null;
 const plan=planGroupedOwnerMaintenance(context,before);assert.equal(plan.elevated[0].schemaCreate,null);assert.equal(plan.elevated[1].schemaCreate.grantable,false);
 assert.match(plan.statements.find(s=>s.startsWith('CREATE ROLE')),/NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS$/);
 assert.equal(plan.statements.some(sql=>/PUBLIC|CONNECT|CASCADE|ALTER ROLE/.test(sql)),false);
});
test('preexisting capability, direct DEV CREATE, partial and wrong environment fail closed',()=>{
 assert.throws(()=>planGroupedOwnerMaintenance(context,{...baseline(),temporary:{}}),/absent initially/);
 const before=baseline();before.selected[0].schemaCreate={grantor:'schema_owner',grantee:owners[0],privilege:'CREATE',grantable:false};assert.throws(()=>planGroupedOwnerMaintenance(context,before),/Legacy direct/);
 assert.throws(()=>planGroupedOwnerMaintenance({...context,database:'loan_manager_dev'},baseline()));
 assert.throws(()=>planGroupedOwnerMaintenance(context,{temporary:null,selected:[{ownerRole:owners[0]},{}]}));
});
