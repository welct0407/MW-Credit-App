import fs from 'node:fs';
import {api,assertSource,read,write,privateDir} from './ReportingApi.mjs';
await assertSource();
if(!fs.existsSync(privateDir+'/remaining-pages-before/dashboard.json'))throw Error('Missing rollback export');
const models=read('models.json'),questions=read('remaining-questions.json');
let state;try{state=read('remaining-install-state.json');}catch{state={cards:{}};}
const save=()=>write('remaining-install-state.json',state);
for(const q of (process.argv.includes('--layout-only')?[]:questions)){
 const body={name:q.name,description:q.description,collection_id:5,type:'question',display:q.display,dataset_query:q.dataset_query,visualization_settings:q.settings};
 const id=state.cards[q.key]?.id, card=await api(id?'PUT':'POST',id?'card/'+id:'card',body);state.cards[q.key]={id:card.id,page:q.page};save();
 const result=await api('POST',`card/${card.id}/query`,{});
 if(result.status!=='completed'){fs.writeFileSync(privateDir+'/remaining-question-error.json',JSON.stringify(result));throw Error('Question failed '+q.key);}
 state.cards[q.key].rows=result.row_count;save();console.log(`Verified ${q.key}`);
}
const F=(name,t='type/Text')=>['field',name,{'base-type':t}];
// A single reusable snippet holds the parameterized scenario. Models cannot contain variables.
const snippetName='Borrower loan scenario';
const content=`SELECT b."Borrower ID",b."Borrower",b."Outstanding Principal" AS "Current Exposure",
 b."Outstanding Principal"+{{proposed_amount}} AS "Proposed Exposure",
 b."Portfolio Outstanding Principal" AS "Current Portfolio",
 b."Portfolio Outstanding Principal"+{{proposed_amount}} AS "Proposed Portfolio"
 FROM {{#${models.borrowers.id}}} b
 WHERE (false [[OR b."Borrower ID"={{borrower_id}}]]) AND {{proposed_amount}}>=0`;
const snippets=await api('GET','native-query-snippet'),found=snippets.find(s=>s.name===snippetName);
const snippet=await api(found?'PUT':'POST',found?'native-query-snippet/'+found.id:'native-query-snippet',{name:snippetName,content,description:'Shared read-only proposed-loan scenario. No financial record is written. Blank borrower returns no scenario; negative amounts are excluded.'});
state.snippet_id=snippet.id;save();
const snippetTag='snippet: '+snippetName,modelTag='#'+models.borrowers.id;
const tags={
 [snippetTag]:{id:'r016-scenario-snippet',name:snippetTag,'display-name':snippetName,type:'snippet','snippet-name':snippetName,'snippet-id':snippet.id},
 [modelTag]:{id:'r016-scenario-model',name:modelTag,'display-name':'Borrowers',type:'card','card-id':models.borrowers.id},
 borrower_id:{id:'r016-scenario-borrower',name:'borrower_id','display-name':'Borrower',type:'text'},
 proposed_amount:{id:'r016-scenario-amount',name:'proposed_amount','display-name':'Proposed loan amount',type:'number',default:0,required:true}
};
const scenario=[
 {key:'i-exposure',name:'Current and proposed exposure · THB',display:'bar',sql:'SELECT "Borrower","Current Exposure","Proposed Exposure" FROM scenario',settings:{'graph.dimensions':['Borrower'],'graph.metrics':['Current Exposure','Proposed Exposure'],'graph.colors':['#178F8A','#7472BE'],'graph.show_legend':true}},
 {key:'i-current-share',name:'Current portfolio share',display:'pie',sql:`SELECT 'Selected borrower' AS "Share", "Current Exposure" AS "Principal" FROM scenario UNION ALL SELECT 'Other borrowers',"Current Portfolio"-"Current Exposure" FROM scenario`,settings:{'pie.dimension':'Share','pie.metric':'Principal','pie.show_legend':true,'pie.show_total':false}},
 {key:'i-proposed-share',name:'Proposed portfolio share',display:'pie',sql:`SELECT 'Selected borrower' AS "Share", "Proposed Exposure" AS "Principal" FROM scenario WHERE "Proposed Exposure">"Current Exposure" UNION ALL SELECT 'Other borrowers',"Proposed Portfolio"-"Proposed Exposure" FROM scenario WHERE "Proposed Exposure">"Current Exposure"`,settings:{'pie.dimension':'Share','pie.metric':'Principal','pie.show_legend':true,'pie.show_total':false}}
];
for(const q of scenario){const body={name:q.name,description:'Uses the shared Borrower loan scenario snippet and Borrowers model. Select one borrower; proposed amount must be nonnegative. Proposed share appears for an amount above zero.',collection_id:5,type:'question',display:q.display,visualization_settings:q.settings,dataset_query:{database:2,type:'native',native:{query:`WITH scenario AS ({{${snippetTag}}}) ${q.sql}`,'template-tags':tags}}};const id=state.cards[q.key]?.id,card=await api(id?'PUT':'POST',id?'card/'+id:'card',body);state.cards[q.key]={id:card.id,page:7,scenario:true};save();const result=await api('POST',`card/${card.id}/query`,{});if(result.status!=='completed'){fs.writeFileSync(privateDir+'/remaining-scenario-error.json',JSON.stringify(result));throw Error('Scenario failed '+q.key);}questions.push({...q,page:7,scenario:true});}
const lookupBody={name:'Borrower selector',description:'Immutable borrower keys with readable labels for dashboard selection.',type:'question',display:'table',collection_id:8,visualization_settings:{},dataset_query:{database:2,type:'query',query:{'source-table':'card__'+models.borrowers.id,fields:[F('Borrower ID'),F('Borrower')],'order-by':[['asc',F('Borrower')]]}}};
const lookup=await api(state.borrower_selector_id?'PUT':'POST',state.borrower_selector_id?'card/'+state.borrower_selector_id:'card',lookupBody);state.borrower_selector_id=lookup.id;save();
let dashboard=await api('GET','dashboard/3');
const names=['3 · Borrowers','4 · Performance','5 · Risks','6 · Daily Collection','7 · Borrower Insight','8 · Forecast & Partners'];
let temporary=-1;const tabs=[...dashboard.tabs];for(const name of names)if(!tabs.some(t=>t.name===name))tabs.push({id:temporary--,name,position:tabs.length});
await api('PUT','dashboard/3/cards',{tabs,cards:dashboard.dashcards});dashboard=await api('GET','dashboard/3');
if(dashboard.tabs.length<8)throw Error('Remaining tabs were not saved');
const parameters=[...dashboard.parameters.filter(p=>!['performance-date','insight-borrower','proposed-amount'].includes(p.id)),
 {id:'performance-date',name:'Performance date',slug:'performance_date',type:'date/all-options',sectionId:'date'},
 {id:'insight-borrower',name:'Borrower',slug:'borrower',type:'string/=',sectionId:'string',isMultiSelect:false,values_query_type:'list',values_source_type:'card',values_source_config:{card_id:lookup.id,value_field:F('Borrower ID'),label_field:F('Borrower')}},
 {id:'proposed-amount',name:'Proposed loan · THB',slug:'proposed_amount',type:'number/=',sectionId:'number',default:[0],isMultiSelect:false}];
