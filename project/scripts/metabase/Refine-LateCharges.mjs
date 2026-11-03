// R118 (V132) late charges on the Income Statement page (dashboard 3, tab 16), in the style of Refine-WriteOffSegregation.mjs.
// Metabase reads loan_manager_prod, so this runs only at the R118 PROD promotion, under the owner's approval and after V132
// is applied to PROD, and after R116 (Refine-WriteOffSegregation.mjs) is applied; never against DEV data. Models stay
// pass-through (their SQL is unchanged); no service, Dockerfile or start.sh change.
//   --plan     print the intended change; no API call. --plan --live also reads live Metabase (GET only) and reports the
//              detected tab 16 row, note, snippet and model state, and whether --prepare would accept them.
//   --prepare  assert the PROD source and capture the private baseline (snippet 2, model 186, questions 168-171 and the R116
//              write-off question, dashboard 3, the collection permission graph) under MW_METABASE_PRIVATE_DIR/r118-late-charges
//              (default ~/.mw-private/MW-Credit-App/metabase/r118-late-charges; never inside the repository); refuses to
//              overwrite an existing baseline, refuses without cards.writeoffs in statement-cleanup-state.json and refuses
//              any tab 16 row but the R116 five-card one (168, 169, write-offs, 170, 171 at 5/5/5/5/4 on one grid row).
//   --apply    refuses unless the source carries V132 and every touched object still equals the baseline (or this change);
//              then, each step skipped when already done:
//              1. snippet 2 "Income statement period" = live-income-period.sql (adds "Late Charges Received", the late part
//                 of Operating Income; Net Profit is unchanged by it, V132 already counts late charges as income);
//              2. model 186 Income Events: its result metadata gains "Late Charges Received" (the model SQL is unchanged);
//              3. a new question "Late charges received" (the scalar, beside question 168 in its collection);
//              4. dashboard 3 tab 16: the R116 row gains the new question as a sixth card, every card at width 4 on the same
//                 grid row (LateCharges.mjs lateRow), and the formula note names late charges; the cards keep their ids,
//                 titles, filters and mappings; nothing else on any tab changes.
//              The new question id is written to statement-cleanup-state.json (cards.latecharges), so StatementCleanup.mjs
//              lays the page out the same way; a sanitized record goes to statement-cleanup/late-charges.json.
//   --verify   period parity against independent SQL on the governed views (late charges received and gross income with
//              late charges) for eight periods, current-month parity with reporting_income_statement, and preservation of
//              every other placement, the filters, the permissions and the model SQL. Booleans only, no amounts are written.
// After --apply: ProposedLoanReports.mjs --rebaseline-dashboard3=R118, then
// ProposedLoanReports.mjs --refine --only=income.latecharges,income (dashboard 32: the "Late charges" card in the Income band),
// then ProposedLoanReports.mjs --verify.
// Rollback: restore the private baseline (snippet 2 content, model 186 metadata, dashboard 3 cards), archive the new question
// and remove cards.latecharges from the state; V132 stays (its columns are additive).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,privateDirFor,root,read,write} from './ReportingApi.mjs';
import {LIVE_ROW_CARDS} from './WriteOffSegregation.mjs';
import {LATE_COLUMN,LATE_NOTE,LATE_SCALAR_NAME,LATE_SCALAR_SQL,NOTE_BEFORE,SNIPPET_PREFIX,incomeQuery,lateRow,r116IncomeRow,lateIncomeRow,assertLateRowCardsKept} from './LateCharges.mjs';

