// R116 (V128) principal write-offs apart from profit on the Income Statement page (dashboard 3, tab 16), in the style of
// Finalize-IncomeRefinement.mjs and Verify-IncomePage.mjs. Metabase reads loan_manager_prod, so this runs only at the R116
// PROD promotion, under the owner's approval and after V128 is applied to PROD; never against DEV data, never as a replay of
// Install-IncomePage.mjs. Models stay pass-through (their SQL is unchanged); no service, Dockerfile or start.sh change.
//   --plan     print the intended change; no API call.
//   --prepare  assert the PROD source and capture the private baseline (snippet 2, model 186, questions 168-171 and 204,
//              dashboard 3, the collection permission graph) under MW_METABASE_PRIVATE_DIR/r116-writeoff-segregation;
//              refuses to overwrite an existing baseline.
//   --apply    refuses unless the source carries V128 and every touched object still equals the baseline (or this change);
//              then, each step skipped when already done:
//              1. snippet 2 "Income statement period" = live-income-period.sql (adds signed "Principal Write-offs"; Net
//                 Profit = Operating Income + Operating Expenses + Principal Write-offs);
//              2. model 186 Income Events: its result metadata gains "Principal Write-offs" (the model SQL is unchanged);
//              3. a new question "Principal write-offs" (the scalar, beside question 169 in its collection);
//              4. question 204, the waterfall: a "Write-offs" step after Expenses; its total stays Net profit;
//              5. dashboard 3 tab 16: the scalar row becomes Income, Expenses, Principal write-offs, Net profit (four of
//                 width 6), the formula note and the waterfall title name write-offs; nothing else on any tab changes.
//              The new question id is written to statement-cleanup-state.json (cards.writeoffs), so StatementCleanup.mjs
//              lays the page out the same way; a sanitized record goes to statement-cleanup/writeoff-segregation.json.
//   --verify   period parity against independent SQL on the governed views (gross, expenses, write-offs, net, average and
//              the waterfall total) for eight periods, current-month parity with "Cash Dashboard", and preservation of every
//              other placement, the filters, the permissions and the model SQL. Booleans only, no amounts are written.
// After --apply: ProposedLoanReports.mjs --rebaseline-dashboard3=R116, then
// ProposedLoanReports.mjs --refine --only=income.vs-previous,income.monthly (dashboard 32's own income questions).
// Rollback: restore the private baseline (snippet 2 content, card 204 query and name, model 186 metadata, dashboard 3
// cards), archive the new question and remove cards.writeoffs from the state; V128 stays (its columns are additive).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,privateDir,root,read,write} from './ReportingApi.mjs';
import {BRIDGE_BEFORE_NAME,BRIDGE_BEFORE_SQL,NOTE_BEFORE,SNIPPET_PREFIX,WRITE_OFF_BRIDGE_NAME,WRITE_OFF_BRIDGE_SQL,WRITE_OFF_BRIDGE_TITLE,
 WRITE_OFF_NOTE,WRITE_OFF_SCALAR_NAME,WRITE_OFF_SCALAR_SQL,incomeQuery,incomeRow} from './WriteOffSegregation.mjs';

