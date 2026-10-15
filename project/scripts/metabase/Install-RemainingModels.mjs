import fs from 'node:fs';
import {api,assertSource,read,write,root,privateDir} from './ReportingApi.mjs';
await assertSource();
if(!fs.existsSync(privateDir+'/remaining-pages-before/dashboard.json'))throw Error('Missing rollback export');
const models=read('models.json');
const definitions=[
 ['borrowers','Borrowers','Borrower ID','One row per immutable Borrower ID. Existing governed borrower metrics, matrix scores and collection state; includes hidden borrowers.'],
 ['loans','Loan Book','Loan ID','One row per immutable Loan ID. Borrower relationship, loan status/type labels, balances and forecast inputs are centralized.'],
 ['repayments','Repayment Ledger','Repayment ID',models.repayments.grain],
 ['borrower-performance','Borrower Performance','Borrower',models['borrower-performance'].grain],
 ['portfolio','Portfolio Overview','Portfolio ID','One current portfolio row. Gross interest, forecast, collection totals and portfolio concentration; all balances are current, not historical as-of balances.'],
 ['daily','Daily Performance','Date','One stored daily snapshot. Gross interest, cumulative interest from the first stored date, capital yield on closing principal plus principal returned, and Bangkok date windows.'],
 ['charges','Charge History','Charge ID','One row per immutable Charge ID, joined once to Loan Book and Borrowers. Payment Timing preserves source: Historical Late true = Late, otherwise On time.'],
 ['partners','Partner Outlook','Partner ID','One row per partner with role A or B. Current pool ratio from the existing Loan Form Context view; this is a current allocation basis, not historical settlement.'],
 ['collections','Collection Worklist','Borrower ID','One row per borrower with a collection status. Posted receipts today are aggregated before joining; governed due, collected, remaining and overdue measures remain separate.'],
 ['collection-summary','Collection Status Summary','Collection Status','One row per governed collection status, including zero counts and amounts for empty statuses.']
];
const sqlByKey=Object.fromEntries(definitions.map(([key])=>[key,fs.readFileSync(`${root}/scripts/metabase/models/${key}.sql`,'utf8').trim()]));
function expand(key){return sqlByKey[key].replace(/\{\{model:([^}]+)\}\}/g,(_,dep)=>'('+expand(dep)+')');}
// Preflight every model against the exact restricted source before changing live metadata.
for(const [key,,grain]of definitions){
 const result=await api('POST','dataset',{database:2,type:'native',native:{query:expand(key),'template-tags':{}}});
 if(result.status!=='completed'){fs.writeFileSync(privateDir+'/remaining-model-error.json',JSON.stringify(result));throw Error('Model preflight failed '+key);}
 const index=result.data.cols.findIndex(c=>c.name===grain),values=result.data.rows.map(r=>r[index]);
 if(index<0||values.some(v=>v===null)||new Set(values).size!==values.length)throw Error('Nonunique model grain '+key);
 console.log('Preflight passed '+key);
}
for(const [key,name,grain,description] of definitions){
 // Repayment and grouped borrower definitions are unchanged; their dependencies were checked above.
 if(['repayments','borrower-performance'].includes(key))continue;
 const tags={};const query=sqlByKey[key].replace(/\{\{model:([^}]+)\}\}/g,(_,dep)=>{const m=models[dep];if(!m)throw Error('Dependency missing');const tag='#'+m.id;tags[tag]={id:'r016-model-'+m.id,name:tag,'display-name':m.name,type:'card','card-id':m.id};return '{{'+tag+'}}';});
 const old=models[key]?.id?await api('GET','card/'+models[key].id):null;
 const oldSql=old?.dataset_query?.native?.query??old?.dataset_query?.stages?.[0]?.native;
 if(oldSql===query&&old.description===description){console.log('Unchanged model '+key);continue;}
 const body={name,description,type:'model',display:'table',collection_id:8,visualization_settings:old?.visualization_settings??{},dataset_query:{database:2,type:'native',native:{query,'template-tags':tags}}};
 const card=await api(old?'PUT':'POST',old?'card/'+old.id:'card',body);
 // Save identity immediately for safe resumption after an interrupted verification.
 models[key]={...models[key],id:card.id,name,collection_id:8,grain:description};write('models.json',models);
 const result=await api('POST',`card/${card.id}/query`,{});if(result.status!=='completed')throw Error('Saved model failed '+key);
 const cols=result.data.cols.map(c=>{const previous=old?.result_metadata?.find(x=>x.name===c.name); const out={...c,description:`${c.name}. ${description}`};
  if(previous)for(const p of ['id','semantic_type','fk_target_field_id','settings'])if(previous[p]!=null)out[p]=previous[p];
  if(c.name===grain)out.semantic_type='type/PK';
  else if(/Yield|Rate|Share|Exposure %|Concentration|Forecast Realization|Return on/.test(c.name)){out.semantic_type='type/Percentage';out.settings={number_style:'percent',decimals:1};}
  else if(c.base_type==='type/Text'&&out.semantic_type!=='type/FK')out.semantic_type='type/Category';
  if(key==='charges'&&['Loan ID','Borrower ID'].includes(c.name)){out.semantic_type='type/FK';out.fk_target_field_id=c.name==='Loan ID'?94:72;}
  return out;});
 await api('PUT','card/'+card.id,{result_metadata:cols});
 models[key].columns=cols.map(({name,base_type,semantic_type,id,fk_target_field_id,description})=>({name,base_type,semantic_type,id,fk_target_field_id,description}));models[key].rows=result.row_count;write('models.json',models);
 console.log(`Saved ${name} (${card.id}), ${result.row_count} rows, ${cols.length} fields`);
}
