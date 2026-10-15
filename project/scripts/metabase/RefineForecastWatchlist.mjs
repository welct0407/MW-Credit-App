// R048: replace the watchlist's internal loan reference with its readable Loan Key.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
import {specs,read,shape} from './ForecastPlanning.mjs';

const out=root+'/outputs/r048-forecast-watchlist';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r048-forecast-watchlist';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const save=(name,value,dir=out)=>fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const load=(name,dir=priv)=>JSON.parse(fs.readFileSync(`${dir}/${name}.json`,'utf8'));
const sql=card=>card.dataset_query.stages?.[0]?.native??card.dataset_query.native?.query;
const native=specs(read('state',root+'/outputs/r045-forecast-planning').models).find(s=>s.key==='watchlist');
assert(native);
const cardId=360, dashboardId=3, tabId=262;

async function rows(datasetQuery){
 const result=await api('POST','dataset',datasetQuery);
 assert.equal(result.status,'completed');assert(!result.data.rows_truncated);
 return result.data;
}

if(process.argv.includes('--prepare')){
 await assertSource();assert(!fs.existsSync(priv+'/card-before.json'),'Rollback already captured');
 const [card,dashboard]=await Promise.all([api('GET','card/'+cardId),api('GET','dashboard/'+dashboardId)]);
 const saved=read('saved',root+'/outputs/r045-forecast-planning').questions.find(q=>q.key==='watchlist');
 assert.equal(sql(card),saved.dataset_query.native.query,'Live card changed since R045 evidence');
 assert(dashboard.dashcards.some(x=>x.card_id===cardId&&x.dashboard_tab_id===tabId));
 save('card-before',card,priv);save('dashboard-before',dashboard,priv);
 const backup=await api('POST','dashboard/'+dashboardId+'/copy',{name:'R048 recovery - before Forecast watchlist Loan Key',collection_id:5});
 save('backup',{dashboard:backup.id,card:cardId,at:new Date().toISOString(),startingGit:'pending'});
 const before=await rows(card.dataset_query);save('rows-before',before,priv);
 console.log(JSON.stringify({backupDashboard:backup.id,cardId,rows:before.rows.length}));
}

if(process.argv.includes('--apply')){
 await assertSource();const before=load('card-before'),current=await api('GET','card/'+cardId);
 assert.equal(sql(current),sql(before),'Card changed after backup');
 assert.deepEqual(current.visualization_settings,before.visualization_settings);
 assert.equal(current.name,'Forecast watchlist');
 const probe=await rows(native.dataset_query);
 const names=probe.cols.map(c=>c.name);
 assert(names.includes('Loan Key')&&!names.includes('Loan reference'));
 assert(!probe.rows.some(r=>String(r[names.indexOf('Loan Key')]).includes('unavailable')),'Missing readable Loan Key');
 const result=await api('PUT','card/'+cardId,{dataset_query:native.dataset_query,visualization_settings:native.visualization_settings});
 assert.equal(result.id,cardId);
 console.log('Watchlist Loan Key saved');
}

if(process.argv.includes('--verify')){
 await assertSource();const before=load('card-before'),dashboardBefore=load('dashboard-before');
 const [card,dashboard]=await Promise.all([api('GET','card/'+cardId),api('GET','dashboard/'+dashboardId)]);
 assert.equal(sql(card),native.dataset_query.native.query);
 assert.deepEqual(card.visualization_settings,native.visualization_settings);
 assert.deepEqual(shape(dashboard),shape(dashboardBefore));
 assert.deepEqual(dashboard.tabs,dashboardBefore.tabs);
 assert.deepEqual(dashboard.parameters,dashboardBefore.parameters);
 const a=load('rows-before'),b=await rows(card.dataset_query);
 const oldNames=a.cols.map(c=>c.name),newNames=b.cols.map(c=>c.name);
 assert.deepEqual(newNames,oldNames.map(n=>n==='Loan reference'?'Loan Key':n));
 assert.equal(a.rows.length,b.rows.length);
 const oldKey=oldNames.indexOf('Loan reference'),newKey=newNames.indexOf('Loan Key');
 assert(oldKey>=0&&newKey>=0);
 for(let i=0;i<a.rows.length;i++){
  for(let j=0;j<oldNames.length;j++)if(j!==oldKey)assert.deepEqual(b.rows[i][j],a.rows[i][j],`Other value changed at ${i}, ${j}`);
  assert(b.rows[i][newKey]&&!String(b.rows[i][newKey]).includes('unavailable'));
 }
 const result={passed:true,at:new Date().toISOString(),question:cardId,tab:tabId,rows:b.rows.length,oldLabel:'Loan reference',newLabel:'Loan Key',otherValuesUnchanged:true,dashboardUnchanged:true,backupDashboard:load('backup',out).dashboard};
 save('saved',{id:card.id,key:'watchlist',name:card.name,display:card.display,dataset_query:card.dataset_query,visualization_settings:card.visualization_settings,description:card.description});
 save('verification',result);console.log(JSON.stringify(result));
}
