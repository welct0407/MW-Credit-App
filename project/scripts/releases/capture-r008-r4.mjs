// Package independently observed UI settings; no AppSheet/database access.
import fs from 'node:fs/promises';
import {candidateHash,compare,readJson,render} from './delta.mjs';
const base='outputs/r008-20260918',out=`${base}/r4`;
if(await fs.stat(`${out}/FROZEN.md`).then(()=>true,()=>false))throw Error('Revision 4 frozen');
const delta=await readJson(`${base}/r3/release-delta.json`),obs=await readJson(`${base}/r3/dev-saved-observations.json`);
delta.revision=4;obs.revision=4;
const changes=[];
function put(app,object,property,value,before,operation='change'){
 const prior=delta.items.find(i=>i.app===app&&i.object===object&&i.property===property);
 const id=prior?.id||`${app}-R4-${String(changes.length+1).padStart(3,'0')}`;
 const state=value===undefined?{state:'absent'}:{state:'value',value};
 const evidence=`${out}/${app==='OLTP'?'AT':'AA'}.json; REPORT.md`;
 const item=prior?{...prior,dev:state,prod:structuredClone(state),evidence}:{id,app,object,property,operation,before:before===undefined?{state:'absent'}:{state:'value',value:before},dev:state,prod:structuredClone(state),evidence};
 if(prior)delta.items[delta.items.indexOf(prior)]=item;else delta.items.push(item);
 obs.items=obs.items.filter(i=>i.id!==id);
 const receive=object==='Action Borrowers.Receive All Charges';
 obs.items.push({id,appId:delta.apps[app].dev,version:app==='OLTP'?(receive?'1.000181':'1.000180'):'1.000170',observedAt:app==='OLTP'?(receive?'2026-09-19T00:46:59+07:00':'2026-09-19T00:38:27+07:00'):'2026-09-19T00:43:32+07:00',evidence:receive?`${out}/RECEIVE_SAVED.json`:evidence,observed:structuredClone(state)});
 changes.push({...item,refinementBefore:before===undefined?{state:'absent'}:{state:'value',value:before}});
}
for(const [app,k] of [['OLTP','T'],['OLAP','A']]){
 const before=await readJson(`${out}/B${k}.json`),after=await readJson(`${out}/A${k}.json`);
 for(const s of after.sections){
  const b=before.sections.find(x=>x.id===s.id),p=s.properties;
  if(s.id.includes('_Schema_col')&&!b){
   const table=s.id.slice(6,s.id.indexOf('_Schema_col'));
   if(p['Column name']==='Borrower Reference TE'&&(p['App formula']!=='=[Ref Loans].[Ref Borrowers]'||p.Type!=='Ref'||p['Type Qualifier'].IsAPartOf!==false))throw Error('Invalid native reference');
   put(app,`Column ${table}.${p['Column name']}`,'definition',p,undefined,'add');
  }else if(s.id.startsWith('view')){
   const old=b.properties['View configuration'].ColumnOrder;
   const expected=old.map(c=>c==='Borrower Name TE'?(s.id==='viewLoans_Detail'?'Ref Borrowers':'Borrower Reference TE'):c);
   if(JSON.stringify(expected)!==JSON.stringify(p['View configuration'].ColumnOrder))throw Error('View order mismatch');
   put(app,`View ${p['View name']}`,'View configuration.ColumnOrder',p['View configuration'].ColumnOrder,old,'reorder');
  }else if(s.id.startsWith('slice_')&&JSON.stringify(b?.properties)!==JSON.stringify(p)){
   const name=`Slice ${p['Slice Name']}`;
   const whole=delta.items.find(i=>i.app===app&&i.object===name&&i.property==='definition');
   put(app,name,whole?'definition':'Slice Columns',whole?p:p['Slice Columns'],whole?b.properties:b.properties['Slice Columns']);
  }else if(s.id==='action_View Ref (Ref Borrowers)'){
   if(p['Attach to column']!=='Ref Borrowers')throw Error('Incorrect native action attachment');
   put(app,'Action Loans.View Ref (Ref Borrowers)','Attach to column',p['Attach to column'],b.properties['Attach to column']);
  }
 }
 for(const name of ['Open Borrower from Charge','Open Borrower from Repayment']){
  const id=`action_${name}`,b=before.sections.find(s=>s.id===id);
  if(!b||after.sections.some(s=>s.id===id))throw Error('Custom action removal not verified');
  put(app,`Action ${b.properties['For a record of this table']}.${name}`,'definition',undefined,b.properties,'remove');
 }
 for(const a of await readJson(`${out}/GENERATED_ACTIONS_${k}.json`)){
  const table=a.properties['For a record of this table'];if(!['Charges','Repayments'].includes(table))continue;
  put(app,`Action ${table}.View Ref (Borrower Reference TE)`,'definition',a.properties,undefined,'add');
 }
 const audit=await readJson(`${out}/AUDIT_${k}.json`);if(audit.customNameReferences.length)throw Error('Dangling custom action reference');
}
const receive=await readJson(`${out}/RECEIVE_SAVED.json`),old=delta.items.find(i=>i.id==='OLTP-R3-001').dev.value;
const expected=old.replace('CONTEXT("View") <> "Todays Collection Board_Detail"','CONTEXT("ViewType") <> "Detail"');
if(receive.version!=='1.000181'||receive.properties['Only if this condition is true']!==expected)throw Error('Receive All visibility mismatch');
put('OLTP','Action Borrowers.Receive All Charges','Only if this condition is true',receive.properties['Only if this condition is true'],old);
delta.continuation={...delta.continuation,versions:'DEV SQL V24 / OLTP 1.000181 / OLAP 1.000170, both Prototype; PROD unchanged.',done:'Native borrower Ref navigation from Charges, Repayments and Loans in both apps; obsolete custom actions removed. Receive All hidden in every borrower detail, retained inline in Collection. Six Ref GUI tests plus inline selector/Cancel pass.',evidence:`${out}/REPORT.md; dev-comparison.json`,next:'Existing owner mobile/opening/recipient acceptance and explicit production authorization remain pending.'};
obs.candidateHash=candidateHash(delta);
for(const [n,v] of [['release-delta.json',delta],['refinement-items.json',changes],['dev-saved-observations.json',obs],['dev-comparison.json',compare(delta,obs)]])await fs.writeFile(`${out}/${n}`,JSON.stringify(v,null,2)+'\n');
await fs.writeFile(`${out}/checklist.md`,render(delta)+'\nProduction documentation closure remains future work; this is DEV only.\n');
console.log(JSON.stringify({items:delta.items.length,refinementItems:changes.length,hash:obs.candidateHash,complete:compare(delta,obs).complete}));