const args=process.argv.slice(2);
const priv=(process.env.MW_METABASE_PRIVATE_DIR||privateDir)+'/r116-writeoff-segregation';
const save=(name,value)=>{fs.mkdirSync(priv,{recursive:true});fs.writeFileSync(`${priv}/${name}.json`,JSON.stringify(value,null,2)+'\n');};
const load=name=>JSON.parse(fs.readFileSync(`${priv}/${name}.json`,'utf8'));
const STATE='statement-cleanup-state.json',TAB=16,SNIPPET=2,MODEL=186,BRIDGE=204,PARAMETER='review-income',COLUMN='Principal Write-offs';
const snippetFile=fs.readFileSync(root+'/scripts/metabase/live-income-period.sql','utf8');
const sql=c=>c?.dataset_query?.stages?.[0]?.native??c?.dataset_query?.native?.query;
const shape=c=>({id:c.id,card_id:c.card_id,dashboard_tab_id:c.dashboard_tab_id,row:c.row,col:c.col,size_x:c.size_x,size_y:c.size_y,parameter_mappings:c.parameter_mappings,visualization_settings:c.visualization_settings});
const byId=(a,b)=>a.id-b.id;
const noteText=c=>c.visualization_settings?.virtual_card?.visualization_settings?.text;
const rowCards=[168,169,170];
// The tab 16 dashcards this change edits: the scalar row, the formula note and the waterfall placement.
const edited=(c,writeoffs)=>c.dashboard_tab_id===TAB&&([...rowCards,writeoffs].includes(c.card_id)||c.card_id===BRIDGE||(!c.card_id&&[NOTE_BEFORE,WRITE_OFF_NOTE].includes(noteText(c))));
const native=(query,tags={})=>({database:2,type:'native',native:{query,'template-tags':tags}});
async function dataset(query,parameters=[]){const r=await api('POST','dataset',{...query,parameters});if(r.status!=='completed')throw Error('Source query failed: '+String(r.error).slice(0,200));return r.data;}
async function assertV128(){
 const r=await api('POST','dataset',native(`SELECT "${COLUMN}" FROM public.reporting_income_events LIMIT 0`));
 if(r.status!=='completed')throw Error('The reporting source has no V128 write-off column: apply V128 to PROD first');
}
const plan={snippet:{id:SNIPPET,file:'live-income-period.sql',adds:COLUMN},model:{id:MODEL,adds_metadata:COLUMN,sql:'unchanged'},
 question:{name:WRITE_OFF_SCALAR_NAME,display:'scalar',query:SNIPPET_PREFIX+WRITE_OFF_SCALAR_SQL,mapping:PARAMETER},
 bridge:{id:BRIDGE,before:{name:BRIDGE_BEFORE_NAME,query:SNIPPET_PREFIX+BRIDGE_BEFORE_SQL},after:{name:WRITE_OFF_BRIDGE_NAME,query:SNIPPET_PREFIX+WRITE_OFF_BRIDGE_SQL}},
 dashboard:{id:3,tab:TAB,row:incomeRow('<new>').map(([card,title,col,width])=>({card,title,col,width})),note:WRITE_OFF_NOTE,bridge_title:WRITE_OFF_BRIDGE_TITLE}};

if(args.includes('--plan'))console.log(JSON.stringify(plan,null,1));

if(args.includes('--prepare')){
 await assertSource();assert(!fs.existsSync(`${priv}/dashboard-3.json`),'The R116 baseline already exists; it is never overwritten');
 const snippet=await api('GET','native-query-snippet/'+SNIPPET),cards={};
 assert(!snippet.content.includes(COLUMN),'Snippet 2 already carries the write-off column');
 for(const id of [MODEL,168,169,170,171,BRIDGE])cards[id]=await api('GET','card/'+id);
 assert.equal(sql(cards[BRIDGE]),SNIPPET_PREFIX+BRIDGE_BEFORE_SQL,'Question 204 differs from the canonical two-step waterfall');
 const d=await api('GET','dashboard/3'),row=d.dashcards.filter(c=>c.dashboard_tab_id===TAB&&rowCards.includes(c.card_id)).sort((a,b)=>a.col-b.col);
 assert.deepEqual(row.map(c=>[c.card_id,c.col,c.row,c.size_x,c.size_y]),incomeRow(null).map(([id,,col,w])=>[id,col,3,w,3]),'Tab 16 scalar row differs from the canonical layout');
 assert.equal(d.dashcards.filter(c=>c.dashboard_tab_id===TAB&&!c.card_id&&noteText(c)===NOTE_BEFORE).length,1,'Tab 16 formula note not found');
 save('snippet-2',snippet);save('cards',cards);save('dashboard-3',d);save('permissions',await api('GET','collection/graph'));
 console.log(JSON.stringify({prepared:true,dashcards:d.dashcards.length,tab16:d.dashcards.filter(c=>c.dashboard_tab_id===TAB).length,cards:Object.keys(cards).length}));
}

// Every dashcard outside the edited ones, the tabs and the filters still equal the baseline.
function assertPreserved(live,baseline,writeoffs){
 assert.deepEqual(live.tabs,baseline.tabs,'dashboard 3 tabs changed');assert.deepEqual(live.parameters,baseline.parameters,'dashboard 3 filters changed');
 assert.deepEqual(live.dashcards.filter(c=>!edited(c,writeoffs)).map(shape).sort(byId),baseline.dashcards.filter(c=>!edited(c,writeoffs)).map(shape).sort(byId),'dashboard 3 placements changed outside the R116 edits');
}

