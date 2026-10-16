import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {readFile,realpath} from 'node:fs/promises';import {basename,dirname} from 'node:path';
import {bindR053Runtime} from '../../scripts/database/r053-operator-tooling.mjs';
test('real managed base tuples survive narrow binding; unsafe grantor ADMIN SET and owner tuples fail closed',async()=>{
 const e=process.env;assert.equal(e.PHASE8_TEST_DISPOSABLE,'1');assert.equal(e.PHASE8_TEST_HOST,'127.0.0.1');assert.equal(e.PHASE8_TEST_DATABASE,'loan_manager_dev');const data=await realpath(e.PHASE8_TEST_DATA_DIRECTORY);assert.equal(basename(data),'data');assert.match(basename(dirname(data)),/^mw-phase8-[a-f0-9]{32}$/);assert.equal(Number((await readFile(data+'/postmaster.pid','utf8')).split(/\r?\n/)[3]),Number(e.PHASE8_TEST_PORT));
 const base={host:'127.0.0.1',port:Number(e.PHASE8_TEST_PORT),database:'loan_manager_dev'},bootstrap=new pg.Client({...base,user:'c_r053_binding_init'});await bootstrap.connect();let admin,operator;
 const q=x=>'"'+x.replaceAll('"','""')+'"',config={database:'loan_manager_dev',creators:['postgres'],executionMode:'cloudsql-dev'},users=['command','notify','jobs'].map(x=>`mw-credit-app-${x}-dev@clever-oasis-508610-n7.iam`),capabilities=['mw_notify_api_dev','mw_notify_dispatch_dev','mw_jobs_dev'];
 const snapshot=async c=>(await c.query("SELECT r.rolname role,m.rolname member,g.rolname grantor,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor WHERE m.rolname=ANY($1::text[]) ORDER BY 1,2,3",[users])).rows;
 try{
  await bootstrap.query('CREATE ROLE c_r053_binding_bootstrap LOGIN SUPERUSER;CREATE ROLE cloudsqladmin NOLOGIN CREATEROLE;CREATE ROLE cloudsqliamserviceaccount NOLOGIN;CREATE ROLE c_r053_binding_unknown NOLOGIN');
  for(const role of [...capabilities,'mw_app_dev','cloudsqliamserviceaccount','mw_notify_owner_dev']){await bootstrap.query(`GRANT ${q(role)} TO cloudsqladmin WITH ADMIN TRUE,INHERIT TRUE,SET TRUE`);await bootstrap.query(`REVOKE ${q(role)} FROM postgres GRANTED BY postgres`);}
  await bootstrap.query('GRANT cloudsqladmin TO postgres WITH ADMIN FALSE,INHERIT TRUE,SET TRUE');
  for(const user of users){await bootstrap.query(`CREATE ROLE ${q(user)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await bootstrap.query(`GRANT cloudsqliamserviceaccount TO ${q(user)} WITH ADMIN FALSE,INHERIT TRUE,SET TRUE GRANTED BY cloudsqladmin`);}
  await bootstrap.query(`GRANT mw_app_dev TO ${q(users[0])} WITH ADMIN FALSE,INHERIT TRUE,SET FALSE GRANTED BY cloudsqladmin`);
  admin=new pg.Client({...base,user:'c_r053_binding_bootstrap'});await admin.connect();operator=new pg.Client({...base,user:'postgres'});await operator.connect();assert.equal((await operator.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper,false);
  let mutations=0;
  // Only network identity is substituted. Every role flag, tuple and GRANT is
  // executed by a real nonsuperuser against the owned PostgreSQL catalogue.
  const client={async query(sql,args){if(sql==='BEGIN'||sql.startsWith('GRANT '))mutations++;const result=await operator.query(sql,args);if(sql.startsWith('SELECT current_database()')){result.rows[0].host='136.85.127.134';result.rows[0].port=5432;}return result;}};
  const original=await snapshot(admin),managed=original.filter(x=>x.role==='cloudsqliamserviceaccount');assert.equal(managed.length,3);
  for(const kind of ['api','notify','jobs'])assert.equal((await bindR053Runtime(client,config,{kind,apply:true})).mode,'runtime-bound');
  const bound=await snapshot(admin);assert.deepEqual(bound.filter(x=>x.role==='cloudsqliamserviceaccount'),managed);assert.deepEqual(bound.filter(x=>x.role==='mw_app_dev'),original.filter(x=>x.role==='mw_app_dev'));
  for(const [i,role]of capabilities.entries())assert.deepEqual(bound.find(x=>x.role===role&&x.member===users[i]),{role,member:users[i],grantor:'cloudsqladmin',admin_option:false,inherit_option:true,set_option:false});
  const unsafe=[
   {setup:`GRANT cloudsqliamserviceaccount TO ${q(users[1])} WITH ADMIN TRUE,INHERIT TRUE,SET TRUE GRANTED BY cloudsqladmin`,reset:`GRANT cloudsqliamserviceaccount TO ${q(users[1])} WITH ADMIN FALSE,INHERIT TRUE,SET TRUE GRANTED BY cloudsqladmin`},
   {setup:`GRANT mw_notify_dispatch_dev TO ${q(users[1])} WITH ADMIN FALSE,INHERIT TRUE,SET TRUE GRANTED BY cloudsqladmin`,reset:`GRANT mw_notify_dispatch_dev TO ${q(users[1])} WITH ADMIN FALSE,INHERIT TRUE,SET FALSE GRANTED BY cloudsqladmin`},
   {setup:`GRANT mw_notify_owner_dev TO ${q(users[1])} WITH ADMIN FALSE,INHERIT TRUE,SET FALSE GRANTED BY cloudsqladmin`,reset:`REVOKE mw_notify_owner_dev FROM ${q(users[1])} GRANTED BY cloudsqladmin`},
   {setup:`GRANT mw_notify_dispatch_dev TO c_r053_binding_unknown WITH ADMIN TRUE;GRANT mw_notify_dispatch_dev TO ${q(users[1])} WITH ADMIN FALSE,INHERIT TRUE,SET FALSE GRANTED BY c_r053_binding_unknown`,reset:`REVOKE mw_notify_dispatch_dev FROM ${q(users[1])} GRANTED BY c_r053_binding_unknown`}
  ];
  for(const vector of unsafe){await admin.query(vector.setup);const before=await snapshot(admin),count=mutations;await assert.rejects(bindR053Runtime(client,config,{kind:'notify',apply:true}),/unreviewed membership/);assert.equal(mutations,count);assert.deepEqual(await snapshot(admin),before,'rejection mutates no runtime tuple');await admin.query(vector.reset);}
  assert.deepEqual(await snapshot(admin),bound);
 }finally{await operator?.end();await admin?.end();await bootstrap.end();}
});
