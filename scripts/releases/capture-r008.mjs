import { databaseRoot } from '../database-location.mjs';
// Convert independently captured, sanitized saved editor/AppDoc observations into a reviewable DEV candidate.
// This tool never contacts or edits AppSheet or a database. Run only after reviewing the running edit record.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {candidateHash,compare} from './delta.mjs';
const dir='outputs/r008-20260918';
if(await fs.stat(`${dir}/FROZEN.md`).then(()=>true,()=>false))throw Error('R008 revision 1 is frozen; create a reviewed revision instead of overwriting it.');
const read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const write=async(p,x)=>fs.writeFile(p,JSON.stringify(x,null,2)+'\n');
const captured=await read(`${dir}/dev-appdoc-readback.json`),bots=await read(`${dir}/dev-bots-readback.json`);
const apps={OLTP:{dev:'65faacd8-2b0d-43bf-9e0a-58eb915dcf9b',prod:'93844270-6aa5-420b-a960-bcdf08abd357'},OLAP:{dev:'494cd013-0d9b-482f-9559-c9d83059de91',prod:'e74dd368-654f-44d7-bccf-83cf361d1cdb'}};
const items=[],observations=[];
function add(app,object,property,value,operation,evidence,prod=value,reason){
 const id=`${app}-${String(items.filter(i=>i.app===app).length+1).padStart(3,'0')}`;
 const item={id,app,object,property,operation,dev:{state:'value',value},prod:{state:'value',value:prod},evidence};
 if(operation==='add')item.before={state:'absent'};
 if(reason)item.environmentReason=reason;
 items.push(item);observations.push({id,appId:apps[app].dev,version:app==='OLTP'?'1.000176':'1.000169',observedAt:captured.capturedAt,evidence,observed:{state:'value',value}});
}
for(const a of captured.apps)for(const s of a.sections){
 const p=s.properties,evidence=`${dir}/dev-appdoc-readback.json: ${a.app}/${s.id}`;
 if(s.id.includes('_Schema_col')){
  const table=s.id.slice(6,s.id.indexOf('_Schema_col')),col=p['Column name'],obj=`Column ${table}.${col}`;
  const isNew=/Cash Accounts|Cash Account Balances/.test(table)||/Cash Account|Payment Request Token/.test(col);
  if(isNew){add(a.app,obj,'definition',p,'add',evidence);continue;}
  if(a.app==='OLTP'&&table==='Payments'&&col==='Ref Received By Cash Holder'){
   for(const prop of ['Read-Only','Reset on edit?','Initial value'])add(a.app,obj,prop,p[prop],'change',evidence);
   for(const prop of ['Valid_If','Editable_If','Reset_If'])add(a.app,obj,`Type Qualifier.${prop}`,p['Type Qualifier'][prop],'change',evidence);
  }
  if((a.app==='OLTP'&&table==='Business Expenses'&&col==='Ref Paid By Cash Holder')||(a.app==='OLAP'&&table==='Cash Ledger')){
   add(a.app,obj,'Type Qualifier.Editable_If',p['Type Qualifier'].Editable_If,'change',evidence);
   if(table==='Cash Ledger'&&/Cash Holder/.test(col))add(a.app,obj,'Type Qualifier.Valid_If',p['Type Qualifier'].Valid_If,'change',evidence);
  }
 }else if(s.id.startsWith('table_')){
  if(['Cash Accounts','Cash Account Balances'].includes(p['Table name'])){
   const prod={...p,'Data Source':'database-2'};add(a.app,`Table ${p['Table name']}`,'definition',p,'add',evidence,prod,'DEV database-3 to verified PROD database-2; public SQL object names stay identical.');
  }
 }else if(s.id.startsWith('slice_')){
  const isNew=p['Slice Name'].startsWith('R008');
  if(isNew)add(a.app,`Slice ${p['Slice Name']}`,'definition',p,'add',evidence);
  else add(a.app,`Slice ${p['Slice Name']}`,'Slice Columns',p['Slice Columns'],'change',evidence);
 }else if(s.id.startsWith('view')){
  const isNew=/^(R008 |Cash Account)/.test(p['View name']);
  if(isNew)add(a.app,`View ${p['View name']}`,'definition',p,'add',evidence);
  else if(p['View name']==='Cash Position')add(a.app,'View Cash Position','View configuration.ViewEntries',p['View configuration'].ViewEntries,'change',evidence);
  else add(a.app,`View ${p['View name']}`,'View configuration.ColumnOrder',p['View configuration'].ColumnOrder,'change',evidence);
 }else if(s.id.startsWith('action_')){
  const obj=`Action ${p['For a record of this table']}.${p['Action name']}`;
  if(p['Action name'].startsWith('View Ref'))add(a.app,obj,'definition',p,'add',evidence);
  else if(p['Action name']==='Complete Transfer')add(a.app,obj,'With these properties.Assignments',p['With these properties'].Assignments,'change',evidence);
  else for(const prop of ['Do this','With these properties','Needs confirmation?','Prominence','Modifies data?','Attach to column',...(p['To this value']?['To this value']:[])])add(a.app,obj,prop,p[prop],'change',evidence);
 }
}
for(const [name,source] of [['R008 Receive All','R008 Borrower Commands'],['R008 Receive Full','R008 Charge Commands'],['R008 Close Loan','R008 Loan Commands']])add('OLTP',`View ${name}`,'For this data',source,'change',`${dir}/REPORT.md: saved current-editor view bindings observed 2026-09-18`);
for(const b of bots){
 const dev={enabled:true,event:b.event,steps:[b.tasks[0],{name:'Notify payment-closed loans',condition:b.branch,yes:[b.tasks[1]],no:[]}]};
 const prod=structuredClone(dev);
 const key=b.tasks[0].deepLink.slice('LINKTOROW('.length).replace(/, "Payments_Detail"\)$/,'');
 const to=`SELECT( Partners[Email], AND(ISNOTBLANK([Email]), [Email] <> LOOKUP(${key}, "Payments", "Row ID", "Created By")))`;
 prod.steps[0].to=to;prod.steps[1].yes[0].to=to;
 add('OLTP',`Bot ${b.bot}`,'definition',dev,'add',`${dir}/dev-bots-readback.json; ${dir}/REPORT.md: successful enabled bot monitor runs`,prod,'DEV owner-only LIST("welct0407@mw-credit.com"); proposed PROD target preserves current receipt recipient meaning: nonblank Partners emails except the exact receipt Created By. Read-only baseline 3.000173 verified; new originating-table context requires receipt lookup. Requires owner acceptance and PROD drift/readback at promotion.');
}
const delta={schemaVersion:1,release:'R008',revision:1,apps,continuation:{versions:'DEV SQL V24; OLTP 1.000176; OLAP 1.000169; both Prototype. PROD unchanged V22 / 3.000173 / 1.100131.',done:'Account workflows and synthetic GUI/SQL tests implemented. Saved observations captured. See REPORT.md for exact coverage.',next:'Owner fallback/mobile acceptance and explicit opening allocations; no production authorization. Candidate remains reviewable, not promoted.',decisions:'Use design 9.3 single-field form fallback; account openings remain uninitialized rather than inferring historical splits.',evidence:'outputs/r008-20260918/REPORT.md; appsheet-edit-record.md; dev-appdoc-readback.json; dev-bots-readback.json'},items};
await write(`${dir}/release-delta.json`,delta);
const observed={release:'R008',revision:1,candidateHash:candidateHash(delta),environment:'dev',items:observations};
await write(`${dir}/dev-saved-observations.json`,observed);
await write(`${dir}/dev-comparison-r1.json`,compare(delta,observed));
const migrations=[];for(const name of (await fs.readdir(databaseRoot+'/' + 'database/migrations')).filter(n=>/^V.*\.sql$/.test(n)).sort())migrations.push({name,sha256:crypto.createHash('sha256').update(await fs.readFile(databaseRoot+'/' + `database/migrations/${name}`)).digest('hex')});
await write(`${dir}/flyway-manifest-r1.json`,{environment:'development',baselineProductionVersion:'22',testedDevelopmentVersion:'24',pendingPromotionVersions:['23','24'],validationReference:'REPORT.md; applied immutable V23/V24 and prior successful 25-migration validation',migrations});
console.log(`${items.length} exact target items captured, ${migrations.length} migration hashes`);
