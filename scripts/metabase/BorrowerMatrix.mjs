// R029: native isolated-point matrix, immutable source categories and report rollback.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
const out=root+'/outputs/r029-bcg-matrix';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r029-bcg-matrix/metabase';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const save=(n,v)=>fs.writeFileSync(`${out}/${n}.json`,JSON.stringify(v,null,2)+'\n');
const read=n=>JSON.parse(fs.readFileSync(`${out}/${n}.json`));
const source='public.reporting_borrower_matrix_plot_v1';
const categories=['Star','Question Mark','Cash Cow','Dog'];
const metrics=[...categories,'Health boundary','Contribution boundary'];
const tooltip=['Borrower','Category','Payment score /100','Schedule','Contribution ×','Interest 30d ฿','Principal ฿','History','Position basis','As of'];
// Native line renderer with missing=none leaves isolated points. Reference lines
// use interpolate and no markers. Scaffolding never contributes to borrower counts.
// Deterministic subpixel de-duplication avoids pivot aggregation at identical X.
export const plotSQL=`WITH points AS (
 SELECT p.*,b."Description" borrower_name,
  round(plot_x,3) + .0001*row_number() OVER(PARTITION BY round(plot_x,3) ORDER BY borrower_id)
   /(count(*) OVER(PARTITION BY round(plot_x,3))+1) render_x,
  .000025/(count(*) OVER(PARTITION BY round(plot_x,3))+1) gap
 FROM ${source} p JOIN public.olap_borrowers_analytics b ON b."Row ID"=p.borrower_id
 WHERE plot_status='Plotted'
), drawable AS (
 SELECT render_x+g*gap x,
  CASE WHEN g=0 AND quadrant='Star' THEN plot_y END star,
  CASE WHEN g=0 AND quadrant='Question Mark' THEN plot_y END question,
  CASE WHEN g=0 AND quadrant='Cash Cow' THEN plot_y END cow,
  CASE WHEN g=0 AND quadrant='Dog' THEN plot_y END dog,
  NULL::numeric health_line,NULL::numeric contribution_line,
  CASE WHEN g=0 THEN borrower_name END borrower,
  CASE WHEN g=0 THEN quadrant END category,
  CASE WHEN g=0 THEN reliability_score END score,
  CASE WHEN g=0 THEN arrangement_status END schedule,
  CASE WHEN g=0 THEN relative_contribution END contribution,
  CASE WHEN g=0 THEN contribution_30d END interest,
  CASE WHEN g=0 THEN outstanding_principal END principal,
  CASE WHEN g=0 THEN confidence END history,
  CASE WHEN g=0 THEN position_basis END basis,
  CASE WHEN g=0 THEN reporting_date END as_of
 FROM points CROSS JOIN (VALUES(-1),(0),(1)) guards(g)
 UNION ALL
 SELECT x,NULL,NULL,NULL,NULL,h,v,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
 FROM (VALUES(0::numeric,NULL::numeric,50::numeric),(100,NULL,50),
   (49.999999,0,NULL),(50.000001,100,NULL)) guides(x,h,v)
)
SELECT x AS "Display X",star AS "Star",question AS "Question Mark",cow AS "Cash Cow",dog AS "Dog",
 health_line AS "Health boundary",contribution_line AS "Contribution boundary",
 borrower AS "Borrower",category AS "Category",score AS "Payment score /100",schedule AS "Schedule",
 contribution AS "Contribution ×",interest AS "Interest 30d ฿",principal AS "Principal ฿",
 history AS "History",basis AS "Position basis",as_of AS "As of" FROM drawable ORDER BY x`;
