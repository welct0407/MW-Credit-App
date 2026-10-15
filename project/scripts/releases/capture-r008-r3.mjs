// Local packaging only: preserves the frozen R008 revisions and maps saved UI evidence.
import fs from 'node:fs/promises';
import {candidateHash,compare,readJson,render} from './delta.mjs';
const base='outputs/r008-20260918',out=`${base}/r3`;
if(await fs.stat(`${out}/FROZEN.md`).then(()=>true,()=>false))throw Error('Revision 3 frozen; create a new revision.');
const saved=await readJson(`${out}/saved-action.json`);
if(saved.version!=='1.000179'||!saved.saveDisabled||!saved.condition.includes('Todays Collection Board_Detail'))throw Error('Unexpected saved evidence');
const delta=await readJson(`${base}/r2/release-delta.json`);
delta.revision=3;
delta.continuation={...delta.continuation,versions:'DEV SQL V24 / OLTP 1.000179 / OLAP 1.000169, both Prototype; PROD unchanged.',done:'Revision 2 plus collection-detail Receive All visibility restriction. Inline selector opens with default; Cancel tested without financial writes.',next:'Existing owner mobile/opening/recipient checks and explicit production authorization remain pending.',evidence:`${out}/REPORT.md; saved-action.json; dev-comparison.json`};
const item={id:'OLTP-R3-001',app:'OLTP',object:'Action Borrowers.Receive All Charges',property:'Only if this condition is true',operation:'change',before:{state:'value',value:'='+saved.before},dev:{state:'value',value:'='+saved.condition},prod:{state:'value',value:'='+saved.condition},evidence:`${out}/saved-action.json`};
delta.items.push(item);
const obs=await readJson(`${base}/r2/dev-saved-observations.json`);
obs.revision=3;obs.candidateHash=candidateHash(delta);
obs.items.push({id:item.id,appId:saved.appId,version:saved.version,observedAt:saved.observedAt,evidence:item.evidence,observed:{state:'value',value:'='+saved.condition}});
for(const [name,value] of [['release-delta.json',delta],['dev-saved-observations.json',obs],['dev-comparison.json',compare(delta,obs)]])await fs.writeFile(`${out}/${name}`,JSON.stringify(value,null,2)+'\n');
await fs.writeFile(`${out}/checklist.md`,render(delta)+'\nProduction documentation closure checklist remains the revision-2 checklist; no production promotion has occurred.\n');
console.log(JSON.stringify({items:delta.items.length,hash:obs.candidateHash,complete:compare(delta,obs).complete}));