const args=process.argv.slice(2);
const priv=privateDirFor('r118-late-charges',{under:true});
const save=(name,value)=>{fs.mkdirSync(priv,{recursive:true});fs.writeFileSync(`${priv}/${name}.json`,JSON.stringify(value,null,2)+'\n');};
const load=name=>JSON.parse(fs.readFileSync(`${priv}/${name}.json`,'utf8'));
const STATE='statement-cleanup-state.json',TAB=16,SNIPPET=2,MODEL=186,PARAMETER='review-income';
const snippetFile=fs.readFileSync(root+'/scripts/metabase/live-income-period.sql','utf8');
const sql=c=>c?.dataset_query?.stages?.[0]?.native??c?.dataset_query?.native?.query;
const shape=c=>({id:c.id,card_id:c.card_id,dashboard_tab_id:c.dashboard_tab_id,row:c.row,col:c.col,size_x:c.size_x,size_y:c.size_y,parameter_mappings:c.parameter_mappings,visualization_settings:c.visualization_settings});
const byId=(a,b)=>a.id-b.id;
const noteText=c=>c.visualization_settings?.virtual_card?.visualization_settings?.text;
// The tab 16 dashcards this change edits: the scalar row (R116's five and the new one) and the formula note.
const edited=(c,writeoffs,latecharges)=>c.dashboard_tab_id===TAB&&([...LIVE_ROW_CARDS,writeoffs,latecharges].includes(c.card_id)||(!c.card_id&&[NOTE_BEFORE,LATE_NOTE].includes(noteText(c))));
const native=(query,tags={})=>({database:2,type:'native',native:{query,'template-tags':tags}});
async function dataset(query,parameters=[]){const r=await api('POST','dataset',{...query,parameters});if(r.status!=='completed')throw Error('Source query failed: '+String(r.error).slice(0,200));return r.data;}
async function assertV132(){
 const r=await api('POST','dataset',native(`SELECT "${LATE_COLUMN}" FROM public.reporting_income_events LIMIT 0`));
 if(r.status!=='completed')throw Error('The reporting source has no V132 late-charge column: apply V132 to PROD first');
}
const writeoffsOf=state=>{const id=state.cards?.writeoffs;if(!Number.isInteger(id))throw Error('statement-cleanup-state.json has no cards.writeoffs: apply R116 (Refine-WriteOffSegregation.mjs) first');return id;};
const plan={snippet:{id:SNIPPET,file:'live-income-period.sql',adds:LATE_COLUMN},model:{id:MODEL,adds_metadata:LATE_COLUMN,sql:'unchanged'},
 question:{name:LATE_SCALAR_NAME,display:'scalar',query:SNIPPET_PREFIX+LATE_SCALAR_SQL,mapping:PARAMETER},
 dashboard:{id:3,tab:TAB,r116_row:'168, 169, cards.writeoffs, 170, 171 at 5/5/5/5/4',row:lateRow('<writeoffs>','<new>').map(([card,title,col,width])=>({card,title,col,width})),note:LATE_NOTE},
 private_dir:priv};

if(args.includes('--plan')){
 console.log(JSON.stringify(plan,null,1));
 if(args.includes('--live')){
  await assertSource();
  const state=read(STATE),d=await api('GET','dashboard/3'),snippet=await api('GET','native-query-snippet/'+SNIPPET),model=await api('GET','card/'+MODEL);
  const tab=d.dashcards.filter(c=>c.dashboard_tab_id===TAB),writeoffs=state.cards?.writeoffs??null;
  let row=null,rowError=null;try{row=r116IncomeRow(d.dashcards,writeoffs,TAB)}catch(e){rowError=e.message}
  let applied=null;try{applied=lateIncomeRow(d.dashcards,writeoffs,state.cards?.latecharges,TAB)}catch{}
  console.log(JSON.stringify({live:{dashboard:3,tab:TAB,tab_dashcards:tab.length,writeoffs_question:writeoffs,
   scalar_row:tab.filter(c=>[...LIVE_ROW_CARDS,writeoffs].includes(c.card_id)).sort((a,b)=>a.col-b.col).map(c=>({card:c.card_id,col:c.col,row:c.row,width:c.size_x,height:c.size_y,title:c.visualization_settings?.['card.title']??null})),
   r116_row_accepted:!!row,r116_row_error:rowError,already_applied:!!applied,
   formula_notes:{before:tab.filter(c=>!c.card_id&&noteText(c)===NOTE_BEFORE).length,after:tab.filter(c=>!c.card_id&&noteText(c)===LATE_NOTE).length},
   snippet_2:snippet.content===snippetFile?'equals live-income-period.sql':snippet.content.includes(LATE_COLUMN)?'has the late-charge column, differs from the file':'before (no late-charge column)',
   model_186_has_column:model.result_metadata.some(c=>c.name===LATE_COLUMN),
   baseline_exists:fs.existsSync(`${priv}/dashboard-3.json`)}},null,1));
 }
}

