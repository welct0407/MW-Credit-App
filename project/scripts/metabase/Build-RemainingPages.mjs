import {read,write} from './ReportingApi.mjs';
import {reuseQuestionSpec} from './QuestionReuse.mjs';
const models=read('models.json'), specs=[];
const C=['#178F8A','#7472BE','#D6816B','#24435A','#D4AD60'];
const type=(m,f)=>models[m].columns.find(c=>c.name===f)?.base_type??'type/Decimal';
const F=(m,f)=>['field',f,{'base-type':type(m,f)}], A=i=>['aggregation',i];
const agg=(m,f,op='sum',name=f)=>['aggregation-options',f?[op,F(m,f)]:[op],{name,'display-name':name}];
const eq=(m,f,v)=>['=',F(m,f),v];
const active=eq('borrowers','Has Active Loan',true), visible=['or',eq('borrowers','Hidden',false),['is-null',F('borrowers','Hidden')]];
function add(key,page,title,model,display,query={},dims=[],metrics=[],extra={}){
 const settings={'graph.dimensions':dims,'graph.metrics':metrics,'graph.colors':C,series_settings:Object.fromEntries(metrics.map((m,i)=>[m,{color:C[i%C.length]}])),'graph.show_dots':false,'graph.show_values':display==='row','graph.show_legend':metrics.length>1,'graph.x_axis.title_enabled':false,'graph.y_axis.title_enabled':false,'graph.label_value_formatting':'compact','table.pivot':false,'table.cell_column_widths':null,column_settings:{}};
 for(const name of [...dims,...metrics])if(/Decimal|Float|Integer|BigInteger|Number/.test(type(model,name)))settings.column_settings[JSON.stringify(['name',name])]={number_style:/Rate|Yield|Share|Exposure %|Concentration|Realization|Return on|Growth/.test(name)?'percent':'decimal',decimals:/Rate|Yield|Share|Exposure %|Concentration|Realization|Return on|Growth/.test(name)?1:0,number_separators:'.,'};
 if(display==='scalar')settings['scalar.field']=metrics[0];
 if(display==='pie')Object.assign(settings,{'pie.dimension':dims[0],'pie.metric':metrics[0],'pie.show_legend':true,'pie.show_total':false,'pie.show_labels':true});
 const visualSettings={...settings,...extra.settings};if(display==='scalar')delete visualSettings['scalar.segments'];
 specs.push({key,page,name:title,model,display,settings:visualSettings,description:extra.description??`Page ${page}. Built from the shared ${models[model].name} model; gross profit means interest before expenses.`,dataset_query:{database:2,type:'query',query:{'source-table':'card__'+models[model].id,...query}},...Object.fromEntries(Object.entries(extra).filter(([k])=>!['settings','description'].includes(k)))});
}
function scalar(key,p,title,m,f,op='sum',filter){add(key,p,title,m,'scalar',{aggregation:[agg(m,f,op,f??title)],...(filter?{filter}:{})},[],[f??title]);}
function chart(key,p,title,m,display,dimension,metrics,{filter,order='desc',limit,aggregation='sum',...extra}={}){
 const dims=Array.isArray(dimension)?dimension:[dimension];const aggs=metrics.map(f=>agg(m,f,aggregation,f??'Count'));
 add(key,p,title,m,display,{breakout:dims.map(f=>F(m,f)),aggregation:aggs,'order-by':[[order,order==='asc'?F(m,dims[0]):A(0)]],...(filter?{filter}:{}),...(limit?{limit}:{})},dims,metrics.map(f=>f??'Count'),extra);
}
function table(key,p,title,m,fields,filter,extra={}){add(key,p,title,m,'table',{fields:fields.map(f=>F(m,f)),...(filter?{filter}:{})},[],fields,extra);}
// 3 — Borrowers: current governed borrower metrics; stable keys remain in detail datasets.
scalar('b-active',3,'Active borrowers','borrowers',null,'count',active);
scalar('b-principal',3,'Principal outstanding','portfolio','Outstanding Principal');
add('b-top',3,'Largest borrower','portfolio','scalar',{fields:[F('portfolio','Top Borrower')]},[],['Top Borrower']);
scalar('b-interest',3,'Lifetime interest','borrowers','Total Interest Earned');
for(const [key,f,title]of [['principal','Outstanding Principal','Principal'],['profit','Profit Last 30 Days','Interest · past 30 days']]){
 chart('b-share-'+key,3,title+' share','borrowers','pie','Borrower',[f],{filter:visible});
 chart('b-rank-'+key,3,title+' by borrower','borrowers','row','Borrower',[f],{filter:visible});
}
for(const [key,f,title]of [['return','30D Return on Average Principal','30-day return on average principal'],['coverage','Return on Active Principal','Active principal covered by interest'],['lifetime','Total Interest Earned','Lifetime interest by borrower'],['loans','Total Number of Loans','Loans by borrower']])chart('b-'+key,3,title,'borrowers','row','Borrower',[f],{filter:['>',F('borrowers','Total Number of Loans'),0]});
chart('b-contribution',3,'Interest contribution over time','repayments','bar',['Payment Date','Borrower'],['Interest Paid'],{order:'asc',filter:['>',F('repayments','Interest Paid'),0],settings:{'stackable.stack_type':'stacked','graph.show_legend':true}});
table('b-stability',3,'Borrower value & stability','borrowers',['Matrix Label','Matrix Scaled Economic Contribution','Matrix Stability Score','Outstanding Principal'],active,{display:'scatter',settings:{'graph.dimensions':['Matrix Scaled Economic Contribution','Matrix Label'],'graph.metrics':['Matrix Stability Score'],'scatter.bubble':'Outstanding Principal','graph.show_legend':false,'graph.goal_value':80,'graph.show_goal':true}});
table('b-capital-profit',3,'Average capital vs 30-day interest','borrowers',['Borrower','30D Average Outstanding Principal','Profit Last 30 Days'],visible,{display:'scatter',settings:{'graph.dimensions':['30D Average Outstanding Principal','Borrower'],'graph.metrics':['Profit Last 30 Days'],'graph.show_legend':false}});
table('b-matrix-detail',3,'Stability score components','borrowers',['Borrower','Matrix Quadrant','Matrix Stability Score','Matrix Recent Reliability Score','Matrix Historical Reliability Score','Matrix Delay Severity Score','Matrix Current Condition Score']);
// 4 — Performance. Date filtering operates on event or snapshot date as appropriate.
scalar('p-interest',4,'Gross interest','repayments','Interest Paid');
add('p-growth',4,'7-day profit growth','portfolio','scalar',{fields:[F('portfolio','7-Day Profit Growth %')]},[],['7-Day Profit Growth %']);
scalar('p-count',4,'Loans issued','loans',null,'count');scalar('p-principal',4,'Principal issued','loans','Principal Amount');
for(const [key,f,title]of [['daily','Profit','Daily gross interest'],['cumulative','Cumulative Profit','Cumulative gross interest'],['yield','Daily Capital Yield','Daily capital yield'],['active-loans','Active Loans EOD','Active loans · past 30 days'],['active-borrowers','Active Borrowers EOD','Active borrowers · past 30 days']])chart('p-'+key,4,title,'daily','line','Date',[f],{order:'asc',filter:key.startsWith('active')?eq('daily','In Last 30 Days',true):undefined});
chart('p-issued',4,'Principal issued over time','loans','bar','Loan Date',['Principal Amount'],{order:'asc'});
chart('p-issued-count',4,'Loans issued over time','loans','bar','Loan Date',[null],{order:'asc',aggregation:'count'});
chart('p-type-profit',4,'Interest by loan type','repayments','row','Loan Type',['Interest Paid']);
chart('p-average',4,'Average loan size · weekly','loans','bar','Loan Week',['Principal Amount'],{order:'asc',aggregation:'avg'});
chart('p-period',4,'Period performance · daily','daily','table','Date',['Principal Issued','Principal Returned','Profit','Loans Issued'],{order:'asc'});
for(const q of specs.filter(q=>q.page===4&&q.model!=='portfolio'))q.date_field={repayments:'Payment Date',loans:'Loan Date',daily:'Date'}[q.model];
// 5 — Risks.
scalar('r-principal',5,'Principal outstanding','portfolio','Outstanding Principal');scalar('r-interest',5,'Lifetime interest','borrowers','Total Interest Earned');scalar('r-top3',5,'Top three concentration','portfolio','Top 3 Borrower Concentration');scalar('r-past-due',5,'Past-due amount','charges','Past Due Amount');
chart('r-borrowers',5,'Principal by borrower','borrowers','row','Borrower',['Outstanding Principal'],{filter:active});
chart('r-status',5,'Loan status','loans','pie','Loan Status',[null],{aggregation:'count'});
chart('r-age-count',5,'Active loan count by age','loans','row','Loan Age Bucket',[null],{aggregation:'count',filter:eq('loans','Loan Status','Active'),order:'asc'});
chart('r-age-principal',5,'Active principal by age','loans','row','Loan Age Bucket',['Outstanding Principal'],{filter:eq('loans','Loan Status','Active'),order:'asc'});
table('r-matrix',5,'Borrower risk · excluding largest exposure','borrowers',['Borrower','Outstanding Principal','Profit Last 30 Days','Total Number of Loans'],['and',active,['>',F('borrowers','Principal Rank'),1]],{display:'scatter',settings:{'graph.dimensions':['Outstanding Principal','Borrower'],'graph.metrics':['Profit Last 30 Days'],'scatter.bubble':'Total Number of Loans','graph.show_legend':false}});
chart('r-default',5,'Default loss over time','loans','bar','Close Date',['Default Loss Amount'],{order:'asc',filter:eq('loans','Defaulted Flag',true)});
const riskFields=['Borrower','Outstanding Principal','Portfolio Exposure %','Overdue Amount','Oldest Active Loan Age','Lifetime On Time Rate','Recent 30D On Time Rate','Maximum Days Late','Default Count','Lifetime Default Loss'];
table('r-monitor',5,'Borrower risk monitor','borrowers',riskFields,active);
// 6 — Daily collection. Four disjoint governed borrower statuses avoid blended fan-out.
scalar('c-due-count',6,'Borrowers due today','collections',null,'count');
scalar('c-paid-count',6,'Fully paid','collections',null,'count',eq('collections','Daily Collection Status','Fully Paid'));
scalar('c-partial-count',6,'Partially paid','collections',null,'count',eq('collections','Daily Collection Status','Partially Paid'));
scalar('c-unpaid-count',6,'Not paid / overdue','collections',null,'count',['or',eq('collections','Daily Collection Status','Not Paid'),eq('collections','Daily Collection Status','Overdue'),eq('collections','Daily Collection Status','Long Overdue')]);
for(const [k,f,title]of [['due','Amount Due Today','Amount due'],['collected','Amount Collected Today','Collected'],['remaining','Amount Outstanding Today','Outstanding'],['rate','Amount Collection Rate Today','Collection rate']])scalar('c-'+k,6,title,'portfolio',f);
for(const [key,status]of [['paid','Fully Paid'],['partial','Partially Paid'],['unpaid','Not Paid'],['overdue','Overdue']]){
 const filter=eq('collections','Daily Collection Status',status),summaryFilter=eq('collection-summary','Collection Status',status);
 scalar('c-'+key+'-borrowers',6,status+' · borrowers','collection-summary','Borrower Count','sum',summaryFilter);
 scalar('c-'+key+'-amount',6,status+' · '+(['paid','partial'].includes(key)?'receipts today':'amount remaining'),'collection-summary',['paid','partial'].includes(key)?'Receipts Today':'Amount Remaining','sum',summaryFilter);
 table('c-'+key+'-detail',6,status+' · collection worklist','collections',['Borrower','Amount Due','Amount Collected','Amount Remaining','Receipts Today','Overdue Amount'],filter);
}
// 7 — Borrower Insight. All record-based questions share the immutable borrower-key filter.
for(const [k,f,title]of [['principal','Outstanding Principal','Current principal'],['active','Active Loans','Active loans'],['overdue','Overdue Amount','Overdue'],['interest','Total Interest Earned','Lifetime interest']])scalar('i-'+k,7,title,'borrowers',f);
chart('i-timing',7,'Monthly payment behaviour','charges','bar',['Charge Month','Payment Timing'],[null],{order:'asc',aggregation:'count',settings:{'stackable.stack_type':'stacked','graph.show_legend':true}});
table('i-loans',7,'Borrower loan history','loans',['Loan Date','Loan ID','Loan Type','Loan Status','Principal Amount','Outstanding Principal','Current Daily Interest']);
table('i-assessment',7,'Credit history & assessment inputs','borrowers',['Borrower','Hidden','Has Closed Loan','Has Active Loan','Default Count','Lifetime Default Loss','Largest Successful Loan','Average Successful Loan Size','Historical Charge Count','Matrix History Sufficient','Matrix Quadrant']);
table('i-risk',7,'Borrower risk monitor','borrowers',riskFields);
for(const q of specs.filter(q=>q.page===7))q.borrower_field='Borrower ID';
// 8 — Forecasts are current-month values; source loan forecasts are not a decomposition of portfolio estimates.
for(const [k,f,title]of [['realized','Realized Profit MTD','Realized this month'],['remaining','Remaining Forecast Profit','Remaining forecast'],['estimate','Projected Monthly Profit','Estimated month'],['realization','Forecast Realization','Forecast realization']])scalar('f-'+k,8,title,'portfolio',f);
chart('f-progress',8,'Realized and remaining forecast','portfolio','bar','As Of Date',['Realized Profit MTD','Remaining Forecast Profit'],{settings:{'stackable.stack_type':'stacked'}});
chart('f-type',8,'Expected interest by loan type','loans','row','Loan Type',['Expected Interest This Month']);
chart('f-daily-borrower',8,'Current daily interest by borrower','loans','pie','Borrower',['Current Daily Interest']);
chart('f-month-borrower',8,'Expected monthly interest by borrower','loans','pie','Borrower',['Expected Interest This Month']);
chart('f-partner',8,'Current partner pool shares','partners','pie','Partner',['Current Pool Share']);
chart('f-detail',8,'Borrower forecast detail','loans','table','Borrower',['Current Daily Interest','Expected Interest This Month','Outstanding Principal']);
chart('f-interest-trend',8,'Interest received over time','repayments','line','Payment Date',['Interest Paid'],{order:'asc'});
specs.find(q=>q.key==='b-stability').settings.column_settings[JSON.stringify(['name','Matrix Scaled Economic Contribution'])]={number_style:'decimal',decimals:2};
write('remaining-questions.json',specs.map(reuseQuestionSpec));console.log(`Built ${specs.length} page definitions with shared question references.`);