const newTabs=dashboard.tabs.filter(t=>names.includes(t.name));
const placements=dashboard.dashcards.filter(c=>!newTabs.some(t=>t.id===c.dashboard_tab_id)).map(c=>({id:c.id,card_id:c.card_id,dashboard_tab_id:c.dashboard_tab_id,col:c.col,row:c.row,size_x:c.size_x,size_y:c.size_y,series:c.series.map(s=>({id:s.id})),parameter_mappings:c.parameter_mappings,visualization_settings:c.visualization_settings}));
let next=-1;
function text(tab,row,text,height=1){placements.push({id:dashboard.dashcards.find(c=>c.dashboard_tab_id===tab&&!c.card_id&&c.visualization_settings?.virtual_card?.visualization_settings?.text===text)?.id??next--,card_id:null,dashboard_tab_id:tab,col:0,row,size_x:24,size_y:height,series:[],parameter_mappings:[],visualization_settings:{virtual_card:{display:height===1?'heading':'text',visualization_settings:{text}},'card.background':false}});}
function place(key,tab,col,row,w,h){const q=questions.find(x=>x.key===key);if(!q)throw Error('Unknown placement '+key);const id=state.cards[key].id,mappings=[];
 if(q.date_field)mappings.push({parameter_id:'performance-date',card_id:id,target:['dimension',F(q.date_field,'type/Date')]});
 if(q.borrower_field)mappings.push({parameter_id:'insight-borrower',card_id:id,target:['dimension',F(q.borrower_field)]});
 if(q.scenario)mappings.push({parameter_id:'insight-borrower',card_id:id,target:['variable',['template-tag','borrower_id']]},{parameter_id:'proposed-amount',card_id:id,target:['variable',['template-tag','proposed_amount']]});
 placements.push({id:dashboard.dashcards.find(c=>c.dashboard_tab_id===tab&&c.card_id===id)?.id??next--,card_id:id,dashboard_tab_id:tab,col,row,size_x:w,size_y:h,series:[],visualization_settings:{},parameter_mappings:mappings});}