if(args.includes('--prepare')){
 await assertSource();assert(!fs.existsSync(`${priv}/dashboard-3.json`),'The R118 baseline already exists; it is never overwritten');
 const writeoffs=writeoffsOf(read(STATE)),snippet=await api('GET','native-query-snippet/'+SNIPPET),cards={};
 assert(!snippet.content.includes(LATE_COLUMN),'Snippet 2 already carries the late-charge column');
 for(const id of [MODEL,168,169,170,171,writeoffs])cards[id]=await api('GET','card/'+id);
 // Fail closed: only the R116 five-card row (168, 169, write-offs, 170, 171 at 5/5/5/5/4 on one grid row) is accepted.
 const d=await api('GET','dashboard/3');r116IncomeRow(d.dashcards,writeoffs,TAB);
 assert.equal(d.dashcards.filter(c=>c.dashboard_tab_id===TAB&&!c.card_id&&noteText(c)===NOTE_BEFORE).length,1,'Tab 16 R116 formula note not found');
 save('snippet-2',snippet);save('cards',cards);save('dashboard-3',d);save('permissions',await api('GET','collection/graph'));
 console.log(JSON.stringify({prepared:true,dashcards:d.dashcards.length,tab16:d.dashcards.filter(c=>c.dashboard_tab_id===TAB).length,cards:Object.keys(cards).length}));
}

// Every dashcard outside the edited ones, the tabs and the filters still equal the baseline.
function assertPreserved(live,baseline,writeoffs,latecharges){
 assert.deepEqual(live.tabs,baseline.tabs,'dashboard 3 tabs changed');assert.deepEqual(live.parameters,baseline.parameters,'dashboard 3 filters changed');
 assert.deepEqual(live.dashcards.filter(c=>!edited(c,writeoffs,latecharges)).map(shape).sort(byId),baseline.dashcards.filter(c=>!edited(c,writeoffs,latecharges)).map(shape).sort(byId),'dashboard 3 placements changed outside the R118 edits');
}

if(args.includes('--apply')){
 await assertSource();await assertV132();
 const baseline={snippet:load('snippet-2'),cards:load('cards'),dashboard:load('dashboard-3')},state=read(STATE),writeoffs=writeoffsOf(state);
 assertPreserved(await api('GET','dashboard/3'),baseline.dashboard,writeoffs,state.cards.latecharges);
 const done=[];
 // 1. Snippet 2.
 const snippet=await api('GET','native-query-snippet/'+SNIPPET);
 if(snippet.content!==snippetFile){
  assert.equal(snippet.content,baseline.snippet.content,'Snippet 2 changed since the baseline');
  await api('PUT','native-query-snippet/'+SNIPPET,{content:snippetFile});done.push('snippet');
 }
 // 2. Model 186 metadata (the SQL stays the same pass-through of reporting_income_events).
 const model=await api('GET','card/'+MODEL);assert.equal(sql(model),sql(baseline.cards[MODEL]),'Model 186 SQL changed since the baseline');
 if(!model.result_metadata.some(c=>c.name===LATE_COLUMN)){
  const col=(await dataset(native(sql(model)+' LIMIT 0'))).cols.find(c=>c.name===LATE_COLUMN);assert(col,'Model 186 does not return the late-charge column');
  await api('PUT','card/'+MODEL,{result_metadata:[...model.result_metadata,{name:LATE_COLUMN,display_name:LATE_COLUMN,base_type:col.base_type,effective_type:col.effective_type??col.base_type,
   semantic_type:null,field_ref:['field',LATE_COLUMN,{'base-type':col.base_type}],description:LATE_COLUMN+' (part of Income). '+(model.description??'')}]});done.push('model-metadata');
 }
 // 3. The scalar question, a sibling of question 168 (same collection, description and number format).
 const current={period:[{id:PARAMETER,type:'date/all-options',value:'thismonth',target:['dimension',['template-tag','statement_period']]}]};
 if(!state.cards.latecharges){
  const q168=await api('GET','card/168'),query=incomeQuery(LATE_SCALAR_SQL);
  await dataset(query,current.period.map(({id,...p})=>p));
  const visualization=JSON.parse(JSON.stringify(q168.visualization_settings).replaceAll('Operating Income',LATE_COLUMN));
  const c=await api('POST','card',{name:LATE_SCALAR_NAME,type:'question',display:'scalar',collection_id:q168.collection_id,description:q168.description,dataset_query:query,visualization_settings:visualization});
  state.cards.latecharges=c.id;write(STATE,state);done.push('question');
 }
 // 4. Dashboard 3 tab 16.
 const d=await api('GET','dashboard/3'),latecharges=state.cards.latecharges,line=r116IncomeRow(baseline.dashboard.dashcards,writeoffs,TAB);
 if(!d.dashcards.some(c=>c.dashboard_tab_id===TAB&&c.card_id===latecharges)){
  r116IncomeRow(d.dashcards,writeoffs,TAB);
  const layout=new Map(lateRow(writeoffs,latecharges).map(([id,title,col,width])=>[id,{title,col,width}]));
  const cards=d.dashcards.map(c=>{
   if(c.dashboard_tab_id!==TAB)return c;
   if([...LIVE_ROW_CARDS,writeoffs].includes(c.card_id))return {...c,col:layout.get(c.card_id).col,size_x:layout.get(c.card_id).width};
   if(!c.card_id&&noteText(c)===NOTE_BEFORE)return {...c,visualization_settings:{...c.visualization_settings,virtual_card:{...c.visualization_settings.virtual_card,visualization_settings:{...c.visualization_settings.virtual_card.visualization_settings,text:LATE_NOTE}}}};
   return c;
  });
  const {col,width,title}=layout.get(latecharges);
  cards.push({id:-1,card_id:latecharges,dashboard_tab_id:TAB,col,row:line.row,size_x:width,size_y:line.height,series:[],
   parameter_mappings:[{parameter_id:PARAMETER,card_id:latecharges,target:['dimension',['template-tag','statement_period']]}],visualization_settings:{'card.title':title}});
  await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});done.push('dashboard');
 }
 const after=await api('GET','dashboard/3');assertPreserved(after,baseline.dashboard,writeoffs,latecharges);
 lateIncomeRow(after.dashcards,writeoffs,latecharges,TAB,line);
 // The five R116 cards keep their mappings, settings and placement; only col and size_x moved.
 assertLateRowCardsKept(baseline.dashboard.dashcards,after.dashcards,writeoffs,TAB);
 write('statement-cleanup/late-charges.json',{date:new Date().toISOString().slice(0,10),release:'R118',migration:'V132',dashboard_id:3,tab_id:TAB,question_id:latecharges,
  writeoffs_question:writeoffs,snippet_id:SNIPPET,model_id:MODEL,model_sql_unchanged:true,steps:done,other_placements_unchanged:true,filters_unchanged:true,
  rollback:'Private r118-late-charges baseline (snippet 2, cards 168-171/186/write-offs, dashboard 3, permissions); archive the new question'});
 console.log(JSON.stringify({applied:done,question:latecharges,next:['ProposedLoanReports.mjs --rebaseline-dashboard3=R118','ProposedLoanReports.mjs --refine --only=income.latecharges,income','ProposedLoanReports.mjs --verify','Refine-LateCharges.mjs --verify']}));
}

