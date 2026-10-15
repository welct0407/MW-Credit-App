// R018: weekly ratio of sums, matching the owner's Period Performance screenshot.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource} from './ReportingApi.mjs';
export const output='outputs/r018-20260924';
export const backup='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r018-weekly-return';
fs.mkdirSync(output,{recursive:true});
const save=(name,value)=>fs.writeFileSync(`${output}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const f=(name,type='type/Decimal',alias)=>['field',name,{'base-type':type,...(alias?{'join-alias':alias}:{})}];
const date=f('Date','type/Date'),calendar=['field',569,{'base-type':'type/Date'}];
const week=['field','Date',{'base-type':'type/Date','temporal-unit':'week'}];
const named=(expr,name)=>['aggregation-options',expr,{name,'display-name':name}];
const inputs={'source-table':36,joins:[{'source-table':'card__74',alias:'Snapshot',strategy:'left-join',condition:['=',calendar,f('Date','type/Date','Snapshot')]}],filter:['<',calendar,['relative-datetime',0,'day']],fields:[calendar,f('Profit','type/Decimal','Snapshot'),f('Principal Issued','type/Decimal','Snapshot')]};
// Filtering occurs in this summarization stage, before grouping selected days into weeks.
const complete=['and',['=', ['count',f('Profit')],['count']],['=', ['count',f('Principal Issued')],['count']]];
const ratio=['/', ['sum',f('Profit')],['sum',f('Principal Issued')]];
export const weekly=source=>({'source-query':source,breakout:[week],aggregation:[named(['case',[[complete,ratio]]],'Loan Return')],'order-by':[['asc',week]]});
export const spec={name:'Weekly loan return · snapshots',type:'question',collection_id:5,display:'bar',description:'Loan Return = SUM(gross interest received) / SUM(principal issued) over selected completed days in each Monday–Sunday week. 100% means the period interest equals the period principal issued; this is not a loan-cohort ROI or capital yield. Partial weeks use selected completed days only. Zero total principal issued or missing inputs produce a blank. Bangkok dates; source model 74; existing 6R Performance period filter.',dataset_query:{database:2,type:'query',query:weekly(inputs)},visualization_settings:{'graph.dimensions':['Date'],'graph.metrics':['Loan Return'],'graph.colors':['#43A047'],'graph.show_legend':false,'graph.show_values':true,'graph.y_axis.auto_split':false,'graph.y_axis.title_text':'Loan return (%)','graph.x_axis.title_text':'Week starting (Monday)','graph.show_goal':true,'graph.goal_value':1,'graph.goal_label':'Reference · 100%','graph.show_trendline':false,'stackable.stack_type':null,'line.missing':'none',column_settings:{'["name","Loan Return"]':{number_style:'percent',decimals:2,number_separators:'.,'}},series_settings:{'Loan Return':{color:'#43A047',axis:'left'}}}};
const shape=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
const note='Avg loan size = principal ÷ loans. Selected days only.';
const before=()=>JSON.parse(fs.readFileSync(backup+'/dashboard.json'));
async function run(q){const r=await api('POST','dataset',q);if(r.status!=='completed'){fs.writeFileSync(backup+'/error.json',JSON.stringify(r));throw Error('Query failed; diagnostic saved privately');}assert.ok(!r.data.rows_truncated);return r.data;}
const dq=q=>({database:2,type:'query',query:q});
const day=x=>x.slice(0,10),near=(a,b)=>a===null||b===null?a===b:Math.abs(Number(a)-Number(b))<1e-9;
const monday=s=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};
if(process.argv.includes('--preflight')||process.argv.includes('--verify')){
 await assertSource();const props=await api('GET','session/properties');assert.equal(props['start-of-week'],'monday');assert.equal(props['report-timezone'],'Asia/Bangkok');const checks=['Bangkok timezone and Monday week setting verified'];
 const daily=await run(dq(inputs));assert.equal(new Set(daily.rows.map(x=>x[0])).size,daily.rows.length);checks.push('Daily input grain unique');
 const expected=(start='0000',end='9999')=>{const g=new Map();for(const [dt,profit,issued] of daily.rows.filter(r=>day(r[0])>=start&&day(r[0])<=end)){const w=monday(day(dt)),v=g.get(w)??{profit:0,issued:0,missing:false};v.profit+=Number(profit);v.issued+=Number(issued);v.missing||=profit===null||issued===null;g.set(w,v);}return [...g].sort(([a],[b])=>a.localeCompare(b)).map(([w,v])=>[w,v.missing||v.issued===0?null:v.profit/v.issued]);};
 const compare=(actual,want)=>{assert.equal(actual.length,want.length);actual.forEach((r,i)=>{assert.equal(day(r[0]),want[i][0]);assert.ok(near(r[1],want[i][1]));});};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const cases=['2026-09-01','2026-09-01~2026-09-30','2026-08-31~2026-09-06','2026-09-02~2026-09-04',today,'2099-01-01','2000-01-01',null];
 for(const value of cases){const [a,b=a]=value?.split('~')??['0000','9999'],q=structuredClone(spec.dataset_query);if(value)q.query.filter=['between',date,a,b];const r=await run(q);compare(r.rows,expected(a,b));checks.push('Weekly ratio/selected-days filter '+(value??'cleared'));}
 // Actual Metabase expressions over synthetic calendar rows; no database writes or SQL.
 for(const [label,profits,issued,result] of [['weighted',[10,90],[100,300],.25],['zero denominator',[10,20],[0,0],null],['missing input',[10,null],[100,300],null],['signed correction',[-10,0],[100,300],-.025],['zero income',[0,0],[100,300],0],['above 100 percent',[100,200],[100,100],1.5]]){
  const dates=['2026-08-03','2026-08-04'],expr=v=>['case',v.flatMap((x,i)=>x===null?[]:[[['=',calendar,dates[i]],x]])];const source={'source-table':36,filter:['between',calendar,...dates],expressions:{Profit:expr(profits),'Principal Issued':expr(issued)},fields:[calendar,['expression','Profit'],['expression','Principal Issued']]};const r=await run(dq(weekly(source)));assert.ok(near(r.rows[0][1],result));checks.push('Synthetic '+label);
 }
 assert.ok(near(14440/28100,.5138790035587188));assert.ok(near(46180/40000,1.1545));checks.push('Screenshot examples agree with gross-interest / issued definition');
 if(process.argv.includes('--verify')){
  const state=JSON.parse(fs.readFileSync(output+'/state.json')),d=await api('GET','dashboard/3'),b=before(),card=await api('GET','card/'+state.card),p=d.dashcards.find(x=>x.card_id===state.card&&x.dashboard_tab_id===18);
  assert.deepEqual(card.visualization_settings,spec.visualization_settings);assert.deepEqual(d.tabs,b.tabs);assert.deepEqual(d.parameters,b.parameters);checks.push('Percent format, 100% reference and existing tabs/parameters preserved');
  for(const old of b.dashcards){const cur=d.dashcards.find(x=>x.id===old.id),expected=structuredClone(shape(old));if(old.id===618){expected.col=12;expected.size_x=12;}if(old.id===617)expected.visualization_settings.virtual_card.visualization_settings.text=note;assert.deepEqual(shape(cur),expected);if(old.card_id){assert.deepEqual(cur.card.dataset_query,old.card.dataset_query);assert.deepEqual(cur.card.visualization_settings,old.card.visualization_settings);}}checks.push('All prior questions preserved, including capital yield; only active-chart placement resized and average-loan-size note clarified');
  assert.deepEqual((await api('GET','card/74')).dataset_query,JSON.parse(fs.readFileSync(backup+'/model74.json')).dataset_query);assert.deepEqual(await api('GET','collection/graph'),JSON.parse(fs.readFileSync(backup+'/permissions.json')));checks.push('Source model and collection permissions unchanged');
  for(const value of [...cases,'past30days']){const r=await api('POST',`dashboard/3/dashcard/${p.id}/card/${state.card}/query`,{parameters:[{id:'review-performance',type:'date/all-options',value}]});assert.equal(r.status,'completed');const [a,b=a]=value==='past30days'?[new Date(Date.parse(today+'T12:00:00Z')-30*86400000).toISOString().slice(0,10),'9999']:value?.split('~')??['0000','9999'];compare(r.data.rows,expected(a,b));checks.push('Installed dashboard weekly filter '+(value??'cleared'));}
  save('plan',{card:Object.fromEntries(['id','name','description','display','dataset_query','visualization_settings','collection_id'].map(k=>[k,card[k]])),placement:shape(p),active_placement:shape(d.dashcards.find(x=>x.id===618)),note_placement:shape(d.dashcards.find(x=>x.id===617))});
 }
 save('verification',{at:new Date().toISOString(),installed:process.argv.includes('--verify'),checks,count:checks.length,source_writes:false});console.log(`${checks.length} weekly-return checks passed.`);
}
if(process.argv.includes('--install')){
 await assertSource();assert.ok(fs.readFileSync('Documents/Release_Tracker.md','utf8').includes('**R019 — Open**'),'Publish R018 freeze handoff first');
 const d=await api('GET','dashboard/3');assert.deepEqual(d.dashcards.map(shape),before().dashcards.map(shape));assert.deepEqual(d.tabs,before().tabs);
 const card=await api('POST','card',spec);save('state',{card:card.id,dashboard:3,tab:18,backup});
 const cards=structuredClone(d.dashcards).map(c=>{if(c.id===617)c.visualization_settings.virtual_card.visualization_settings.text=note;return c.id===618?{...c,col:12,size_x:12}:c;});cards.push({id:-1,card_id:card.id,dashboard_tab_id:18,col:0,row:53,size_x:12,size_y:7,series:[],parameter_mappings:[{parameter_id:'review-performance',card_id:card.id,target:['dimension',date]}],visualization_settings:{}});
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});console.log('Added separate weekly Loan Return chart; capital yield preserved.');
}
