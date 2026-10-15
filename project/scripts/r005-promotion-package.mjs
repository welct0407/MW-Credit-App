import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='outputs/r005-20260917';
const privateRoot='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917';
try{const existing=JSON.parse(await fs.readFile(`${root}/production-package.json`,'utf8'));if(existing.productionVersions)throw new Error('Production package already contains verified deployment evidence; do not regenerate over it.');}catch(e){if(e.code!=='ENOENT')throw e;}
const read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
function flatten(tables){
 const out=new Map();let schema='';
 for(const {rows} of tables){const [kind,name]=rows[0];const props=Object.fromEntries(rows.filter(r=>r.length>1));if(kind==='Schema Name')schema=name;
 const id=kind==='Column name'?`Column/${schema}/${name}`:kind==='Action name'?`Action/${props['For a record of this table']}/${name}`:kind===''?'App':kind==='Data Summary'?'Summary':`${kind}/${name}`;
 const walk=(p,v)=>{if(v!==null&&typeof v==='object'){out.set(p+'/$shape',Array.isArray(v)?{type:'array',length:v.length}:{type:'object',keys:Object.keys(v).sort()});for(const[k,x]of Object.entries(v))walk(p+'/'+k,x);}else out.set(p,v);};
 for(const[k,raw]of rows.filter(r=>r.length>1)){let v=raw;if(/^[\[{]/.test(v)){try{v=JSON.parse(v);}catch{}}walk(id+'/'+k,v);}
 }return out;
}
const prior=await read(`${root}/reversal-configuration-checklist.json`);
const dashboard=await read(`${root}/dashboard-delta.json`);
const before={};for(const app of ['oltp','olap'])before[app]=flatten(await read(`${privateRoot}/prod-${app}-before-appdoc.json`));
const rows=prior.rows.filter(r=>r.disposition.startsWith('R005')).map(r=>({...r,actualProdBefore:before[r.app].has(r.path)?{present:true,value:before[r.app].get(r.path)}:{present:false},prodStatus:'Pending',savedProdObserved:null}));
for(const r of rows){assert(r.intendedProd);assert(!JSON.stringify(r.intendedProd).includes('database-3'));}
const packageRecord={release:'R005',revision:'P1',authorization:{date:'2026-09-18',ownerStatement:'everything looks fine. go ahead to promote into prod',scope:'Entire accepted R005 including Delete reversal and dashboard/Collection refinement; excludes DEV-only opening fixtures'},implementationCommit:'2054384831a58a89842a42a123381fb1dc032141',sqlManifest:'production-candidate-manifest.json',candidate:{oltp:'1.000125',olap:'1.000123',sql:'21'},rollback:{oltp:'3.000156',olap:'1.100106',sql:'19',backup:'production-backup.json',restore:'production-restore-test.json'},rows,dashboardDelta:dashboard,dispositions:prior.rows.filter(r=>!r.disposition.startsWith('R005')).map(r=>({id:r.id,path:r.path,disposition:r.disposition})),excludedData:['r005-test-opening-dad','r005-test-opening-lisa','All other DEV financial/test records'],status:'Exact accepted targets captured; Not ready under current diagnostic gate; no production writes',diagnosticLimitation:'Deployment checks executed: metadata, default-icon and server-cache warnings in both DEV apps; OLAP menu-design warning. Definition, data structure, security and account checks passed. Explicit gate decision pending.'};
await fs.writeFile(`${root}/production-package.json`,JSON.stringify(packageRecord,null,2)+'\n');
console.log(JSON.stringify({release:'R005',revision:'P1',coreProperties:rows.length,dashboardItems:dashboard.items.length,excludedParityAndMetadata:packageRecord.dispositions.length}));