if(args.includes('--verify')){
 await assertSource();await assertV132();
 const baseline={cards:load('cards'),dashboard:load('dashboard-3'),permissions:load('permissions')},state=read(STATE),writeoffs=writeoffsOf(state),latecharges=state.cards.latecharges,checks=[];
 const check=(name,ok)=>{if(!ok)throw Error(name+' failed');checks.push({check:name,passed:true});};
 const near=(a,b)=>a==null||b==null?a==null&&b==null:Math.abs(Number(a)-Number(b))<1e-7;
 assert(latecharges,'Run --apply first');
 const d=await api('GET','dashboard/3');
 check('Other placements, tabs and filters of dashboard 3 unchanged',(assertPreserved(d,baseline.dashboard,writeoffs,latecharges),true));
 check('Tab 16 row: the R116 five cards and Late charges received at width 4 on the R116 grid row',(lateIncomeRow(d.dashcards,writeoffs,latecharges,TAB,r116IncomeRow(baseline.dashboard.dashcards,writeoffs,TAB)),true));
 check('Formula note names late charges',d.dashcards.some(c=>c.dashboard_tab_id===TAB&&!c.card_id&&noteText(c)===LATE_NOTE));
 check('The R116 row cards keep their mappings, settings and placement; only col and width moved',(assertLateRowCardsKept(baseline.dashboard.dashcards,d.dashcards,writeoffs,TAB),true));
 const placed=d.dashcards.find(c=>c.dashboard_tab_id===TAB&&c.card_id===latecharges);
 check('Late-charge question follows the Statement period filter',JSON.stringify(placed.parameter_mappings.map(m=>[m.parameter_id,m.target]))===JSON.stringify([[PARAMETER,['dimension',['template-tag','statement_period']]]]));
 check('Snippet 2 equals live-income-period.sql',(await api('GET','native-query-snippet/'+SNIPPET)).content===snippetFile);
 const model=await api('GET','card/'+MODEL);
 check('Model 186 SQL unchanged; metadata gains only the late-charge column',sql(model)===sql(baseline.cards[MODEL])&&JSON.stringify(model.result_metadata.map(c=>c.name))===JSON.stringify([...baseline.cards[MODEL].result_metadata.map(c=>c.name),LATE_COLUMN]));
 check('Late-charge question reads the shared snippet',sql(await api('GET','card/'+latecharges))===SNIPPET_PREFIX+LATE_SCALAR_SQL);
 for(const id of [168,169,170,171,writeoffs])check(`Question ${id} unchanged`,sql(await api('GET','card/'+id))===sql(baseline.cards[id]));
 check('Partner-only collection permissions unchanged',JSON.stringify(await api('GET','collection/graph'))===JSON.stringify(baseline.permissions));
 const dashcard=id=>d.dashcards.find(c=>c.dashboard_tab_id===TAB&&c.card_id===id);
 const card=async(id,value)=>{const c=dashcard(id),parameters=value?[{id:PARAMETER,type:'date/all-options',value,target:['dimension',['template-tag','statement_period']]}]:[];
  const r=await api('POST',`dashboard/3/dashcard/${c.id}/card/${id}/query`,{parameters});if(r.status!=='completed')throw Error('Income card failed '+id);return r.data.rows;};
 const calendar={p:{id:'r118-period',name:'p','display-name':'Period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'}};
 const range=async value=>(await dataset(native('SELECT min(d."Date")::text,max(d."Date")::text,count(*)::int FROM public.reporting_statement_calendar d WHERE true [[AND {{p}}]]',calendar),value?[{type:'date/all-options',value,target:['dimension',['template-tag','p']]}]:[])).rows[0];
 const today=(await dataset(native(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text`))).rows[0][0];
 const periods=[['this month','thismonth'],['previous month','lastmonth'],['past 30 days','past30days'],['past 90 days','past90days'],['this year','thisyear'],['single day',`${today}~${today}`],['empty past','2000-01-01~2000-01-02'],['all dates',null]];
 for(const [label,value] of periods){
  const [starts,ends,days]=await range(value);
  let gross=null,late=null;
  if(days>0){
   // A principal write-off (public.is_principal_writeoff, as R116 verifies it) carries no income, interest or late charge.
   [gross,late]=(await dataset(native(`WITH rows AS (SELECT r."Interest Paid"::numeric AS interest,r."Late Charge Paid"::numeric AS late,public.is_principal_writeoff(r."Row ID",r."Ref Payment",r."Principal Paid"::numeric,r."Interest Paid"::numeric,r."Ref Charges",c."Principal Due"::numeric,c."Interest Due"::numeric,CASE WHEN r."Ref Payment" IS NULL AND r."Principal Paid"::numeric>0 AND r."Interest Paid"::numeric=-r."Principal Paid"::numeric THEN (SELECT count(*) FROM public.olap_repayments_analytics n WHERE n."Ref Charges"=r."Ref Charges") END) AS writeoff FROM public.olap_repayments_analytics r LEFT JOIN public.olap_charges_analytics c ON c."Row ID"=r."Ref Charges" WHERE r."Payment Date" BETWEEN DATE '${starts}' AND DATE '${ends}') SELECT coalesce(sum(interest+late) FILTER(WHERE NOT writeoff),0),coalesce(sum(late) FILTER(WHERE NOT writeoff),0) FROM rows`))).rows[0].map(Number);
  }
  check(label+' late charges received',near((await card(latecharges,value))[0][0],late));
  check(label+' gross profit counts interest and late charges',near((await card(168,value))[0][0],gross));
 }
 const source=await dataset(native('SELECT "Late Charges Received MTD" FROM public.reporting_income_statement'));
 check('Current month matches reporting_income_statement late charges received',near((await card(latecharges,'thismonth'))[0][0],source.rows[0][0]));
 write('statement-cleanup/late-charges-verification.json',{verified_at:new Date().toISOString(),release:'R118',checks,check_count:checks.length,periods:periods.map(p=>p[0]),
  statement_source:'Independent SQL on olap_repayments_analytics; current-month parity with reporting_income_statement',financial_values_published:false});
 console.log(`${checks.length} late-charge source, period, parity and preservation checks passed.`);
}
