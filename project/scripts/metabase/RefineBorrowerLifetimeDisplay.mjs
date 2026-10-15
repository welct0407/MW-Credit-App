// R040: one-decimal lifetime daily rate and both lifetime ratios in Portfolio comparison.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';

const out=`${root}/outputs/r040-borrower-lifetime-display`;
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r040-borrower-lifetime-display';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const privateFile=name=>`${priv}/${name}.json`;
const savePrivate=(name,value)=>fs.writeFileSync(privateFile(name),JSON.stringify(value,null,2)+'\n');
const readPrivate=name=>JSON.parse(fs.readFileSync(privateFile(name),'utf8'));
const save=(name,value)=>fs.writeFileSync(`${out}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const sql=card=>card.dataset_query.native?.query??card.dataset_query.stages?.[0]?.native;
const tags=()=>({
 period:{id:'bp-period',name:'period','display-name':'Activity period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'},
 population:{id:'bp-population',name:'population','display-name':'Population',type:'text',default:'All with loan history'}
});
const cardTag={id:'r040-model-310',name:'#310','display-name':'Borrower lifetime economics',type:'card','card-id':310};
const daily='Lifetime daily rate';
const lifetime='Lifetime interest return';
const percent={number_style:'percent',decimals:1,number_separators:'.,',compact:false};
const rateKey=JSON.stringify(['name','Achieved daily rate']);
const key=name=>JSON.stringify(['name',name]);
const shape=dashboard=>dashboard.dashcards.map(({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings})=>({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings})).sort((a,b)=>a.id-b.id);

function proposed(rate,table){
 assert.equal(rate.id,313);assert.equal(table.id,289);
 assert.equal(rate.visualization_settings.column_settings[rateKey].decimals,3,'Rate formatting drift');
 const old=sql(table);
 const select='c.interest_received AS "Interest ฿",';
 const join='FROM cohort c LEFT JOIN public.reporting_borrower_payment_health_v1 h USING(borrower_id)';
 assert.equal(old.split(select).length,2,'Comparison select drift');
 assert.equal(old.split(join).length,2,'Comparison join drift');
 assert(!old.includes(`AS "${daily}"`),'Lifetime columns already installed');
 const query=old.replace(select,`${select}e."Achieved daily rate" AS "${daily}",e."Lifetime interest return" AS "${lifetime}",`)
  .replace(join,`FROM cohort c LEFT JOIN {{#310}} e ON e."Borrower ID"=c.borrower_id LEFT JOIN public.reporting_borrower_payment_health_v1 h USING(borrower_id)`);
 const settings=structuredClone(table.visualization_settings);
 const columns=settings['table.columns'];
 const interestIndex=columns.findIndex(c=>c.name==='Interest ฿');assert(interestIndex>=0);
 columns.splice(interestIndex+1,0,...[daily,lifetime].map(name=>({name,fieldRef:['field',name,{'base-type':'type/Decimal'}],enabled:true})));
 settings.column_settings[key(daily)]=percent;settings.column_settings[key(lifetime)]=percent;
 const rateSettings=structuredClone(rate.visualization_settings);
 rateSettings.column_settings[rateKey].decimals=1;
 return {rateSettings,tableSettings:settings,tableQuery:{database:2,type:'native',native:{query,'template-tags':{...tags(table),'#310':cardTag}}}};
}
const current=async()=>{
 await assertSource();
 const [dashboard,rate,table,model]=await Promise.all([api('GET','dashboard/3'),api('GET','card/313'),api('GET','card/289'),api('GET','card/310')]);
 assert(dashboard.tabs.some(t=>t.id===104));
 for(const id of [313,289])assert.equal(dashboard.dashcards.filter(p=>p.dashboard_tab_id===104&&p.card_id===id).length,1);
 for(const name of ['Achieved daily rate','Lifetime interest return'])assert(model.result_metadata.some(x=>x.name===name));
 return {dashboard,rate,table,model};
};
const dashboardQuery=async(dashboard,id,parameters=[])=>{
 const p=dashboard.dashcards.find(x=>x.dashboard_tab_id===104&&x.card_id===id);
 const r=await api('POST',`dashboard/3/dashcard/${p.id}/card/${id}/query`,{parameters});
 assert.equal(r.status,'completed',`Dashboard question ${id} failed`);
 return r;
};

if(process.argv.includes('--prepare')){
 const before=fs.existsSync(privateFile('before'))?readPrivate('before'):await current();
  if(fs.existsSync(privateFile('before'))){const live=await current();assert.deepEqual(shape(live.dashboard),shape(before.dashboard));assert.deepEqual(live.table.dataset_query,before.table.dataset_query);assert.deepEqual(live.rate.dataset_query,before.rate.dataset_query);}
  else savePrivate('before',before);
  const plan=proposed(before.rate,before.table);
 const check=await api('POST','dataset',plan.tableQuery);
 assert.equal(check.status,'completed');assert(!check.data.rows_truncated);
 const names=check.data.cols.map(c=>c.name);
 for(const name of [daily,lifetime])assert(names.includes(name));
 save('plan',{dashboard:3,tab:104,questions:[313,289],model:310,columns:[daily,lifetime],decimalPlaces:1,defaultRows:check.data.rows.length,periodAndPopulationMappingsPreserved:true,startingCommit:'82677ce27768648561f7872f7aab699d5cfe0ffc'});
 console.log('Prepared scoped update; comparison query and lifetime fields passed preflight');
}

if(process.argv.includes('--publish')){
 const before=readPrivate('before'),live=await current();const plan=proposed(before.rate,before.table);
 assert.deepEqual(shape(live.dashboard),shape(before.dashboard),'Dashboard drift');
 assert.deepEqual(live.dashboard.parameters,before.dashboard.parameters,'Dashboard parameter drift');
 assert.deepEqual(live.rate.dataset_query,before.rate.dataset_query,'Rate question drift');
 assert.deepEqual(live.rate.visualization_settings,before.rate.visualization_settings,'Rate formatting drift');
 assert.deepEqual(live.table.dataset_query,before.table.dataset_query,'Comparison question drift');
 assert.deepEqual(live.table.visualization_settings,before.table.visualization_settings,'Comparison formatting drift');
 assert.deepEqual(live.model.dataset_query,before.model.dataset_query,'Lifetime model drift');
 const backup=await api('POST','dashboard/3/copy',{name:'R040 recovery - before borrower lifetime display',collection_id:5});
 save('state',{backupDashboard:backup.id,dashboard:3,tab:104,questions:[313,289]});
 await api('PUT','card/313',{visualization_settings:plan.rateSettings});
 await api('PUT','card/289',{dataset_query:plan.tableQuery,visualization_settings:plan.tableSettings,
  description:'R040 comparison: current/selected-period activity plus lifetime achieved daily rate (interest through yesterday / end-of-day principal-days) and lifetime interest return (interest through today / total original principal lent). Lifetime columns ignore Activity dates; all retain the population filter. Click Borrower for Detail.'});
 console.log(`Published two scoped question changes; recovery dashboard ${backup.id}`);
}

if(process.argv.includes('--verify')){
 const before=readPrivate('before'),live=await current(),p=proposed(before.rate,before.table);
 assert.deepEqual(shape(live.dashboard),shape(before.dashboard),'Dashboard placements changed');
 assert.deepEqual(live.dashboard.parameters,before.dashboard.parameters,'Dashboard filters changed');
 assert.deepEqual(live.rate.dataset_query,before.rate.dataset_query,'Rate query changed');
 assert.deepEqual(live.rate.visualization_settings,p.rateSettings,'Rate formatting mismatch');
 assert.equal(sql(live.table),p.tableQuery.native.query);
 assert.deepEqual(live.table.visualization_settings,p.tableSettings,'Comparison formatting mismatch');
 assert.deepEqual(live.model.dataset_query,before.model.dataset_query,'Lifetime model changed');
 const mapping=live.dashboard.dashcards.find(x=>x.dashboard_tab_id===104&&x.card_id===289).parameter_mappings;
 assert.deepEqual(mapping,before.dashboard.dashcards.find(x=>x.dashboard_tab_id===104&&x.card_id===289).parameter_mappings);
 const base=await dashboardQuery(live.dashboard,289);
 const dated=await dashboardQuery(live.dashboard,289,[{id:'bp-period',type:'date/all-options',value:'2026-09-01~2026-09-10'}]);
 const filtered=await dashboardQuery(live.dashboard,289,[{id:'bp-population',type:'string/=',value:['Currently active']}]);
 const chart=await dashboardQuery(live.dashboard,313);
 const model=await api('POST','card/310/query',{});assert.equal(model.status,'completed');
 const map=r=>Object.fromEntries(r.data.rows.map(row=>[row[r.data.cols.findIndex(c=>c.name==='Borrower ID')],row]));
 const bm=map(base),dm=map(dated),fm=map(filtered),mm=map(model);
 for(const [borrower,row] of Object.entries(bm)){
  assert(Object.hasOwn(mm,borrower));
  for(const [column,modelColumn] of [[daily,'Achieved daily rate'],[lifetime,'Lifetime interest return']]){
   const index=base.data.cols.findIndex(c=>c.name===column),modelIndex=model.data.cols.findIndex(c=>c.name===modelColumn);
   assert.equal(row[index],mm[borrower][modelIndex],`${column} model mismatch`);
   if(Object.hasOwn(dm,borrower))assert.equal(row[index],dm[borrower][index],`${column} responds to activity dates`);
   if(Object.hasOwn(fm,borrower))assert.equal(row[index],fm[borrower][index],`${column} changes with population`);
  }
 }
 assert.equal(chart.status,'completed');
 save('saved',{dashboard:3,tab:104,questions:[live.rate,live.table].map(c=>({id:c.id,name:c.name,description:c.description,display:c.display,dataset_query:c.dataset_query,visualization_settings:c.visualization_settings})),placements:live.dashboard.dashcards.filter(c=>c.dashboard_tab_id===104&&[313,289].includes(c.card_id)).map(({id,card_id,row,col,size_x,size_y,parameter_mappings,visualization_settings})=>({id,card_id,row,col,size_x,size_y,parameter_mappings,visualization_settings}))});
 save('verification',{passed:true,comparisonRows:base.data.rows.length,rateRows:chart.data.rows.length,oneDecimalBothTableMetrics:true,lifetimeColumnsMatchModel:true,lifetimeColumnsDateInvariant:true,populationMappingPreserved:true,tableDrillAndOtherPlacementsPreserved:true,backupDashboard:JSON.parse(fs.readFileSync(`${out}/state.json`)).backupDashboard});
 console.log('Saved formatting, table values, date invariance, filters and dashboard layout verified');
}