export const settings={
 'graph.dimensions':['Display X'],'graph.metrics':metrics,'graph.x_axis.scale':'linear',
 'graph.y_axis.auto_range':false,'graph.y_axis.min':0,'graph.y_axis.max':100,'graph.y_axis.auto_split':false,
 'graph.show_legend':false,'graph.show_values':false,'graph.x_axis.axis_enabled':false,'graph.y_axis.axis_enabled':false,
 'graph.x_axis.labels_enabled':true,'graph.x_axis.title_text':'Stronger payment health  ←  |  →  Lower / modified health',
 'graph.y_axis.labels_enabled':true,'graph.y_axis.title_text':'Higher contribution ↑ · midpoint 1×',
 'graph.tooltip_type':'default','graph.tooltip_columns':tooltip.map(n=>JSON.stringify(['name',n])),
 'line.marker_enabled':true,'line.missing':'none',
 'series_settings':Object.fromEntries(metrics.map((n,i)=>[n,{color:['#287A51','#AE7917','#3672AD','#A65161','#8492A6','#8492A6'][i],
   'line.marker_enabled':i<4,'line.missing':i<4?'none':'interpolate','line.size':i<4?'M':'S',axis:'left'}])),
 'column_settings':Object.fromEntries(['Payment score /100','Contribution ×','Interest 30d ฿','Principal ฿'].map(n=>[JSON.stringify(['name',n]),{number_style:'decimal',decimals:n==='Contribution ×'?2:1,number_separators:'.,',compact:false}]))
};
const query=sql=>({database:2,type:'native',native:{query:sql,'template-tags':{}}});
export const specs=[{key:'matrix',name:'Borrower portfolio matrix · equal quadrants',display:'line',dataset_query:query(plotSQL),visualization_settings:settings,
 description:'R029: display-only normalized positions. Stars top-left; Question Marks top-right; Cash Cows bottom-left; Dogs bottom-right. Raw payment score/category unchanged. Modified schedules at right-center. Null guards isolate dots; four explicit guide rows draw boundaries and fix extent; neither counts as borrowers.'},
 {key:'matrix-details',name:'Matrix borrowers · scores, schedule and contribution',display:'table',dataset_query:query(`SELECT b."Description" AS "Borrower",p.quadrant AS "Category",p.reliability_score AS "Payment score /100",p.arrangement_status AS "Schedule",p.relative_contribution AS "Contribution ×",p.contribution_30d AS "Interest 30d ฿",p.outstanding_principal AS "Principal ฿",p.confidence AS "History",p.plot_status AS "Plot status",p.position_basis AS "Position basis",p.classification_reason AS "Category reason",p.reporting_date AS "As of" FROM ${source} p JOIN public.olap_borrowers_analytics b ON b."Row ID"=p.borrower_id ORDER BY CASE p.quadrant WHEN 'Star' THEN 1 WHEN 'Question Mark' THEN 2 WHEN 'Cash Cow' THEN 3 WHEN 'Dog' THEN 4 ELSE 5 END,b."Description",p.borrower_id`),visualization_settings:{'table.pivot':false,'column_settings':settings.column_settings},description:'Every active borrower, including unclassified/invalid plot inputs. Raw values, not display coordinates. Accessible companion for overlapping points and touch screens.'}];
