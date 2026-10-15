// R017: restore the existing capital-yield metric on 6R; no SQL or source writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource} from './ReportingApi.mjs';
export const output='outputs/r017-20260924';
export const backup='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r017-capital-yield';
const save=(name,value)=>fs.writeFileSync(`${output}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const f=(name,type='type/Decimal',alias)=>['field',name,{'base-type':type,...(alias?{'join-alias':alias}:{})}];
const date=f('Date','type/Date'),calendar=['field',569,{'base-type':'type/Date'}];
const inputs={'source-table':36,joins:[
 {'source-query':{'source-table':'card__74',aggregation:[['aggregation-options',['min',date],{name:'History start','display-name':'History start'}]]},alias:'Origin',strategy:'inner-join',condition:['>=',calendar,f('History start','type/Date','Origin')]},
 {'source-table':'card__74',alias:'Snapshot',strategy:'left-join',condition:['=',calendar,f('Date','type/Date','Snapshot')]}
 ],filter:['<',calendar,['relative-datetime',0,'day']],fields:[calendar,f('Daily Capital Yield','type/Decimal','Snapshot')]};
export const spec={name:'Daily capital yield · snapshots',type:'question',collection_id:5,display:'line',description:'Existing model 74 definition: gross interest received / (outstanding principal EOD + principal returned), shown as a daily percentage, not annualized or net profit. Existing source returns zero when the denominator is not positive. Completed Bangkok dates only; missing snapshots stay blank. Uses the 6R Performance period filter.',dataset_query:{database:2,type:'query',query:{'source-query':inputs,fields:[date,f('Daily Capital Yield')],'order-by':[['asc',date]]}},visualization_settings:{'graph.dimensions':['Date'],'graph.metrics':['Daily Capital Yield'],'graph.colors':['#178F8A'],'graph.show_legend':false,'graph.show_values':false,'graph.y_axis.auto_split':false,'graph.y_axis.title_text':'Daily capital yield (%)','graph.x_axis.title_enabled':false,'line.missing':'none','line.interpolate':'linear','graph.show_trendline':false,'stackable.stack_type':null,series_settings:{'Daily Capital Yield':{color:'#178F8A','line.missing':'none','line.interpolate':'linear',axis:'left'}},column_settings:{'["name","Daily Capital Yield"]':{number_style:'percent',decimals:2,number_separators:'.,'}}}};
async function run(q){const r=await api('POST','dataset',q);if(r.status!=='completed'){fs.writeFileSync(backup+'/error.json',JSON.stringify(r));throw Error('Read-only query failed; private diagnostic saved');}assert.ok(!r.data.rows_truncated);return r.data;}
const shape=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
const before=()=>JSON.parse(fs.readFileSync(backup+'/dashboard.json'));
if(process.argv.includes('--preflight')||process.argv.includes('--verify')){
 await assertSource();const checks=[];const check=(n,ok)=>{assert.ok(ok,n);checks.push(n);};
 const source=await run({database:2,type:'query',query:{'source-table':'card__74',fields:[date,f('Profit'),f('Outstanding Principal'),f('Principal Returned'),f('Daily Capital Yield')],'order-by':[['asc',date]]}});
 check('Source date grain unique',new Set(source.rows.map(r=>r[0])).size===source.rows.length);
 check('Yield reconciles to existing formula',source.rows.every(r=>{const den=Number(r[2])+Number(r[3]),expected=den>0?Number(r[1])/den:0;return Math.abs(Number(r[4])-expected)<1e-10;}));
 const all=await run(spec.dataset_query);check('Chart has Date and Daily Capital Yield',all.cols[0].name==='Date'&&all.cols[1].name==='Daily Capital Yield');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 check('All chart dates are completed',all.rows.every(r=>r[0].slice(0,10)<today));check('Values match source unchanged',all.rows.every(r=>r[1]===source.rows.find(s=>s[0]===r[0])?.[4]));
 const cases=['2026-09-01','2026-09-01~2026-09-30','2026-08-01~2026-08-07',today,'2099-01-01','2000-01-01',null];
 for(const value of cases){const [a,b=a]=value?.split('~')??['0000','9999'];const q=structuredClone(spec.dataset_query);if(value)q.query.filter=['between',date,a,b];const r=await run(q);assert.deepEqual(r.rows,all.rows.filter(x=>x[0].slice(0,10)>=a&&x[0].slice(0,10)<=b));checks.push('Query filter '+(value??'cleared'));}
 if(process.argv.includes('--verify')){
  const state=JSON.parse(fs.readFileSync(output+'/state.json')),d=await api('GET','dashboard/3'),b=before(),card=await api('GET','card/'+state.card),p=d.dashcards.find(x=>x.card_id===state.card&&x.dashboard_tab_id===18);
  assert.deepEqual(card.visualization_settings,spec.visualization_settings);assert.deepEqual(d.tabs,b.tabs);assert.deepEqual(d.parameters,b.parameters);checks.push('Saved percentage styling and all existing tabs/filters preserved');
  for(const old of b.dashcards){const current=d.dashcards.find(x=>x.id===old.id);const expected=shape(old);if(old.id===616)expected.size_x=12;assert.deepEqual(shape(current),expected);if(old.card_id){assert.deepEqual(current.card.dataset_query,old.card.dataset_query);assert.deepEqual(current.card.visualization_settings,old.card.visualization_settings);}}checks.push('Every existing question unchanged; only weekly-card width adjusted');
  assert.deepEqual((await api('GET','card/74')).dataset_query,JSON.parse(fs.readFileSync(backup+'/model74.json')).dataset_query);assert.deepEqual(await api('GET','collection/graph'),JSON.parse(fs.readFileSync(backup+'/permissions.json')));checks.push('Source model and permissions unchanged');
  for(const value of [...cases,'past30days']){const r=await api('POST',`dashboard/3/dashcard/${p.id}/card/${state.card}/query`,{parameters:[{id:'review-performance',type:'date/all-options',value}]});assert.equal(r.status,'completed');if(value==='past30days'){const start=new Date(Date.parse(today+'T12:00:00Z')-30*86400000).toISOString().slice(0,10);assert.deepEqual(r.data.rows,all.rows.filter(x=>x[0].slice(0,10)>=start));}else{const [a,b=a]=value?.split('~')??['0000','9999'];assert.deepEqual(r.data.rows,all.rows.filter(x=>x[0].slice(0,10)>=a&&x[0].slice(0,10)<=b));}checks.push('Installed dashboard filter '+(value??'cleared'));}
  save('plan',{card:Object.fromEntries(['id','name','description','display','dataset_query','visualization_settings','collection_id'].map(k=>[k,card[k]])),placement:shape(p),weekly_placement:shape(d.dashcards.find(x=>x.id===616))});
 }
 save('verification',{at:new Date().toISOString(),installed:process.argv.includes('--verify'),checks,count:checks.length,source_writes:false});console.log(`${checks.length} capital-yield checks passed.`);
}
if(process.argv.includes('--install')){
 await assertSource();assert.ok(fs.readFileSync('Documents/Release_Tracker.md','utf8').includes('**R018 — Open**'),'Publish R017 freeze handoff first');
 let d=await api('GET','dashboard/3');assert.deepEqual(d.dashcards.map(shape),before().dashcards.map(shape));assert.deepEqual(d.tabs,before().tabs);
 const card=await api('POST','card',spec);save('state',{card:card.id,dashboard:3,tab:18,backup});
 const cards=d.dashcards.map(c=>c.id===616?{...c,size_x:12}:c);cards.push({id:-1,card_id:card.id,dashboard_tab_id:18,col:12,row:44,size_x:12,size_y:7,series:[],parameter_mappings:[{parameter_id:'review-performance',card_id:card.id,target:['dimension',date]}],visualization_settings:{}});
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});console.log('Added capital yield beside weekly average loan size.');
}
