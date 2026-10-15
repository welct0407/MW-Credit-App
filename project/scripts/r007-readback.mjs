// Read observations from independently saved editor documentation, never targets.
import fs from 'node:fs/promises';
import {candidateHash,compare} from './releases/delta.mjs';
const dir='outputs/r007-20260918';
const d=JSON.parse(await fs.readFile(`${dir}/release-delta.json`,'utf8'));
const file='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r007-20260918/dev-olap-final-appdoc.json';
const doc=JSON.parse(await fs.readFile(file,'utf8')),objects=new Map();
for(const t of doc){const p=Object.fromEntries(t.rows.filter(r=>r.length===2));let key;
 if(p['Column name'])key=`${t.heading}.${p['Column name']}`;
 else for(const n of ['Table name','Slice Name','View name','Action name','Rule name','Bot name'])if(p[n]){key=`${n}:${p['For a record of this table']?p['For a record of this table']+'.':''}${p[n]}`;break;}
 if(key)objects.set(key,p);
}
const sources=JSON.parse(await fs.readFile(`${dir}/source-readbacks.json`,'utf8'));
const value=v=>v===undefined?{state:'absent'}:{state:'value',value:v};
const observedAt=(await fs.stat(file)).mtime.toISOString();
const observation={release:'R007',revision:1,candidateHash:candidateHash(d),environment:'dev',items:d.items.map(i=>({id:i.id,appId:'494cd013-0d9b-482f-9559-c9d83059de91',version:'1.000142',observedAt:i.property==='Source Id'?sources.find(r=>`Table name:${r.table}`===i.object)?.capturedUtc:observedAt,evidence:i.property==='Source Id'?'source-readbacks.json':'Private dev-olap-final-appdoc.json, independent saved documentation',observed:value(i.property==='Source Id'?sources.find(r=>`Table name:${r.table}`===i.object)?.sourceId:i.property==='definition'?objects.get(i.object):objects.get(i.object)?.[i.property])}))};
await fs.writeFile(`${dir}/dev-readback-r1.json`,JSON.stringify(observation,null,2)+'\n');
const result=compare(d,observation);await fs.writeFile(`${dir}/dev-comparison-r1.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({complete:result.complete,verified:result.results.filter(i=>i.status==='Verified').length,candidateHash:result.candidateHash}));
if(!result.complete)throw Error('Unverified DEV target');
