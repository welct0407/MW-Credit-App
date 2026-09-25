import assert from 'node:assert/strict';
import {api} from './ReportingApi.mjs';
import {read,save} from './BorrowerPages.mjs';
const s=read('metabase-state'),r=await api('POST',`card/${s.cards['p-comparison']}/query`,{});
const cols=r.data.cols.map(x=>x.name),rows=r.data.rows.map(r=>Object.fromEntries(cols.map((c,i)=>[c,r[i]]))),checks=[];
for(const [kind,row] of [['active',rows.find(r=>r['Active loans']>0)],['inactive',rows.find(r=>r['Active loans']===0)],['empty',null]]){
 if(kind==='inactive'&&!row)continue;
 const at=Date.now(),parameters=row?[{id:'bp-borrower',type:'category',target:['variable',['template-tag','borrower_id']],value:row['Borrower ID']}]:[];
 // ignore_cache is supported by the card route, not the dashboard route.
 const q=await api('POST',`card/${s.cards['d-health']}/query`,{parameters,ignore_cache:true});
 assert.equal(q.status,'completed');assert.equal(q.data.rows.length,row?1:0);
 if(kind==='inactive')assert.equal(q.data.rows[0][q.data.cols.findIndex(c=>c.name==='Schedule')],'No active loan');
 checks.push({kind,status:q.status,rows:q.data.rows.length,wallMs:Date.now()-at,runningMs:q.running_time,cached:q.cached??false});
}
save('health-native-verification',{at:new Date().toISOString(),checks,passed:true});console.log(JSON.stringify(checks));
