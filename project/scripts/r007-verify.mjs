// Sanitized checks of independently captured private DEV evidence.
import fs from 'node:fs/promises';
const assert=Object.assign((ok,message='Check failed')=>{if(!ok)throw Error(message)},{equal:(a,b,m)=>{if(a!==b)throw Error(m||'Scalar mismatch')},notEqual:(a,b)=>{if(a===b)throw Error('Expected change')},deepEqual:(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(m||'Structured mismatch')}});
const root='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r007-20260918';
const read=async p=>JSON.parse(await fs.readFile(`${root}/${p}`,'utf8'));
const report={release:'R007',checkedAt:new Date().toISOString(),refresh:[],preservation:[]};
const before=await read('refresh-before.json');
for(const phase of ['recent','full']){
 const now=await read(`refresh-${phase}.json`);
 const request=now.statistics[0]['Analytics Refresh Request'];
 assert(request.includes(`|${phase==='recent'?'Recent':'Full'}|`));
 assert.notEqual(request,before.statistics[0]['Analytics Refresh Request']);
 assert.deepEqual(now.snapshots.map(r=>r['Row ID']),before.snapshots.map(r=>r['Row ID']));
 const strip=r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=='Generated At'));
 const changedSnapshots=now.snapshots.filter((r,i)=>JSON.stringify(strip(r))!==JSON.stringify(strip(before.snapshots[i]))).length;
 const changedPortfolioFields=Object.keys(now.portfolio[0]).filter(k=>JSON.stringify(now.portfolio[0][k])!==JSON.stringify(before.portfolio[0][k]));
 const refreshed=now.snapshots.filter((r,i)=>r['Generated At']!==before.snapshots[i]['Generated At']).length;
 assert(refreshed>0);if(phase==='full')assert.equal(refreshed,now.snapshots.length);
 report.refresh.push({phase,requestChanged:true,snapshotCount:now.snapshots.length,refreshed,stableKeys:true,changedSnapshots,changedPortfolioFields});
}
const doc0=await read('dev-olap-before-appdoc.json'),doc1=await read('dev-olap-final-appdoc.json');
const props=t=>Object.fromEntries(t.rows.filter(r=>r.length===2));
const columns=doc=>doc.filter(t=>props(t)['Column name']).map(t=>({table:t.heading.replace(/^Schema Name /, '').replace(/_Schema$/, ''),...props(t)}));
const oldCols=columns(doc0),newCols=columns(doc1);
for(const table of ['Borrowers','Loans','Repayments','Charges','Statistics','Partners','Cash Pool Contributions','Settlements','Daily Analytics','Business Expenses']){
 const a=await read(`before/${table}.json`),b=await read(`after/${table}.json`),map=new Map(b.map(r=>[r['Row ID'],r]));
 assert.equal(a.length,b.length);
 const physical=oldCols.filter(c=>c.table===table&&c['Virtual?']==='No').map(c=>c['Column name']).filter(c=>c!=='_RowNumber');
 let compared=0;for(const r of a){const s=map.get(r['Row ID']);assert(s);for(const k of physical){assert.deepEqual(s[k],r[k],`${table}.${k}`);compared++;}}
 if(table==='Borrowers')for(const r of a)assert.deepEqual(map.get(r['Row ID'])['Todays Collection Charges'],r['Todays Collection Charges']);
 report.preservation.push({table,rows:a.length,physicalColumns:physical.length,comparisons:compared,unchanged:true,...(table==='Borrowers'?{collectionListsUnchanged:true}:{})});
}
for(const identity of ['Slice Name','View name','Action name','Rule name']){
 const objects=doc=>doc.map(props).filter(p=>p[identity]);const a=objects(doc0),b=objects(doc1);
 for(const p of a){const q=b.find(x=>x[identity]===p[identity]&&x['For a record of this table']===p['For a record of this table']);assert.deepEqual(q,p,`${identity}:${p[identity]}`);}
 report.preservation.push({objectKind:identity,originalObjects:a.length,allOriginalPropertiesUnchanged:true,added:b.filter(p=>!a.some(x=>x[identity]===p[identity]&&x['For a record of this table']===p['For a record of this table'])).map(p=>({name:p[identity],position:p.Position}))});
}
report.providerColumns=newCols.filter(c=>oldCols.some(o=>o.table===c.table&&o['Column name']===c['Column name']&&o['Virtual?']==='Yes')&&c['Virtual?']==='No').map(c=>{assert.equal(c['App formula'],undefined);assert.equal(c['Read-Only'],'Yes');return `${c.table}.${c['Column name']}`});
assert.equal(report.providerColumns.length,82);
const recent=await read('refresh-recent.json'),full=await read('refresh-full.json');
const strip=r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=='Generated At'));
assert.deepEqual(recent.snapshots.slice(-2).map(strip),full.snapshots.slice(-2).map(strip),'Recent and Full disagree on overlapping dates');
report.refreshOverlapMatches=true;
await fs.writeFile('outputs/r007-20260918/preservation-and-refresh.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