const layouts={
 3:[['Borrower portfolio · THB',['b-active','b-principal','b-top','b-interest']],['Capital & earnings concentration',['b-share-principal','b-share-profit','b-rank-principal','b-rank-profit']],['Returns & lending history',['b-return','b-coverage','b-lifetime','b-loans','b-contribution']],['Value & reliability',['b-stability','b-capital-profit','b-matrix-detail']]],
 4:[['Lending performance · gross interest',['p-interest','p-growth','p-count','p-principal']],['Profit & lending activity',['p-daily','p-cumulative','p-issued','p-issued-count','p-yield','p-type-profit','p-average']],['Portfolio activity & period detail',['p-active-loans','p-active-borrowers','p-period']]],
 5:[['Risk at a glance',['r-principal','r-interest','r-top3','r-past-due']],['Concentration & loan ageing',['r-borrowers','r-status','r-age-count','r-age-principal']],['Borrower risk & loss history',['r-matrix','r-default','r-monitor']]],
 6:[['Collection status · Bangkok today',['c-due-count','c-paid-count','c-partial-count','c-unpaid-count','c-due','c-collected','c-remaining','c-rate']],...['paid','partial','unpaid','overdue'].map((s,i)=>[['Fully paid','Partially paid','Not paid','Overdue'][i],['c-'+s+'-borrowers','c-'+s+'-amount','c-'+s+'-detail']])],
 7:[['Borrower position · select a borrower above',['i-principal','i-active','i-overdue','i-interest']],['Proposed loan scenario · no transaction is saved',['i-exposure','i-current-share','i-proposed-share']],['Payment behaviour & loan history',['i-timing','i-loans']],['Credit history & risk',['i-assessment','i-risk']]],
 8:[['This month’s forecast · gross interest, THB',['f-realized','f-remaining','f-estimate','f-realization']],['Forecast composition',['f-progress','f-type','f-daily-borrower','f-month-borrower']],['Partner outlook & borrower detail',['f-partner','f-detail','f-interest-trend']]]
};
const notes={3:'Returns use the governed borrower measures. Bubble size shows outstanding principal; the stability benchmark is 80 and the scaled contribution benchmark is 0.5. All amounts are THB.',4:'Profit is gross interest. Daily yield = interest ÷ (closing principal + principal returned). Cumulative interest starts at the first stored snapshot. The date filter selects activity dates; 7-day growth always uses the current fixed reporting windows.',5:'Past due means a positive remaining charge balance dated before today. The risk scatter excludes the largest exposure, which remains visible in the concentration chart. Loan-age charts cover active loans.',6:'Worklists use each borrower’s current governed collection status. Receipts today are posted principal plus interest; they can include payment of older charges. Due, collected and remaining use the existing collection measures.',7:'**Balance history unavailable:** the source has no borrower-level daily balance snapshots. Loan issue dates and current balances cannot provide that history.\n\nSelect one borrower for insight. The proposed-share chart appears when the proposed amount is above zero. Negative amounts return no scenario. Monthly timing preserves the source classification: Historical Late true = Late; other charges = On time.',8:'Portfolio estimates and loan-level expected interest use different governed forecast measures; the borrower/type breakdown is not a reconciliation of the portfolio estimate. Partner shares are current pool shares, not historical settlement allocations.'};
for(const tab of newTabs){const page=Number(tab.name[0]);let row=0;for(const [title,keys]of layouts[page]){text(tab.id,row++,title);let col=0,lineHeight=0;for(const key of keys){const q=questions.find(x=>x.key===key),scalar=q.display==='scalar',wide=q.display==='table'||key==='b-contribution'||key==='i-exposure';const w=scalar?(keys.length===3?12:6):wide?24:12,h=scalar?2:q.display==='table'?7:6;if(col+w>24){row+=lineHeight;col=0;lineHeight=0;}place(key,tab.id,col,row,w,h);col+=w;lineHeight=Math.max(lineHeight,h);if(col===24){row+=lineHeight;col=0;lineHeight=0;}}if(col)row+=lineHeight;}text(tab.id,row,notes[page],page===7?10:5);}
await api('PUT','dashboard/3',{name:'Loan Reports',parameters});
await api('PUT','dashboard/3/cards',{cards:placements,tabs:dashboard.tabs});
const saved=await api('GET','dashboard/3');
if(saved.tabs.length<8||saved.dashcards.filter(c=>c.card_id&&saved.tabs.filter(t=>Number(t.name[0])<=8).some(t=>t.id===c.dashboard_tab_id)).length!==109)throw Error('Saved dashboard coverage mismatch');
write('remaining-dashboard-verification.json',{saved_at:new Date().toISOString(),dashboard_id:3,url:'https://reports.mw-credit.com/dashboard/3',tabs:saved.tabs,questions:questions.length,placements:saved.dashcards.filter(c=>c.card_id).length,cards:state.cards,scenario_snippet:snippet.id,source_page_7_history:'explicitly unavailable; no database change requested'});
console.log('Saved all eight report tabs, preserving first two pages.');