if(args.includes('--apply')){
 await assertSource();await assertV128();
 const baseline={snippet:load('snippet-2'),cards:load('cards'),dashboard:load('dashboard-3')},state=read(STATE);
 assertPreserved(await api('GET','dashboard/3'),baseline.dashboard,state.cards.writeoffs);
 const done=[];
 // 1. Snippet 2.
 const snippet=await api('GET','native-query-snippet/'+SNIPPET);
 if(snippet.content!==snippetFile){
  assert.equal(snippet.content,baseline.snippet.content,'Snippet 2 changed since the baseline');
  await api('PUT','native-query-snippet/'+SNIPPET,{content:snippetFile});done.push('snippet');
 }
 // 2. Model 186 metadata (the SQL stays the same pass-through of reporting_income_events).
 const model=await api('GET','card/'+MODEL);assert.equal(sql(model),sql(baseline.cards[MODEL]),'Model 186 SQL changed since the baseline');
 if(!model.result_metadata.some(c=>c.name===COLUMN)){
  const col=(await dataset(native(sql(model)+' LIMIT 0'))).cols.find(c=>c.name===COLUMN);assert(col,'Model 186 does not return the write-off column');
  await api('PUT','card/'+MODEL,{result_metadata:[...model.result_metadata,{name:COLUMN,display_name:COLUMN,base_type:col.base_type,effective_type:col.effective_type??col.base_type,
   semantic_type:null,field_ref:['field',COLUMN,{'base-type':col.base_type}],description:COLUMN+'. '+(model.description??'')}]});done.push('model-metadata');
 }
 // 3. The scalar question, a sibling of question 169 (same collection, description and number format).
 const current={period:[{id:PARAMETER,type:'date/all-options',value:'thismonth',target:['dimension',['template-tag','statement_period']]}]};
 if(!state.cards.writeoffs){
  const q169=await api('GET','card/169'),query=incomeQuery(WRITE_OFF_SCALAR_SQL);
  await dataset(query,current.period.map(({id,...p})=>p));
  const visualization=JSON.parse(JSON.stringify(q169.visualization_settings).replaceAll('Operating Expenses',COLUMN));
  const c=await api('POST','card',{name:WRITE_OFF_SCALAR_NAME,type:'question',display:'scalar',collection_id:q169.collection_id,description:q169.description,dataset_query:query,visualization_settings:visualization});
  state.cards.writeoffs=c.id;write(STATE,state);done.push('question');
 }
 // 4. The waterfall.
 const bridge=await api('GET','card/'+BRIDGE);
 if(sql(bridge)!==SNIPPET_PREFIX+WRITE_OFF_BRIDGE_SQL){
  assert.equal(sql(bridge),SNIPPET_PREFIX+BRIDGE_BEFORE_SQL,'Question 204 changed since the baseline');
  const query=incomeQuery(WRITE_OFF_BRIDGE_SQL);await dataset(query,current.period.map(({id,...p})=>p));
  await api('PUT','card/'+BRIDGE,{name:WRITE_OFF_BRIDGE_NAME,dataset_query:query});done.push('waterfall');
 }
 // 5. Dashboard 3 tab 16.
 const d=await api('GET','dashboard/3'),writeoffs=state.cards.writeoffs;
 if(!d.dashcards.some(c=>c.dashboard_tab_id===TAB&&c.card_id===writeoffs)){
  const layout=new Map(incomeRow(writeoffs).map(([id,title,col,width])=>[id,{title,col,width}]));
  const cards=d.dashcards.map(c=>{
   if(c.dashboard_tab_id!==TAB)return c;
   if(rowCards.includes(c.card_id))return {...c,col:layout.get(c.card_id).col,size_x:layout.get(c.card_id).width};
   if(c.card_id===BRIDGE)return {...c,visualization_settings:{...c.visualization_settings,'card.title':WRITE_OFF_BRIDGE_TITLE}};
   if(!c.card_id&&noteText(c)===NOTE_BEFORE)return {...c,visualization_settings:{...c.visualization_settings,virtual_card:{...c.visualization_settings.virtual_card,visualization_settings:{...c.visualization_settings.virtual_card.visualization_settings,text:WRITE_OFF_NOTE}}}};
   return c;
  });
  const {col,width,title}=layout.get(writeoffs);
  cards.push({id:-1,card_id:writeoffs,dashboard_tab_id:TAB,col,row:3,size_x:width,size_y:3,series:[],
   parameter_mappings:[{parameter_id:PARAMETER,card_id:writeoffs,target:['dimension',['template-tag','statement_period']]}],visualization_settings:{'card.title':title}});
  await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});done.push('dashboard');
 }
 const after=await api('GET','dashboard/3');assertPreserved(after,baseline.dashboard,writeoffs);
 assert.deepEqual(after.dashcards.filter(c=>c.dashboard_tab_id===TAB&&[...rowCards,writeoffs].includes(c.card_id)).sort((a,b)=>a.col-b.col).map(c=>[c.card_id,c.col,c.row,c.size_x,c.size_y]),
  incomeRow(writeoffs).map(([id,,col,w])=>[id,col,3,w,3]),'Tab 16 scalar row readback');
 write('statement-cleanup/writeoff-segregation.json',{date:new Date().toISOString().slice(0,10),release:'R116',migration:'V128',dashboard_id:3,tab_id:TAB,question_id:writeoffs,
  waterfall_question:BRIDGE,snippet_id:SNIPPET,model_id:MODEL,model_sql_unchanged:true,steps:done,other_placements_unchanged:true,filters_unchanged:true,
  rollback:'Private r116-writeoff-segregation baseline (snippet 2, cards 168-171/186/204, dashboard 3, permissions); archive the new question'});
 console.log(JSON.stringify({applied:done,question:writeoffs,next:['ProposedLoanReports.mjs --rebaseline-dashboard3=R116','ProposedLoanReports.mjs --refine --only=income.vs-previous,income.monthly','Refine-WriteOffSegregation.mjs --verify']}));
}

