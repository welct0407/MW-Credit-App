// All joins and business expressions belong in models/*.sql. Visuals only select,
// summarize, filter and format model fields. The original queries remain a parity oracle.
import {read,write} from './ReportingApi.mjs';
const models=read('models.json'), old=read('questions.json');
const F=(name,type='type/Decimal')=>['field',name,{'base-type':type}];
const S=(field,name)=>['aggregation-options',['sum',F(field)],{name,'display-name':name}];
const A=i=>['aggregation',i];
const teal='#178F8A', indigo='#7472BE', coral='#D6816B';
const specs=[];
for(const q of old){
 let model='portfolio', query={}, display=q.display, dims=[],metrics=[],color=teal;
 const settings={...q.settings,column_settings:{}};
 if(['scalar','gauge'].includes(display)){
   const field=q.key==='utilization-gauge'?'Cash Pool Utilization':q.name;
   query.fields=[F(field,q.key==='top-borrower'?'type/Text':'type/Decimal')];
   settings['scalar.field']=field;
   if(q.key!=='top-borrower')settings.column_settings[JSON.stringify(['name',field])]={number_style:['utilization','utilization-gauge','growth'].includes(q.key)?'percent':'decimal',number_separators:'.,',decimals:0};
   delete settings['scalar.segments'];
 } else if(q.key.startsWith('borrower-')){
   model='borrower-performance'; const principal=q.key==='borrower-principal';
   dims=[principal?'Principal Group':'Profit Group'];metrics=['Amount (THB)'];color=principal?teal:indigo;
   query={breakout:[F(dims[0],'type/Text')],aggregation:[S(principal?'Outstanding Principal':'Profit 30D',metrics[0]),['aggregation-options',['min',F(principal?'Principal Group Order':'Profit Group Order')],{name:'Group Order','display-name':'Group Order'}]],'order-by':[['asc',A(1)]]};
   if(!principal)query.filter=['>',F('Payments 30D'),0];
 } else if(q.key.startsWith('daily-')){
   model='daily';dims=['Date'];metrics=['Amount (THB)'];
   const field={'daily-principal':'Outstanding Principal','daily-profit':'Profit','daily-overdue':'Overdue Charges'}[q.key];
   query={breakout:[F('Date','type/Date')],aggregation:[S(field,metrics[0])],'order-by':[['asc',F('Date','type/Date')]]};
   if(q.key==='daily-overdue')query.filter=['=',F('Include Overdue Trend','type/Boolean'),true];
   color=q.key==='daily-overdue'?coral:q.key==='daily-profit'?indigo:teal;
 } else if(q.key==='composition'){
   dims=['Account'];metrics=['Available Cash','Unsettled Profit'];query.fields=[F('Account','type/Text'),...metrics.map(x=>F(x))];
 } else if(q.key==='loan-type'){
   model='loans';display='row';dims=['Loan Type'];metrics=['Principal (THB)'];
   query={breakout:[F('Loan Type','type/Text')],aggregation:[S('Outstanding Principal',metrics[0])],'order-by':[['desc',A(0)]]};
 } else if(q.key==='principal-flows'){
   model='daily';dims=['Date'];metrics=['Principal Issued','Principal Returned'];
   query={breakout:[F('Date','type/Date')],aggregation:[S('Issued Chart Amount',metrics[0]),S('Returned Chart Amount',metrics[1])],'order-by':[['asc',F('Date','type/Date')]]};
 } else throw Error('Unhandled visual '+q.key);
 if(dims.length){
   const colors=metrics.length>1?[teal,indigo]:[color];
   Object.assign(settings,{'graph.dimensions':dims,'graph.metrics':metrics,'graph.colors':colors,'series_settings':Object.fromEntries(metrics.map((m,i)=>[m,{color:colors[i]}])),'graph.show_values':display==='row','graph.show_dots':false,'graph.label_value_formatting':'compact','graph.x_axis.title_enabled':false,'graph.y_axis.title_text':q.key==='composition'?'Share of balance':'THB','graph.show_legend':metrics.length>1});
   for(const m of metrics)settings.column_settings[JSON.stringify(['name',m])]={number_style:'decimal',decimals:0,number_separators:'.,'};
 }
 const dateName={104:'Peak Cash Pool Date 30D',95:'Loan Date',82:'Date'}[q.date_field];
 const description=q.key==='growth'
  ?'Last seven completed Bangkok dates (yesterday through seven days ago) versus the seven dates immediately before (eight through fourteen days ago). Today is excluded. No value when the previous period is zero. Built from Portfolio Overview; shared logic is maintained in the Reporting Models collection.'
  :q.description+' Built from '+models[model].name+'; shared logic is maintained in the Reporting Models collection.';
 specs.push({key:q.key,id:read('dashboard-verification.json').cards[q.key].id,name:q.name,model,display,description,settings,date_field:q.date_field,date_target:dateName?['dimension',F(dateName,'type/Date')]:null,dataset_query:{database:2,type:'query',query:{'source-table':'card__'+models[model].id,...query}}});
}
write('model-questions.json',specs);
console.log(`Built ${specs.length} model-based visual definitions; no visual SQL, joins or expressions.`);
