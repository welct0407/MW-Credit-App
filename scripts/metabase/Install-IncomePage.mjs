import fs from 'node:fs';import assert from 'node:assert/strict';
import {api,assertSource,read,write,privateDir,root} from './ReportingApi.mjs';
await assertSource();
const baseline=JSON.parse(fs.readFileSync(privateDir+'/income-before/dashboard.json'));
const questions=read('income-questions.json');let state;try{state=read('income-state.json');}catch{state={cards:{}};}
const models=read('models.json'),snippetName='Income statement period',tags={};
const content=fs.readFileSync(root+'/scripts/metabase/income-period-snippet.sql','utf8').replace(/\{\{model:([^}]+)\}\}/g,(_,key)=>{const m=models[key],tag='#'+m.id;tags[tag]={id:'r016-model-'+m.id,name:tag,'display-name':m.name,type:'card','card-id':m.id};return '{{'+tag+'}}';});
const found=(await api('GET','native-query-snippet')).find(s=>s.name===snippetName);
const snippet=await api(found?'PUT':'POST',found?'native-query-snippet/'+found.id:'native-query-snippet',{name:snippetName,content,description:'Shared selected-period statement; partner draws consume earlier net profit first under the existing immutable FIFO function. No financial writes.'});
state.snippet_id=snippet.id;write('income-state.json',state);
const tagName='snippet: '+snippetName;tags[tagName]={id:'r016-income-snippet',name:tagName,'display-name':snippetName,type:'snippet','snippet-name':snippetName,'snippet-id':snippet.id};
tags.statement_period={id:'r016-statement-period',name:'statement_period','display-name':'Statement period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'};
for(const q of questions){const id=state.cards[q.key];const select=q.native_select?.replace(/\{\{model:([^}]+)\}\}/g,(_,key)=>{const m=models[key],tag='#'+m.id;tags[tag]={id:'r016-model-'+m.id,name:tag,'display-name':m.name,type:'card','card-id':m.id};return '{{'+tag+'}}';});const query=select?{database:2,type:'native',native:{query:`WITH statement AS ({{${tagName}}}) ${select}`,'template-tags':tags}}:q.dataset_query;const c=await api(id?'PUT':'POST',id?'card/'+id:'card',{name:q.name,description:q.description,collection_id:5,type:'question',display:q.display,dataset_query:query,visualization_settings:q.settings});state.cards[q.key]=c.id;write('income-state.json',state);const r=await api('POST',`card/${c.id}/query`,{});if(r.status!=='completed'){fs.writeFileSync(privateDir+'/income-query-error.json',JSON.stringify(r));throw Error('Income question failed '+q.key);}console.log('Verified '+q.key);}
let d=await api('GET','dashboard/3');const name='9 · Income Statement';let tab=d.tabs.find(t=>t.name===name);
if(!tab){await api('PUT','dashboard/3/cards',{tabs:[...d.tabs,{id:-1,name,position:d.tabs.length}],cards:d.dashcards});d=await api('GET','dashboard/3');tab=d.tabs.find(t=>t.name===name);}
assert.ok(tab);state.tab_id=tab.id;write('income-state.json',state);
const keep=d.dashcards.filter(c=>c.dashboard_tab_id!==tab.id),cards=[...keep];let next=-1;
function note(row,text,height=1){cards.push({id:d.dashcards.find(c=>c.dashboard_tab_id===tab.id&&!c.card_id&&c.visualization_settings?.virtual_card?.visualization_settings?.text===text)?.id??next--,card_id:null,dashboard_tab_id:tab.id,col:0,row,size_x:24,size_y:height,series:[],parameter_mappings:[],visualization_settings:{'card.background':false,virtual_card:{display:height===1?'heading':'text',visualization_settings:{text}}}});}
function place(key,col,row,w,h){const id=state.cards[key],q=questions.find(q=>q.key===key),parameter_mappings=[];if(q.native_select)parameter_mappings.push({parameter_id:'income-period',card_id:id,target:['dimension',['template-tag','statement_period']]});if(q.date_field)parameter_mappings.push({parameter_id:'income-period',card_id:id,target:['dimension',['field',q.date_field,{'base-type':'type/Date'}]]});cards.push({id:d.dashcards.find(c=>c.dashboard_tab_id===tab.id&&c.card_id===id)?.id??next--,card_id:id,dashboard_tab_id:tab.id,col,row,size_x:w,size_y:h,series:[],parameter_mappings,visualization_settings:{}});}
note(0,'Income statement · selected period · THB');
['income','expenses','profit','margin','tommy','lisa'].forEach((k,i)=>place(k,(i%3)*8,1+Math.floor(i/3)*2,8,2));
note(5,'1 · From earnings to profit retained');place('bridge',0,6,24,5);
note(11,'Daily average uses calendar days, including zero-income days. Partner draws consume earlier profit first; the waterfall total is selected-period unsettled profit.',2);
note(13,'2 · From retained profit to cash held');['retained','cash-pool','cash-held'].forEach((k,i)=>place(k,i*8,14,8,2));
place('cash-bridge',0,16,24,6);
note(22,'Cash is measured at the selected period end. The bridge includes earlier retained profit, advances and any reconciliation difference; the difference is not extra income.',2);
place('holders',0,24,12,6);place('accounts',12,24,12,6);place('period',0,30,24,3);
note(33,'3 · Expense breakdown');place('expense-category',0,34,24,5);
note(39,'Cash before account openings is unavailable. Later corrections restate historical balances. Use a continuous period; on narrow phones, use presets or landscape for custom dates.',2);
await api('PUT','dashboard/3',{parameters:[...d.parameters.filter(p=>p.id!=='income-period'),{id:'income-period',name:'Statement period',slug:'statement_period',type:'date/all-options',sectionId:'date',default:'thismonth'}]});
await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});d=await api('GET','dashboard/3');
const project=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
assert.deepEqual(d.dashcards.filter(c=>c.dashboard_tab_id!==tab.id).map(project).sort((a,b)=>a.id-b.id),baseline.dashcards.map(project).sort((a,b)=>a.id-b.id));
assert.deepEqual(d.parameters.filter(p=>p.id!=='income-period'),baseline.parameters);assert.equal(d.tabs.length,9);assert.equal(d.dashcards.filter(c=>c.card_id&&c.dashboard_tab_id===tab.id).length,questions.length);
write('income-dashboard.json',{saved_at:new Date().toISOString(),url:'https://reports.mw-credit.com/dashboard/3?tab='+tab.id,dashboard_id:3,tab_id:tab.id,questions:questions.length,total_visuals:d.dashcards.filter(c=>c.card_id).length,prior_eight_pages_unchanged:true});
console.log('Income Statement saved; previous eight pages and filters preserved.');
