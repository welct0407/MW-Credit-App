// R028: refine only the existing parallel Borrower Health Review, keep originals.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
const out=root+'/outputs/r028-schedule-health';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r028-schedule-health/metabase';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const save=(name,x)=>fs.writeFileSync(`${out}/${name}.json`,JSON.stringify(x,null,2)+'\n');
const oldState=JSON.parse(fs.readFileSync(root+'/outputs/r027-payment-health/metabase-state.json'));
const original=JSON.parse(fs.readFileSync(root+'/outputs/r027-payment-health/metabase-saved.json'));
const matrix='public.reporting_borrower_matrix_v3',schedule='public.reporting_borrower_schedule_health_v1';
export const specs=structuredClone(original.questions);
for(const p of specs){
 p.dataset_query.native.query=p.dataset_query.native.query.replaceAll('public.reporting_borrower_matrix_v2',matrix);
 p.description='R028 automatic schedule categories. Payment score unchanged; auto-off plus <80% interest amount OR charge-date coverage, >=7 observed days and >=2 due dates, restricts upper categories. Current 30 completed Bangkok days; no manual confirmations.';
 if(['cow','star','dog','question'].includes(p.key))p.dataset_query.native.query=p.dataset_query.native.query.replace('m.confidence AS "History",','m.confidence AS "History",m.arrangement_status AS "Schedule",');
 if(p.key==='scatter'){
  p.name='Payment behaviour vs contribution · automatic categories';
  p.dataset_query.native.query=p.dataset_query.native.query.replace("m.quadrant AS", "m.quadrant||CASE WHEN m.arrangement_gate THEN ' · Modified schedule' ELSE '' END AS");
  p.visualization_settings['graph.y_axis.title_text']='Observed payment score /100 (schedule restriction is separate)';
 }
 if(p.key==='health')p.dataset_query.native.query=p.dataset_query.native.query.replace('h.reason_text AS "Reason"',
  `coalesce(m.arrangement_status,'Outside active cohort') AS "Schedule",m.classification_reason AS "Category reason",h.reason_text AS "Payment reason"`);
}
const table={...specs.find(x=>x.key==='health').visualization_settings};
const add=(key,name,display,query,settings)=>specs.push({key,name,display,dataset_query:{database:2,type:'native',native:{query,'template-tags':{}}},visualization_settings:settings,description:'R028 automatic schedule assessment. Counterfactual current setup, not extra debt. No manual inputs. Current completed-day window; unsupported sources explicitly unassessed.'});
add('modified','Modified schedule · active borrowers','scalar',`SELECT count(*) AS "Borrowers" FROM ${matrix} WHERE arrangement_gate`,{'scalar.field':'Borrowers','graph.colors':['#D6816B']});
add('schedules','Automatic schedule assessment · active borrowers','table',`SELECT b."Description" AS "Borrower",s.arrangement_status AS "Schedule",s.modified_schedule_loan_count AS "Restricted loans",s.active_loan_count AS "Active loans",s.expected_interest_30d AS "Expected interest ฿",s.recorded_interest_30d AS "Recorded interest ฿",s.interest_coverage_30d AS "Interest coverage",s.interest_date_coverage_30d AS "Date coverage",m.payment_only_quadrant AS "Payment-only category",m.quadrant AS "Category" FROM ${schedule} s JOIN ${matrix} m USING(borrower_id) JOIN public.olap_borrowers_analytics b ON b."Row ID"=s.borrower_id ORDER BY s.arrangement_gate DESC,b."Description"`,{...table,column_settings:{...Object.fromEntries(['Expected interest ฿','Recorded interest ฿'].map(n=>[JSON.stringify(['name',n]),{number_style:'decimal',decimals:2,number_separators:'.,'}])),...Object.fromEntries(['Interest coverage','Date coverage'].map(n=>[JSON.stringify(['name',n]),{number_style:'percent',decimals:1}]))},'table.column_formatting':[{columns:['Restricted loans'],type:'single',operator:'>',value:0,color:'#FFF2D6',highlight_row:true}]});
add('schedule-loans','Modified schedules · loan and next-plan detail','table',`SELECT b."Description" AS "Borrower",l."Loan Date" AS "Loan date",s.payment_interval AS "Normal interval days",s.daily_interest AS "Daily interest ฿",s.comparison_start AS "Compared from",s.expected_interest_30d AS "Expected interest ฿",s.recorded_interest_30d AS "Recorded interest ฿",s.expected_due_dates_30d AS "Expected dates",s.recorded_interest_dates_30d AS "Recorded dates",s.schedule_reason AS "Rule reason",s.next_plan_due_date AS "Next plan due",s.next_plan_interest AS "Next interest ฿",s.next_plan_principal AS "Next principal ฿" FROM public.reporting_loan_schedule_health_v1 s JOIN public."Loans" l ON l."Row ID"=s.loan_id JOIN public.olap_borrowers_analytics b ON b."Row ID"=s.borrower_id WHERE s.modified_schedule ORDER BY b."Description",s.start_date,s.loan_id`,{...table,column_settings:Object.fromEntries(['Daily interest ฿','Expected interest ฿','Recorded interest ฿','Next interest ฿','Next principal ฿'].map(n=>[JSON.stringify(['name',n]),{number_style:'decimal',decimals:2,number_separators:'.,'}]))});
// No raw Loans permission is needed: all required dates are in the governed view.
specs.at(-1).dataset_query.native.query=specs.at(-1).dataset_query.native.query.replace('l."Loan Date"','s.start_date').replace(' JOIN public."Loans" l ON l."Row ID"=s.loan_id','');
const shape=cs=>cs.map(c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]))).sort((a,b)=>a.id-b.id);
if(process.argv.includes('--prepare')){
 await assertSource();
 assert(!fs.existsSync(priv+'/dashboard-before.json'),'Baseline already captured; do not overwrite');
 const d=await api('GET','dashboard/3');fs.writeFileSync(priv+'/dashboard-before.json',JSON.stringify(d));
 const cards=[];for(const [key,id] of Object.entries(oldState.cards))cards.push({key,...await api('GET',`card/${id}`)});
 fs.writeFileSync(priv+'/cards-before.json',JSON.stringify(cards));
 const backup=await api('POST','dashboard/3/copy',{name:'R028 backup · before automatic schedule categories',collection_id:5});
 save('metabase-state',{...oldState,backupDashboard:backup.id});
 console.log(JSON.stringify({backup_dashboard:backup.id,tab:oldState.tab,existing_cards:cards.length}));
}
save('metabase-plan',{specs});
if(process.argv.includes('--publish')){
 await assertSource();const state=JSON.parse(fs.readFileSync(out+'/metabase-state.json'));
 const baseline=JSON.parse(fs.readFileSync(priv+'/dashboard-before.json'));
 const d=await api('GET','dashboard/3');assert.deepEqual(shape(d.dashcards),shape(baseline.dashcards),'Dashboard changed after baseline');
 for(const spec of specs){const {key,id,...body}=spec;
  if(state.cards[key])await api('PUT',`card/${state.cards[key]}`,body);
  else {const card=await api('POST','card',{...body,collection_id:5});state.cards[key]=card.id;save('metabase-state',state);}
 }
 const cards=structuredClone(d.dashcards);const own=cards.filter(c=>c.dashboard_tab_id===state.tab);
 const notes=own.filter(c=>!c.card_id).sort((a,b)=>a.row-b.row);
 notes[1].visualization_settings.virtual_card.visualization_settings.text='## Payment behaviour × contribution\nUpper row: score ≥80 with no automatic schedule restriction. Lower row: score <80 or modified schedule. Left: contribution <1×; right: ≥1×. Unclassified remains outside the board.';
 notes[2].visualization_settings.virtual_card.visualization_settings.text='**Automatic rule:** auto-charge off + interest amount OR interest-charge-date coverage <80%, with ≥7 observed days and ≥2 expected dates. Any affected active loan restricts Star/Cash Cow. Scores remain unchanged; the chart can show a high payment score for a lower category.';
 notes[4].visualization_settings.virtual_card.visualization_settings.text+='\n**Schedule rule:** categories additionally reflect modified schedules. It recalculates automatically and is not a confirmed-hardship label. No manual review or overrides.';
 const summary=['active','overdue','provisional','unclassified'];summary.forEach((key,i)=>{const c=own.find(c=>c.card_id===state.cards[key]);c.col=i*5;c.size_x=5;});
 const place=(key,col,row,w,h,id)=>({id,card_id:state.cards[key],dashboard_tab_id:state.tab,col,row,size_x:w,size_y:h,series:[],parameter_mappings:[],visualization_settings:{}});
 const row=own.find(c=>c.card_id===state.cards.active).row;
 cards.push(place('modified',20,row,4,3,-4201));
 const bottom=Math.max(...own.map(c=>c.row+c.size_y));
 cards.push({id:-4202,card_id:null,dashboard_tab_id:state.tab,col:0,row:bottom,size_x:24,size_y:3,series:[],parameter_mappings:[],visualization_settings:{'card.background':false,virtual_card:{display:'text',visualization_settings:{text:'## Automatic schedule assessment\nCurrent setup compared with recorded charges over 30 completed days, respecting schedule anchors. Principal is separate. Expected interest is not additional overdue debt. A lump-sum catch-up does not hide reduced charge frequency. Unsupported/short histories are labeled.'}}}});
 cards.push(place('schedules',0,bottom+3,24,10,-4203),place('schedule-loans',0,bottom+13,24,10,-4204));
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});
 const after=await api('GET','dashboard/3');assert.deepEqual(shape(after.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)),shape(baseline.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)));
 assert.deepEqual(after.parameters,baseline.parameters);assert.deepEqual(after.tabs,baseline.tabs);
 save('metabase-saved',{dashboard:3,tab:state.tab,backup_dashboard:state.backupDashboard,questions:specs.map(p=>({...p,id:state.cards[p.key]})),layout:shape(after.dashcards.filter(c=>c.dashboard_tab_id===state.tab)),other_tabs_unchanged:true});
 console.log('Updated existing review tab; original tabs/filters preserved');
}
if(process.argv.includes('--check')){
 await assertSource();const state=JSON.parse(fs.readFileSync(out+'/metabase-state.json')),checks=[];
 for(const p of specs){const card=await api('GET',`card/${state.cards[p.key]}`);assert.deepEqual(card.dataset_query,p.dataset_query);const r=await api('POST',`card/${card.id}/query`,{});assert(r.status==='completed'&&!r.data.rows_truncated,p.key);checks.push({key:p.key,id:card.id,rows:r.data.rows.length});}
 const d=await api('GET','dashboard/3'),before=JSON.parse(fs.readFileSync(priv+'/dashboard-before.json'));
 assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)),shape(before.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)));
 save('metabase-verification',{at:new Date().toISOString(),checks,other_tabs_unchanged:true});
 console.log(`Verified ${checks.length} saved questions and unaffected placements`);
}