save('metabase-plan',{specs});
const shape=cards=>cards.map(c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]))).sort((a,b)=>a.id-b.id);
if(process.argv.includes('--prepare')){
 await assertSource();assert(!fs.existsSync(priv+'/dashboard-before.json'),'Baseline exists; do not overwrite');
 const d=await api('GET','dashboard/3');fs.writeFileSync(priv+'/dashboard-before.json',JSON.stringify(d));
 fs.writeFileSync(priv+'/scatter-before.json',JSON.stringify(await api('GET','card/266')));
 const backup=await api('POST','dashboard/3/copy',{name:'R029 backup · before equal-quadrant matrix',collection_id:5});
 save('metabase-state',{dashboard:3,tab:31,backupDashboard:backup.id,oldScatter:266,prototype:273,cards:{}});console.log({backup:backup.id});
}
if(process.argv.includes('--create')){
 await assertSource();const state=read('metabase-state');
 for(const {key,...body} of specs){assert(!state.cards[key],'Already created');const c=await api('POST','card',{...body,collection_id:5});state.cards[key]=c.id;save('metabase-state',state);}
 console.log(state.cards);
}
if(process.argv.includes('--check')){
 await assertSource();const state=read('metabase-state'),checks=[],saved=[];
 for(const {key,...body} of specs){const c=await api('GET',`card/${state.cards[key]}`);
  assert.equal(c.dataset_query.native?.query??c.dataset_query.stages?.[0]?.native,body.dataset_query.native.query);
  assert.deepEqual(c.visualization_settings,body.visualization_settings);
  const r=await api('POST',`card/${c.id}/query`,{});assert.equal(r.status,'completed');assert(!r.data.rows_truncated);
  if(key==='matrix'){
   const cols=r.data.cols.map(x=>x.name),rows=r.data.rows;
   const borrowers=rows.filter(x=>x[cols.indexOf('Borrower')]!==null);
   assert.equal(new Set(rows.map(x=>x[0])).size,rows.length,'Render X collision');
   assert.equal(rows.filter(x=>x.slice(1,5).some(v=>v!==null)).length,borrowers.length);
   for(const row of borrowers){const category=row[cols.indexOf('Category')],y=row[cols.indexOf(category)];assert.equal(row[0]<50,['Star','Cash Cow'].includes(category));assert.equal(y>50,['Star','Question Mark'].includes(category));}
   checks.push({key,id:c.id,rows:rows.length,borrower_points:borrowers.length,category_mismatches:0});
  }else checks.push({key,id:c.id,borrowers:r.data.rows.length});
  saved.push({key,...Object.fromEntries(['id','name','description','display','dataset_query','visualization_settings'].map(k=>[k,c[k]]))});
 }
 save('metabase-verification',{at:new Date().toISOString(),checks});save('saved-question-definitions',saved);console.log(checks);
}
if(process.argv.includes('--publish')){
 const state=read('metabase-state'),before=JSON.parse(fs.readFileSync(priv+'/dashboard-before.json')),d=await api('GET','dashboard/3');
 assert.deepEqual(shape(d.dashcards),shape(before.dashcards),'Intervening dashboard change');
 const cards=d.dashcards;
 // Same four lists/counts, moved to match classic category orientation.
 const positions={260:[0,9],261:[0,11],264:[12,9],265:[12,11],258:[0,19],259:[0,21],262:[12,19],263:[12,21]};
 for(const c of cards.filter(c=>c.dashboard_tab_id===31)){
  if(positions[c.card_id])[c.col,c.row]=positions[c.card_id];
  if(c.row>=40)c.row+=24;
  if(c.card_id===266){c.card_id=state.cards.matrix;c.size_y=24;c.row=31;delete c.card;}
  if(c.id===848)c.visualization_settings.virtual_card.display='text';
 }
 const note=cards.find(c=>c.id===848);note.visualization_settings.virtual_card.visualization_settings.text='## Borrower portfolio matrix\n**TOP LEFT · STAR**　　　　　　　　　**TOP RIGHT · QUESTION MARK**';
 const addText=(id,row,h,text)=>({id,card_id:null,dashboard_tab_id:31,col:0,row,size_x:24,size_y:h,series:[],parameter_mappings:[],visualization_settings:{virtual_card:{display:'text',visualization_settings:{text}}}});
 cards.push(addText(-2901,55,3,'**BOTTOM LEFT · CASH COW**　　　　　　　　　**BOTTOM RIGHT · DOG**\n\nPositions are normalized for equal quadrants. Categories and payment scores are unchanged. Modified schedules occupy the right half automatically. Use the borrower list below for exact values and overlapping points.'));
 cards.push({id:-2902,card_id:state.cards['matrix-details'],dashboard_tab_id:31,col:0,row:58,size_x:24,size_y:6,series:[],parameter_mappings:[],visualization_settings:{}});
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});
 const after=await api('GET','dashboard/3');assert.deepEqual(shape(after.dashcards.filter(c=>c.dashboard_tab_id!==31)),shape(before.dashcards.filter(c=>c.dashboard_tab_id!==31)));
 assert.deepEqual(after.parameters,before.parameters);assert.deepEqual(after.tabs,before.tabs);
 const old=await api('GET','card/266'),oldBefore=JSON.parse(fs.readFileSync(priv+'/scatter-before.json'));
 for(const field of ['name','dataset_query','display','visualization_settings'])assert.deepEqual(old[field],oldBefore[field],'Old question changed: '+field);
 save('metabase-saved',{dashboard:3,tab:31,backup:state.backupDashboard,cards:state.cards,old_question_preserved:true,other_tabs_unchanged:true,layout:shape(after.dashcards.filter(c=>c.dashboard_tab_id===31))});console.log('Published review-tab matrix; original question and other tabs preserved');
}
