import './LegacyStatementGuard.mjs';
import {api,assertSource,read,write} from './ReportingApi.mjs';
await assertSource();
const questions=read('model-questions.json'), cards={};
for(const q of questions){
 const card=await api('PUT','card/'+q.id,{name:q.name,description:q.description,display:q.display,visualization_settings:q.settings,dataset_query:q.dataset_query});
 const result=await api('POST',`card/${q.id}/query`,{});
 if(result.status!=='completed')throw Error('Failed question '+q.key);
 cards[q.key]={id:card.id,name:card.name,rows:result.row_count,date_field:q.date_field,model:q.model};
 console.log(`Verified ${q.key}: ${result.row_count} rows, ${result.data.cols.length} columns`);
}
const dashboard=await api('GET','dashboard/3'), placements=dashboard.dashcards.filter(c=>![4,5].includes(c.dashboard_tab_id));
const tabs=dashboard.tabs, overview=tabs.find(t=>t.name==='1 · Overview').id,cash=tabs.find(t=>t.name==='2 · Cash Analysis').id;
let nextId=-1;
function add(key,tab,col,row,w,h,title){
 const q=questions.find(q=>q.key===key),old=dashboard.dashcards.find(c=>c.dashboard_tab_id===tab&&c.card_id===q.id);
 placements.push({id:old?.id??nextId--,card_id:q.id,dashboard_tab_id:tab,col,row,size_x:w,size_y:h,series:[],visualization_settings:title?{'card.title':title}:{},parameter_mappings:tab===cash?[{parameter_id:'cash-date',card_id:q.id,target:q.date_target}]:tab===overview&&['daily-principal','daily-profit','daily-overdue'].includes(key)?[{parameter_id:'overview-trend-period',card_id:q.id,target:['dimension',['field','Date',{'base-type':'type/Date'}]]}]:[]});
}
function heading(tab,row,text){placements.push({id:nextId--,card_id:null,dashboard_tab_id:tab,col:0,row,size_x:24,size_y:1,series:[],parameter_mappings:[],visualization_settings:{virtual_card:{display:'heading',visualization_settings:{text}},'card.background':false}});}
function note(tab,row,text){placements.push({id:nextId--,card_id:null,dashboard_tab_id:tab,col:0,row,size_x:24,size_y:4,series:[],parameter_mappings:[],visualization_settings:{virtual_card:{display:'text',visualization_settings:{text,'text.align_vertical':'middle'}},'card.background':false}});}
heading(overview,0,'Capital at work');
for(const [i,key] of ['cash-pool','principal','available','utilization'].entries())add(key,overview,i*6,1,6,2,{'cash-pool':'Total cash pool',principal:'Principal outstanding',available:'Cash available',utilization:'Capital deployed'}[key]);
heading(overview,3,'Earnings & momentum · gross interest');
for(const [i,key] of ['mtd','projected','profit-30','daily-interest'].entries())add(key,overview,i*6,4,6,2,{mtd:'This month · realized',projected:'This month · projected','profit-30':'Past 30 days','daily-interest':'Expected per day'}[key]);
for(const [i,key] of ['growth','interest-paid','active-loans','top-borrower'].entries())add(key,overview,i*6,6,6,2,{growth:'7-day profit growth','interest-paid':'Interest · all time','active-loans':'Active loans','top-borrower':'Largest borrower'}[key]);
heading(overview,8,'Borrower concentration · top four + others');
add('borrower-principal',overview,0,9,12,6,'Principal outstanding');add('borrower-profit',overview,12,9,12,6,'Interest · past 30 days');
heading(overview,15,'Portfolio trends · daily closing snapshots');
add('daily-principal',overview,0,16,24,6,'Principal outstanding');
add('daily-profit',overview,0,22,12,6,'Daily gross interest');add('daily-overdue',overview,12,22,12,6,'Overdue · through yesterday');
note(overview,28,'Profit means gross interest before expenses. Principal reference: 120,000. Daily interest goal: 10,000. Dates use Bangkok time.');
heading(cash,0,'Liquidity at a glance');
for(const [i,key] of ['cash-pool','principal','available','account-balance'].entries())add(key,cash,i*6,1,6,2,{'cash-pool':'Total cash pool',principal:'Principal outstanding',available:'Cash available','account-balance':'Loan account balance'}[key]);
heading(cash,3,'Where the money sits');
add('utilization-gauge',cash,0,4,8,6,'Cash pool utilization');add('composition',cash,8,4,16,6,'Loan account composition');
heading(cash,10,'Lending mix & capital movement');
add('loan-type',cash,0,11,8,7,'Principal by loan type');add('daily-principal',cash,8,11,16,7,'Principal outstanding trend');
add('principal-flows',cash,0,18,24,7,'Principal issued & returned');
note(cash,25,'**Date range:** balances use the peak cash-pool date; loan types use loan date; trends use snapshot date. This is not an as-of balance. Returned principal is negative.');
await api('PUT','dashboard/3',{parameters:[...dashboard.parameters.filter(p=>p.id!=='overview-trend-period'),{id:'overview-trend-period',name:'Portfolio trend period',slug:'overview_trend_period',type:'date/all-options',sectionId:'date',default:'past30days'}]});
await api('PUT','dashboard/3/cards',{cards:placements,tabs});
const saved=await api('GET','dashboard/3');
if(saved.dashcards.filter(c=>c.card_id&&[4,5].includes(c.dashboard_tab_id)).length!==26||saved.tabs.length<2)throw Error('Visual coverage mismatch');
write('dashboard-verification.json',{dashboard_id:3,url:'https://reports.mw-credit.com/dashboard/3',source_id:2,collection_id:5,tabs:saved.tabs,cards,visual_count:26,heading_note_count:saved.dashcards.filter(c=>!c.card_id).length,verified_at:new Date().toISOString()});
console.log('Saved redesigned Overview and Cash pages, retaining all 26 visual placements.');
