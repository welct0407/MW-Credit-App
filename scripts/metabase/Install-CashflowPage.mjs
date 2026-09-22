import fs from 'node:fs';import assert from 'node:assert/strict';
import {api,assertSource,read,write,privateDir,root} from './ReportingApi.mjs';
import {definitions,specs} from './CashflowPage.mjs';
await assertSource();
const baseline=JSON.parse(fs.readFileSync(privateDir+'/cashflow-before/dashboard-3.json'));
if(!fs.existsSync(root+'/outputs/r016-20260922/cashflow-production.json'))throw Error('PROD verification required');
const models=read('models.json');let state;try{state=read('cashflow-state.json');}catch{state={cards:{}};}
for(const [key,name,grain,description] of definitions){
 const query=fs.readFileSync(root+'/scripts/metabase/models/'+key+'.sql','utf8').trim(),id=models[key]?.id;
 const c=await api(id?'PUT':'POST',id?'card/'+id:'card',{name,description,type:'model',display:'table',collection_id:8,visualization_settings:{},dataset_query:{database:2,type:'native',native:{query}}});
 const r=await api('POST',`card/${c.id}/query`,{});assert.equal(r.status,'completed');
 const index=r.data.cols.findIndex(c=>c.name===grain);assert.equal(new Set(r.data.rows.map(row=>row[index])).size,r.data.rows.length);
 const columns=r.data.cols.map(c=>({...c,semantic_type:c.name===grain?'type/PK':c.base_type==='type/Text'?'type/Category':c.semantic_type,description:c.name==='Scope ID'?'Select exactly one scope; __ALL__ consolidates internal transfers.':c.name==='Balance After'||/Balance/.test(c.name)?'Signed net cash; unavailable before the known opening. Later corrections restate history.':`${c.name}. ${description}`}));
 await api('PUT','card/'+c.id,{result_metadata:columns});models[key]={id:c.id,name,collection_id:8,grain:description,grain_field:grain,database_view:query.replace('SELECT * FROM ',''),columns:columns.map(({name,base_type,semantic_type,description})=>({name,base_type,semantic_type,description})),rows:r.row_count};write('models.json',models);
}
const tags={},expand=sql=>sql.replace(/\{\{model:([^}]+)\}\}/g,(_,key)=>{const m=models[key],tag='#'+m.id;tags[tag]={id:'r016-model-'+m.id,name:tag,'display-name':m.name,type:'card','card-id':m.id};return '{{'+tag+'}}';});
const snippetName='Cashflow statement period',content=expand(fs.readFileSync(root+'/scripts/metabase/cashflow-period-snippet.sql','utf8'));
const old=(await api('GET','native-query-snippet')).find(s=>s.name===snippetName);
const snippet=await api(old?'PUT':'POST',old?'native-query-snippet/'+old.id:'native-query-snippet',{name:snippetName,content,description:'Date/account selection and simple sums over governed full-history cashflow views. No financial writes.'});
const tag='snippet: '+snippetName;tags[tag]={id:'r016-cashflow-snippet',name:tag,'display-name':snippetName,type:'snippet','snippet-name':snippetName,'snippet-id':snippet.id};
tags.cashflow_period={id:'r016-cashflow-period',name:'cashflow_period','display-name':'Statement period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'};
tags.cash_account={id:'r016-cash-account',name:'cash_account','display-name':'Account',type:'text',required:true,default:'__ALL__'};
state.snippet_id=snippet.id;
for(const q of specs){
 const query=`WITH statement AS ({{${tag}}}) ${expand(q.sql)}`;
 const numbers=q.metric?[q.metric]:['Transaction Amount','Money In','Money Out','Balance After'];
 const settings={column_settings:Object.fromEntries(numbers.map(n=>[JSON.stringify(['name',n]),{number_style:q.metric?'currency':'decimal',currency:'THB',currency_style:'symbol',decimals:0,number_separators:'.,',compact:false}])),...(q.metric?{'scalar.field':['opening','closing'].includes(q.key)?'Balance Display':q.metric,'scalar.segments':[{min:-1e18,max:1e18,color:q.color}]}:{'table.pivot':false})};
 const id=state.cards[q.key];const c=await api(id?'PUT':'POST',id?'card/'+id:'card',{name:q.name,description:'Live selected-period cash statement. All accounts excludes internal transfers from money in/out; individual accounts retain their transfer side. Amounts in THB.',type:'question',collection_id:5,display:q.display,visualization_settings:settings,dataset_query:{database:2,type:'native',native:{query,'template-tags':tags}}});
 state.cards[q.key]=c.id;write('cashflow-state.json',state);
 const result=await api('POST',`card/${c.id}/query`,{});assert.equal(result.status,'completed');console.log('Saved cashflow '+q.key);
}
// Account choices use IDs, not ambiguous display labels.
const lookupKey='accounts',lookupId=state.cards[lookupKey];
const lookup=await api(lookupId?'PUT':'POST',lookupId?'card/'+lookupId:'card',{name:'Cashflow account choices',type:'question',display:'table',collection_id:8,dataset_query:{database:2,type:'native',native:{query:expand('SELECT DISTINCT "Scope ID","Account" FROM {{model:cashflow-daily}} ORDER BY "Scope ID"'),'template-tags':tags}},visualization_settings:{}});
state.cards[lookupKey]=lookup.id;
let d=await api('GET','dashboard/3'),tab=d.tabs.find(t=>t.name==='10 · Cashflow Statement');
if(!tab){await api('PUT','dashboard/3/cards',{tabs:[...d.tabs,{id:-1,name:'10 · Cashflow Statement',position:d.tabs.length}],cards:d.dashcards});d=await api('GET','dashboard/3');tab=d.tabs.find(t=>t.name==='10 · Cashflow Statement');}
state.tab_id=tab.id;write('cashflow-state.json',state);
const cards=d.dashcards.filter(c=>c.dashboard_tab_id!==tab.id);let next=-1;
function note(row,text,height=1){cards.push({id:next--,card_id:null,dashboard_tab_id:tab.id,col:0,row,size_x:24,size_y:height,series:[],parameter_mappings:[],visualization_settings:{'card.background':false,virtual_card:{display:height===1?'heading':'text',visualization_settings:{text}}}});}
function place(key,col,row,w,h){const id=state.cards[key];cards.push({id:d.dashcards.find(c=>c.dashboard_tab_id===tab.id&&c.card_id===id)?.id??next--,card_id:id,dashboard_tab_id:tab.id,col,row,size_x:w,size_y:h,series:[],parameter_mappings:[{parameter_id:'cashflow-period',card_id:id,target:['dimension',['template-tag','cashflow_period']]},{parameter_id:'cashflow-account',card_id:id,target:['variable',['template-tag','cash_account']]}],visualization_settings:{}});}
note(0,'Cashflow statement · selected period · THB');
['in','out','net'].forEach((key,i)=>place(key,i*8,1,8,2));
note(3,'All accounts: internal transfers stay in the ledger but add no inflow or outflow.',2);
place('period',0,5,24,4);place('opening',0,9,24,2);
place('transactions',0,11,24,12);place('closing',0,23,24,2);
note(25,'Opening + inflows − outflows = closing. Earlier balances may be unavailable.',2);
const F=n=>['field',n,{'base-type':'type/Text'}];
await api('PUT','dashboard/3',{parameters:[...d.parameters.filter(p=>!['cashflow-period','cashflow-account'].includes(p.id)),{id:'cashflow-period',name:'Cashflow period',slug:'cashflow_period',type:'date/all-options',sectionId:'date',default:'thismonth'},{id:'cashflow-account',name:'Account',slug:'cashflow_account',type:'string/=',sectionId:'string',isMultiSelect:false,default:['__ALL__'],values_query_type:'list',values_source_type:'card',values_source_config:{card_id:lookup.id,value_field:F('Scope ID'),label_field:F('Account')}}]});
await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});d=await api('GET','dashboard/3');
const project=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
assert.deepEqual(d.dashcards.filter(c=>c.dashboard_tab_id!==tab.id).map(project).sort((a,b)=>a.id-b.id),baseline.dashcards.map(project).sort((a,b)=>a.id-b.id));
assert.deepEqual(d.parameters.filter(p=>!['cashflow-period','cashflow-account'].includes(p.id)),baseline.parameters);
console.log('Cashflow page saved; all previous nine pages and filters preserved.');