if(args.includes('--verify')){
 await assertSource();await assertV128();
 const baseline={cards:load('cards'),dashboard:load('dashboard-3'),permissions:load('permissions')},state=read(STATE),writeoffs=state.cards.writeoffs,checks=[];
 const check=(name,ok)=>{if(!ok)throw Error(name+' failed');checks.push({check:name,passed:true});};
 const near=(a,b)=>a==null||b==null?a==null&&b==null:Math.abs(Number(a)-Number(b))<1e-7;
 assert(writeoffs,'Run --apply first');
 const d=await api('GET','dashboard/3');
 check('Other placements, tabs and filters of dashboard 3 unchanged',(assertPreserved(d,baseline.dashboard,writeoffs),true));
 check('Tab 16 row: Income, Expenses, Principal write-offs, Net profit',JSON.stringify(d.dashcards.filter(c=>c.dashboard_tab_id===TAB&&[...rowCards,writeoffs].includes(c.card_id)).sort((a,b)=>a.col-b.col).map(c=>[c.card_id,c.col,c.row,c.size_x,c.size_y]))===JSON.stringify(incomeRow(writeoffs).map(([id,,col,w])=>[id,col,3,w,3])));
 check('Formula note and waterfall title name write-offs',d.dashcards.some(c=>c.dashboard_tab_id===TAB&&!c.card_id&&noteText(c)===WRITE_OFF_NOTE)&&d.dashcards.find(c=>c.dashboard_tab_id===TAB&&c.card_id===BRIDGE)?.visualization_settings?.['card.title']===WRITE_OFF_BRIDGE_TITLE);
 const placed=d.dashcards.find(c=>c.dashboard_tab_id===TAB&&c.card_id===writeoffs);
 check('Write-off question follows the Statement period filter',JSON.stringify(placed.parameter_mappings.map(m=>[m.parameter_id,m.target]))===JSON.stringify([[PARAMETER,['dimension',['template-tag','statement_period']]]]));
 check('Snippet 2 equals live-income-period.sql',(await api('GET','native-query-snippet/'+SNIPPET)).content===snippetFile);
 const model=await api('GET','card/'+MODEL);
 check('Model 186 SQL unchanged; metadata gains only the write-off column',sql(model)===sql(baseline.cards[MODEL])&&JSON.stringify(model.result_metadata.map(c=>c.name))===JSON.stringify([...baseline.cards[MODEL].result_metadata.map(c=>c.name),COLUMN]));
 check('Waterfall and write-off questions read the shared snippet',sql(await api('GET','card/'+BRIDGE))===SNIPPET_PREFIX+WRITE_OFF_BRIDGE_SQL&&sql(await api('GET','card/'+writeoffs))===SNIPPET_PREFIX+WRITE_OFF_SCALAR_SQL);
 for(const id of [168,169,170,171])check(`Question ${id} unchanged`,sql(await api('GET','card/'+id))===sql(baseline.cards[id]));
 check('Partner-only collection permissions unchanged',JSON.stringify(await api('GET','collection/graph'))===JSON.stringify(baseline.permissions));
 const dashcard=id=>d.dashcards.find(c=>c.dashboard_tab_id===TAB&&c.card_id===id);
 const card=async(id,value)=>{const c=dashcard(id),parameters=value?[{id:PARAMETER,type:'date/all-options',value,target:['dimension',['template-tag','statement_period']]}]:[];
  const r=await api('POST',`dashboard/3/dashcard/${c.id}/card/${id}/query`,{parameters});if(r.status!=='completed')throw Error('Income card failed '+id);return r.data.rows;};
 const calendar={p:{id:'r116-period',name:'p','display-name':'Period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'}};
 const range=async value=>(await dataset(native('SELECT min(d."Date")::text,max(d."Date")::text,count(*)::int FROM public.reporting_statement_calendar d WHERE true [[AND {{p}}]]',calendar),value?[{type:'date/all-options',value,target:['dimension',['template-tag','p']]}]:[])).rows[0];
 const today=(await dataset(native(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text`))).rows[0][0];
 const periods=[['this month','thismonth'],['previous month','lastmonth'],['past 30 days','past30days'],['past 90 days','past90days'],['this year','thisyear'],['single day',`${today}~${today}`],['empty past','2000-01-01~2000-01-02'],['all dates',null]];
 for(const [label,value] of periods){
  const [starts,ends,days]=await range(value);
  let gross=null,expense=null,writeoff=null;
  if(days>0){
   const [g,w]=(await dataset(native(`SELECT coalesce(sum("Interest Paid"::numeric) FILTER(WHERE NOT starts_with("Row ID",'df10:')),0),coalesce(sum("Principal Paid"::numeric) FILTER(WHERE starts_with("Row ID",'df10:')),0) FROM public.olap_repayments_analytics WHERE "Payment Date" BETWEEN DATE '${starts}' AND DATE '${ends}'`))).rows[0].map(Number);
   expense=Number((await dataset(native(`SELECT coalesce(sum("Amount"::numeric),0) FROM public."Business Expenses" WHERE "Expense Date" BETWEEN DATE '${starts}' AND DATE '${ends}'`))).rows[0][0]);
   gross=g;writeoff=w;
  }
  const net=days>0?gross-expense-writeoff:null;
  check(label+' gross profit',near((await card(168,value))[0][0],gross));
  check(label+' expenses',near((await card(169,value))[0][0],days>0?-expense:null));
  check(label+' principal write-offs',near((await card(writeoffs,value))[0][0],days>0?-writeoff:null));
  check(label+' net profit = gross - expenses - write-offs',near((await card(170,value))[0][0],net));
  check(label+' average daily net profit',near((await card(171,value))[0][0],days>0?net/days:null));
  const bridge=await card(BRIDGE,value);
  check(label+' waterfall steps',JSON.stringify(bridge.map(r=>r[0]))===JSON.stringify(['Income','Expenses','Write-offs'])&&near(bridge[0][1],gross)&&near(bridge[1][1],days>0?-expense:null)&&near(bridge[2][1],days>0?-writeoff:null));
  check(label+' waterfall total = net profit',days>0?near(bridge.reduce((n,r)=>n+Number(r[1]),0),net):bridge.every(r=>r[1]===null));
 }
 const source=await dataset(native('SELECT "Operating Income MTD","Expenses MTD","Principal Write-offs MTD","Net Profit MTD" FROM public."Cash Dashboard"'));
 const [income,expenses,writeoffsMtd,netMtd]=source.rows[0];
 check('Current month matches OLTP Cash Dashboard gross profit',near((await card(168,'thismonth'))[0][0],income));
 check('Current month matches OLTP Cash Dashboard expenses',near((await card(169,'thismonth'))[0][0],expenses));
 check('Current month matches OLTP Cash Dashboard write-offs',near((await card(writeoffs,'thismonth'))[0][0],-writeoffsMtd));
 check('Current month matches OLTP Cash Dashboard net profit',near((await card(170,'thismonth'))[0][0],netMtd));
 write('statement-cleanup/writeoff-segregation-verification.json',{verified_at:new Date().toISOString(),release:'R116',checks,check_count:checks.length,periods:periods.map(p=>p[0]),
  statement_source:'Independent SQL on olap_repayments_analytics and Business Expenses; current-month parity with Cash Dashboard',financial_values_published:false});
 console.log(`${checks.length} write-off source, period, parity and preservation checks passed.`);
}
