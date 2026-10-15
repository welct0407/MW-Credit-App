import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,privateDir,root,read,write} from './ReportingApi.mjs';
export const backup=privateDir+'/cash-snapshot-report-before';
export const prior=n=>JSON.parse(fs.readFileSync(`${backup}/${n}.json`,'utf8'));
export const projection=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
export const modelSpecs=[
 ['daily-cash-snapshot','Daily Cash Snapshots','One stored row per Bangkok date. Past-date closing positions and completed-day trends only; never sum balances across dates.'],
 ['account-cash-snapshot','Account Cash Snapshots','One stored row per Bangkok date and cash account. Signed balances; missing openings stay NULL. Current labels, immutable holder ownership.']
];
export const snippetName='Cash position source routing';
const monetary=names=>({column_settings:Object.fromEntries(names.map(n=>[JSON.stringify(['name',n]),{number_style:'decimal',decimals:0,number_separators:'.,',compact:false}]))});
export const questions=[
 {key:'remaining',name:'Remaining lending capital · selected position',display:'scalar',select:'SELECT DISTINCT "Remaining Lending Capital" FROM position',settings:{'scalar.field':'Remaining Lending Capital',...monetary(['Remaining Lending Capital'])}},
 {key:'cash',name:'Net cash balance · selected position',display:'scalar',select:'SELECT DISTINCT "Net Cash Balance" FROM position',settings:{'scalar.field':'Net Cash Balance',...monetary(['Net Cash Balance'])}},
 {key:'status',name:'Cash position · source and freshness',display:'table',select:`SELECT DISTINCT v.step,v.detail AS "Detail",v.value AS "Value" FROM position p CROSS JOIN LATERAL (VALUES (1,'Position date',to_char(p."Position Date",'YYYY-MM-DD')),(2,'Source',CASE WHEN p."Data Source" LIKE 'Real-time%' THEN 'Live on refresh' WHEN p."Data Source" LIKE 'Daily Analytics%' THEN 'Hourly snapshot' ELSE 'Unavailable' END),(3,'As of',to_char(p."As Of",'YYYY-MM-DD HH24:MI')),(4,'Availability',p."Availability")) v(step,detail,value) ORDER BY v.step`,settings:{'table.pivot':false,'table.columns':[{name:'step',enabled:false},{name:'Detail',enabled:true},{name:'Value',enabled:true}]}},
 {key:'holders',name:'Net cash by holder · selected position',display:'bar',select:'SELECT "Cash Holder",CASE WHEN bool_and("Balance" IS NOT NULL) THEN sum("Balance") END AS "Net Cash Balance" FROM position WHERE "Cash Holder ID" IS NOT NULL GROUP BY "Cash Holder ID","Cash Holder" ORDER BY "Cash Holder"',settings:{'graph.dimensions':['Cash Holder'],'graph.metrics':['Net Cash Balance'],'graph.colors':['#267DCC'],'graph.show_values':true,'graph.label_value_formatting':'full','graph.x_axis.title_enabled':false,'graph.y_axis.title_enabled':false,...monetary(['Net Cash Balance'])}},
 {key:'accounts',name:'Signed account balances · selected position',display:'table',select:'SELECT "Account","Balance","Balance Status" AS "Availability" FROM position WHERE "Cash Account ID" IS NOT NULL ORDER BY "Cash Holder","Account","Cash Account ID"',settings:{'table.pivot':false,...monetary(['Balance'])}}
];
export function layout(d,state){
 const old=d.dashcards.filter(c=>c.dashboard_tab_id===14);let next=-1;const cards=[];
 const note=(row,text,h=1)=>cards.push({id:old.find(c=>!c.card_id&&c.visualization_settings?.virtual_card?.visualization_settings?.text===text)?.id??next--,card_id:null,dashboard_tab_id:14,col:0,row,size_x:24,size_y:h,series:[],parameter_mappings:[],visualization_settings:{'card.background':false,virtual_card:{display:h===1?'heading':'text',visualization_settings:{text}}}});
 const place=(id,col,row,w,h,title,parameter=null)=>cards.push({id:old.find(c=>c.card_id===id)?.id??next--,card_id:id,dashboard_tab_id:14,col,row,size_x:w,size_y:h,series:[],parameter_mappings:parameter?[{parameter_id:parameter==='position_date'?'review-position':'review-position-trend',card_id:id,target:['dimension',['template-tag',parameter]]}]:[],visualization_settings:{'card.title':title}});
 note(0,'Cash position');note(1,'Live today. Hourly snapshots for past dates. Amounts in baht.',2);
 note(3,'1 · Capital today · real-time');place(47,0,4,12,2,'Total cash pool · live');place(48,0,6,12,2,'Principal outstanding · live');place(68,12,4,12,4,'Capital utilization · live');
 note(8,'2 · Selected cash position');note(9,'A range uses its latest date through today. See the source below.',2);
 place(state.cards.remaining,0,11,12,2,'Remaining lending capital','position_date');place(state.cards.cash,12,11,12,2,'Net cash balance','position_date');
 place(state.cards.status,0,13,24,6,'Position & freshness','position_date');
 note(19,'Lending capital is not a bank balance. Net cash includes negative account balances.',2);
 place(state.cards.holders,0,21,10,7,'Net cash by holder · selected date','position_date');place(state.cards.accounts,10,21,14,7,'Account balances · selected date','position_date');
 note(28,'3 · Historical trend · Daily Analytics');
 place(state.cards.trend,0,29,24,7,'Daily closing positions','position_trend');
 note(36,'Hourly snapshots exclude today. Unknown cash stays blank.',2);
 return cards;
}
if(process.argv.includes('--layout-only')){
 await assertSource();const d=await api('GET','dashboard/3'),state=read('cash-snapshot-report-state.json');
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:[...d.dashcards.filter(c=>c.dashboard_tab_id!==14),...layout(d,state)]});
 const after=await api('GET','dashboard/3'),sort=a=>a.map(projection).sort((a,b)=>a.id-b.id);
 assert.deepEqual(sort(after.dashcards.filter(c=>c.dashboard_tab_id!==14)),sort(d.dashcards.filter(c=>c.dashboard_tab_id!==14)));
 assert.deepEqual(sort(after.dashcards.filter(c=>c.dashboard_tab_id===14)),sort(layout(after,state)));
 const plan=read('cash-snapshot-report-plan.json');plan.layout=layout(after,state);write('cash-snapshot-report-plan.json',plan);
 const evidence=read('cash-snapshot-report-verification.json');evidence.layout_refined_at=new Date().toISOString();evidence.layout_only_preservation_passed=true;write('cash-snapshot-report-verification.json',evidence);
 fs.writeFileSync(backup+'/completed-dashboard.json',JSON.stringify(after,null,2));console.log('Layout-only refinement verified; all queries and other tabs preserved.');
}
if(process.argv.includes('--install')){
 if(fs.existsSync(new URL('../../outputs/r016-20260922/statement-cleanup-state.json',import.meta.url)))throw Error('Canonical cash pages now exist. Use StatementCleanup.mjs and preserve the current Cash Position page; this old installation baseline is retired.');
 await assertSource();const baseline=prior('dashboard');let d=await api('GET','dashboard/3');
 assert.equal(d.tabs.find(t=>t.id===14)?.name,'2R · Cash Position');
 const models=read('models.json');let state;try{state=read('cash-snapshot-report-state.json');}catch{state={cards:{},baseline_commit:'04624908fa23fc61215ec15000fbe1d3305e613c'};}
 for(const [key,name,grain] of modelSpecs){
  const query=fs.readFileSync(`${root}/scripts/metabase/models/${key}.sql`,'utf8');
  const q={database:2,type:'native',native:{query}};const pre=await api('POST','dataset',q);assert.equal(pre.status,'completed',key);
  assert.equal(new Set(pre.data.rows.map(r=>r[0])).size,pre.data.rows.length);assert.ok(pre.data.rows.every(r=>r[0]!==null));
  const id=models[key]?.id;const c=await api(id?'PUT':'POST',id?`card/${id}`:'card',{name,description:grain,type:'model',display:'table',collection_id:8,visualization_settings:{},dataset_query:q});
  const columns=pre.data.cols.map(col=>({...col,semantic_type:col.name==='Snapshot ID'?'type/PK':col.semantic_type,description:`${col.name}. ${grain}`}));
  await api('PUT',`card/${c.id}`,{result_metadata:columns});models[key]={id:c.id,name,collection_id:8,grain,grain_field:'Snapshot ID',database_view:query.match(/FROM (public\.\w+)/)[1],columns:columns.map(({name,base_type,semantic_type,description})=>({name,base_type,semantic_type,description}))};write('models.json',models);
 }
 const tags={};const expand=sql=>sql.replace(/\{\{model:([^}]+)\}\}/g,(_,key)=>{const m=models[key];assert.ok(m,`Missing ${key}`);const name='#'+m.id;tags[name]={id:'r016-model-'+m.id,name,'display-name':m.name,type:'card','card-id':m.id};return '{{'+name+'}}';});
 const content=expand(fs.readFileSync(root+'/scripts/metabase/cash-position-snapshot-snippet.sql','utf8'));
 const found=(await api('GET','native-query-snippet')).find(s=>s.name===snippetName);
 const snippet=await api(found?'PUT':'POST',found?`native-query-snippet/${found.id}`:'native-query-snippet',{name:snippetName,content,description:'2R source selection: today queries live OLAP, past dates read stored snapshots. No financial writes or historical ledger reconstruction.'});
 state.snippet_id=snippet.id;write('cash-snapshot-report-state.json',state);
 const tag='snippet: '+snippetName;tags[tag]={id:'r016-cash-position-routing',name:tag,'display-name':snippetName,type:'snippet','snippet-name':snippetName,'snippet-id':snippet.id};
 tags.position_date={id:'r016-snapshot-position-date',name:'position_date','display-name':'Position date / period end',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'};
 for(const spec of questions){
  const query={database:2,type:'native',native:{query:`WITH position AS ({{${tag}}}) ${spec.select}`,'template-tags':tags}};
  const result=await api('POST','dataset',query);if(result.status!=='completed'){fs.writeFileSync(backup+'/query-error.json',JSON.stringify(result));throw Error('Question preflight '+spec.key);}
  const id=state.cards[spec.key];const c=await api(id?'PUT':'POST',id?`card/${id}`:'card',{name:spec.name,description:'2R selected position. Source and freshness are shown on the page.',type:'question',collection_id:5,display:spec.display,dataset_query:query,visualization_settings:spec.settings});state.cards[spec.key]=c.id;write('cash-snapshot-report-state.json',state);
 }
 const trend=prior('card-202');const trendTags={};const model=models['daily-cash-snapshot'];trendTags['#'+model.id]={id:'r016-model-'+model.id,name:'#'+model.id,'display-name':model.name,type:'card','card-id':model.id};
 trendTags.position_trend={id:'cash-review-trend',name:'position_trend','display-name':'Position trend period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'};
 await api('PUT','card/202',{name:'Cash position trend · stored completed days',description:'V37 stored daily snapshots only. Excludes today; missing cash balances remain NULL.',dataset_query:{database:2,type:'native',native:{query:`SELECT d."Date",d."Remaining Lending Capital" AS "Remaining lending capital",d."Net Cash Balance" AS "Net cash balance" FROM {{#${model.id}}} d WHERE d."Date"<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date [[AND {{position_trend}}]] ORDER BY d."Date"`,'template-tags':trendTags}},visualization_settings:{...trend.visualization_settings,'graph.missing':'none'}});
 state.cards.trend=202;write('cash-snapshot-report-state.json',state);
 d=await api('GET','dashboard/3');assert.deepEqual(d.dashcards.filter(c=>c.dashboard_tab_id!==14).map(projection).sort((a,b)=>a.id-b.id),baseline.dashcards.filter(c=>c.dashboard_tab_id!==14).map(projection).sort((a,b)=>a.id-b.id));
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:[...d.dashcards.filter(c=>c.dashboard_tab_id!==14),...layout(d,state)]});
 const saved=await api('GET','dashboard/3');assert.deepEqual(saved.parameters,baseline.parameters);assert.deepEqual(saved.tabs,baseline.tabs);
 assert.deepEqual(saved.dashcards.filter(c=>c.dashboard_tab_id!==14).map(projection).sort((a,b)=>a.id-b.id),baseline.dashcards.filter(c=>c.dashboard_tab_id!==14).map(projection).sort((a,b)=>a.id-b.id));
 write('cash-snapshot-report-plan.json',{tab:14,models:modelSpecs.map(([key])=>models[key]),snippet_id:snippet.id,cards:state.cards,layout:layout(saved,state),reporting_only:true,other_tabs_preserved:true});
 console.log('2R installed: two snapshot models, one routing snippet, five selected-position questions; shared live cards reused.');
}
