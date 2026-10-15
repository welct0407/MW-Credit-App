import fs from 'node:fs/promises';
const privateRoot='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r007-20260918';
const input=process.argv[2];
if(!input)throw new Error('Supply a saved appdoc filename within the private R007 folder');
if(input.includes('/')||input.includes('\\'))throw new Error('Filename only');
const before=JSON.parse(await fs.readFile(`${privateRoot}/dev-olap-before-appdoc.json`,'utf8'));
const after=JSON.parse(await fs.readFile(`${privateRoot}/${input}`,'utf8'));
function objects(doc){const out=new Map();for(const t of doc){const p=Object.fromEntries(t.rows.filter(r=>r.length===2));let key;
 if(p['Column name'])key=`${t.heading}.${p['Column name']}`;
 else for(const n of ['Table name','Slice Name','View name','Action name','Rule name','Bot name'])if(p[n]){key=`${n}:${p['For a record of this table']?p['For a record of this table']+'.':''}${p[n]}`;break;}
 if(key){if(out.has(key))throw new Error(`Duplicate ${key}`);out.set(key,p);}
}return out;}
const a=objects(before),b=objects(after),items=[];
const value=v=>v===undefined?{state:'absent'}:{state:'value',value:v};
for(const key of new Set([...a.keys(),...b.keys()])){const old=a.get(key),now=b.get(key);
 if(!old||!now){items.push({app:'OLAP',object:key,property:'definition',operation:now?'add':'remove',before:value(old),dev:value(now),prod:value(now)});continue;}
 for(const p of new Set([...Object.keys(old),...Object.keys(now)]))if(JSON.stringify(old[p])!==JSON.stringify(now[p]))items.push({app:'OLAP',object:key,property:p,operation:'change',before:value(old[p]),dev:value(now[p]),prod:value(now[p])});
}
for(const i of items)if(i.object==='Table name:Portfolio Summary'&&i.property==='definition'){
 i.prod=structuredClone(i.dev);i.prod.value['Data Source']='database-2';i.environmentReason='DEV reporting view uses database-3; PROD must use its existing database-2 connection on the production Cloud SQL instance.';
}
for(let n=0;n<items.length;n++){items[n].id=`OLAP-${String(n+1).padStart(3,'0')}`;items[n].evidence=`Private saved appdoc ${input}; development readback, not production verification`;}
const sources=JSON.parse(await fs.readFile('outputs/r007-20260918/source-readbacks.json','utf8'));
for(const r of sources)items.push({id:`OLAP-SOURCE-${r.table.replaceAll(' ','-')}`,app:'OLAP',object:`Table name:${r.table}`,property:'Source Id',operation:r.table==='Portfolio Summary'?'add':'change',dev:value(r.sourceId),prod:value(r.sourceId),evidence:'Independent saved editor Storage readback: source-readbacks.json',notes:'Use existing database-3 in DEV and database-2 in PROD; Source Id is shared, host binding is not.'});
const delta={schemaVersion:1,release:'R007',revision:1,apps:{OLAP:{dev:'494cd013-0d9b-482f-9559-c9d83059de91',prod:'e74dd368-654f-44d7-bccf-83cf361d1cdb'}},continuation:{versions:'DEV OLAP 1.000142 / OLTP 1.000134 / SQL V22; baseline OLAP 1.000129. PROD remains OLAP 1.100122 / OLTP 3.000173 / V21.',done:'Five SQL views, 82 provider fields, 40 Statistics dereferences, collection reverse Ref, metadata and slice reconciliation saved and verified.',next:'Owner acceptance and scoped production authorization; execute promotion prerequisites and verify every frozen target.',decisions:'Owner excludes both Prototype scheduling execution warnings (Every Hour and Daily 00:05); preserve both schedules and Prototype mode. No production authorization.',evidence:'Change Logs/CHANGE_NOTES_R007_2026-09-18.md'},items};
await fs.writeFile('outputs/r007-20260918/release-delta.json',JSON.stringify(delta,null,2)+'\n');
console.log(`${items.length} saved property/object differences captured; review generated changes and source identities separately`);
