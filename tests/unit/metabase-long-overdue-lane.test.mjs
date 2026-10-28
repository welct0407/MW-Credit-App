// R102: the Metabase Long overdue lane rewrite (project/scripts/metabase/AddLongOverdueLane.mjs) on fixtures shaped like the
// live PROD JSON of 28 October 2026 (card definitions only; sanitized lib/uuid values; no rows, no borrower data).
import test from 'node:test';
import assert from 'node:assert/strict';
import {targetModelSql,targetModelQuery,modelStatuses,nativeSql,withNativeSql,remainingStatuses,targetRemainingQuery,withoutUuids,
 targetDetail,targetParameters,targetCards,widths,columns,newStatuses,unclassifiedStatuses,targetUnclassifiedQuery} from '../../project/scripts/metabase/AddLongOverdueLane.mjs';

const SQL='SELECT s.status AS "Collection Status",count(c."Borrower ID") AS "Borrower Count",\n       coalesce(sum(c."Receipts Today"),0) AS "Receipts Today",\n       coalesce(sum(c."Amount Remaining"),0) AS "Amount Remaining"\nFROM (VALUES (\'Fully Paid\'),(\'Partially Paid\'),(\'Not Paid\'),(\'Overdue\')) s(status)\nLEFT JOIN {{#77}} c ON c."Daily Collection Status"=s.status\nGROUP BY s.status';
// Model 162 as stored today (MBQL 5 native stage) and in the legacy native format.
const model162={stages:[{'template-tags':[{type:'card',id:'r016-model-77',name:'#77','display-name':'Collection Worklist','card-id':77}],'lib/type':'mbql.stage/native',native:SQL}],'lib/type':'mbql/query',database:2};
const legacy162={database:2,type:'native',native:{query:SQL,'template-tags':{'#77':{type:'card',name:'#77','card-id':77}}}};
const u=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const clause=(status,a,b)=>['=',{'lib/uuid':u(a)},['field',{'base-type':'type/Text','lib/uuid':u(b)},'Daily Collection Status'],status];
// Card 122 "Not paid / overdue" as stored today (MBQL 5) and in legacy MBQL.
const card122={stages:[{filters:[['or',{'lib/uuid':u(1)},clause('Not Paid',2,3),clause('Overdue',4,5)]],'lib/type':'mbql.stage/mbql',aggregation:[['count',{name:'Not paid / overdue','lib/uuid':u(6),'display-name':'Not paid / overdue'}]],'source-card':77}],'lib/type':'mbql/query',database:2};
const legacy122={database:2,type:'query',query:{'source-table':'card__77',aggregation:[['count']],filter:['or',['=',['field','Daily Collection Status',{'base-type':'type/Text'}],'Not Paid'],['=',['field','Daily Collection Status',{'base-type':'type/Text'}],'Overdue']]}};
const rules=['Not Paid','Partially Paid','Overdue','Fully Paid'].map((value,i)=>({columns:['Daily Collection Status'],type:'single',operator:'=',value,color:['#FEE4E2','#FFF1D6','#EDE9FE','#ECFDF3'][i],highlight_row:true}));

test('model 162: the VALUES list is parsed and re-rendered with Long Overdue after Overdue, in the stored format, nothing else changed',()=>{
 assert.deepEqual(modelStatuses(SQL).statuses,['Fully Paid','Partially Paid','Not Paid','Overdue']);
 const next=targetModelQuery(model162);
 assert.deepEqual(modelStatuses(nativeSql(next)).statuses,['Fully Paid','Partially Paid','Not Paid','Overdue','Long Overdue']);
 assert.equal(nativeSql(next),SQL.replace("('Overdue')) s(status)","('Overdue'),('Long Overdue')) s(status)"));
 assert.deepEqual(withNativeSql(next,''),withNativeSql(model162,''),'every key but the SQL is unchanged (MBQL 5)');
 assert.deepEqual(model162.stages[0].native,SQL,'input not mutated');
 const legacy=targetModelQuery(legacy162);assert.equal(legacy.type,'native');assert.equal(legacy.native.query,nativeSql(next));assert.deepEqual(legacy.native['template-tags'],legacy162.native['template-tags']);
 assert.equal(targetModelSql(SQL),nativeSql(next));
});
test('model 162: a replay, another status list, two lists or an unknown format are refused',()=>{
 const after=nativeSql(targetModelQuery(model162));
 assert.throws(()=>targetModelSql(after),/not the R025 four/,'replay');
 assert.throws(()=>targetModelSql(SQL.replace("('Overdue')","('Late')")),/not the R025 four/);
 assert.throws(()=>targetModelSql(SQL+'\nUNION ALL '+SQL),/expected R025 form/);
 assert.throws(()=>targetModelSql('SELECT 1'),/expected R025 form/);
 for(const bad of [{...model162,stages:[...model162.stages,model162.stages[0]]},{...model162,stages:[{...model162.stages[0],'lib/type':'mbql.stage/mbql'}]},{database:2,type:'query',query:{}},null])
  assert.throws(()=>targetModelQuery(bad),/neither known stored format/,JSON.stringify(bad));
});
test('card 122: the MBQL 5 or-filter gains one Long Overdue clause with fresh lib/uuid values; legacy MBQL likewise',()=>{
 assert.deepEqual(remainingStatuses(card122),{format:'mbql5',statuses:['Not Paid','Overdue']});
 const next=targetRemainingQuery(card122),f=next.stages[0].filters[0];
 assert.deepEqual(remainingStatuses(next).statuses,['Not Paid','Overdue','Long Overdue']);
 assert.deepEqual(f.slice(0,4),card122.stages[0].filters[0],'the existing clauses are untouched');
 assert.deepEqual(withoutUuids(f[4]),withoutUuids(clause('Long Overdue',0,0)));
 const ids=JSON.stringify(next).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g);assert.equal(new Set(ids).size,ids.length,'every lib/uuid is unique');
 assert.deepEqual(withoutUuids({...next,stages:[{...next.stages[0],filters:[]}]}),withoutUuids({...card122,stages:[{...card122.stages[0],filters:[]}]}),'aggregation, source card and format unchanged');
 assert.equal(card122.stages[0].filters[0].length,4,'input not mutated');
 const legacy=targetRemainingQuery(legacy122);assert.deepEqual(remainingStatuses(legacy),{format:'legacy',statuses:['Not Paid','Overdue','Long Overdue']});
});
test('card 122: a replay or any other filter shape is refused',()=>{
 assert.throws(()=>targetRemainingQuery(targetRemainingQuery(card122)),/exactly Not Paid and Overdue/,'replay');
 const stage=card122.stages[0],or=stage.filters[0];
 for(const bad of [
  {...card122,stages:[{...stage,'source-card':78}]},{...card122,stages:[{...stage,filters:[or,or]}]},{...card122,stages:[{...stage,filters:[['and',...or.slice(1)]]}]},
  {...card122,stages:[{...stage,filters:[[or[0],or[1],['=',or[2][1],['field',or[2][2][1],'Other Column'],'Not Paid'],or[3]]]}]},
  {...card122,stages:[{...stage,filters:[[or[0],or[1],or[2],clause('Fully Paid',8,9)]]}]},{...card122,stages:[stage,stage]},{database:2,type:'native',native:{query:'SELECT 1'}}])
  assert.throws(()=>targetRemainingQuery(bad),/remaining-pages filter/,JSON.stringify(bad).slice(0,120));
});
test('detail rules, the status filter and the lane layout: five statuses in order; a replay of the detail rules is refused',()=>{
 const settings=targetDetail({visualization_settings:{'table.column_formatting':rules}});
 assert.deepEqual(settings['table.column_formatting'].map(r=>[r.value,r.color]),[['Not Paid','#FEE4E2'],['Partially Paid','#FFF1D6'],['Overdue','#EDE9FE'],['Long Overdue','#ECEFF1'],['Fully Paid','#ECFDF3']]);
 assert.throws(()=>targetDetail({visualization_settings:settings}),/R036 order/);
 const param={slug:'collection_detail_status',id:'collection-detail-status',values_source_type:'static-list',values_source_config:{values:['Not Paid','Partially Paid','Overdue','Fully Paid']}};
 assert.deepEqual(targetParameters({parameters:[param,{id:'other'}]}),[{...param,values_source_config:{values:newStatuses}},{id:'other'}]);
 assert.deepEqual([widths(),columns()],[[5,5,5,5,4],[0,5,10,15,20]]);
 const at=(id,col,row)=>({id,card_id:id,dashboard_tab_id:19,col,row,size_x:6,size_y:row===6?2:9,visualization_settings:{}});
 const cards=targetCards({dashcards:[at(242,0,6),at(244,6,6),at(240,12,6),at(246,18,6),at(243,0,8),at(245,6,8),at(241,12,8),at(247,18,8),{id:1,card_id:99,dashboard_tab_id:5,col:0,row:0,size_x:24}]},{count:500,list:501});
 assert.deepEqual(cards.filter(c=>c.row===6&&c.dashboard_tab_id===19).sort((a,b)=>a.col-b.col).map(c=>[c.card_id,c.col,c.size_x]),[[242,0,5],[244,5,5],[240,10,5],[500,15,5],[246,20,4]]);
 assert.deepEqual(cards.find(c=>c.card_id===99),{id:1,card_id:99,dashboard_tab_id:5,col:0,row:0,size_x:24},'other placements untouched');
});

// Card 251 "Unclassified people · expected 0" as stored today (MBQL 5) and in legacy MBQL.
const card251={stages:[{filters:[['not',{'lib/uuid':u(11)},['=',{'lib/uuid':u(12)},['field',{'base-type':'type/Text','lib/uuid':u(13)},'Daily Collection Status'],'Overdue','Not Paid','Partially Paid','Fully Paid']]],'lib/type':'mbql.stage/mbql',aggregation:[['distinct',{name:'Unclassified','lib/uuid':u(14),'display-name':'Unclassified'},['field',{'base-type':'type/Text','lib/uuid':u(15)},'Borrower ID']]],'source-card':77}],'lib/type':'mbql/query',database:2};
const legacy251={database:2,type:'query',query:{'source-table':'card__77',filter:['not',['=',['field','Daily Collection Status',{'base-type':'type/Text'}],'Overdue','Not Paid','Partially Paid','Fully Paid']],aggregation:[['distinct',['field','Borrower ID',{'base-type':'type/Text'}]]]}};
test('card 251: the unclassified guard lists Long Overdue too (MBQL 5 and legacy); everything else unchanged',()=>{
 const next=targetUnclassifiedQuery(card251);
 assert.deepEqual(unclassifiedStatuses(next),{format:'mbql5',statuses:['Overdue','Not Paid','Partially Paid','Fully Paid','Long Overdue']});
 const filters0=x=>({...x,stages:[{...x.stages[0],filters:[]}]});
 assert.deepEqual(filters0(next),filters0(card251),'aggregation, source card and lib/uuid values unchanged');
 assert.deepEqual(next.stages[0].filters[0].slice(0,2),card251.stages[0].filters[0].slice(0,2));
 assert.equal(card251.stages[0].filters[0][2].length,7,'input not mutated');
 assert.deepEqual(unclassifiedStatuses(targetUnclassifiedQuery(legacy251)),{format:'legacy',statuses:['Overdue','Not Paid','Partially Paid','Fully Paid','Long Overdue']});
});
test('card 251: a replay or any other filter shape is refused',()=>{
 assert.throws(()=>targetUnclassifiedQuery(targetUnclassifiedQuery(card251)),/exactly the four R025 statuses/,'replay');
 const stage=card251.stages[0],f=stage.filters[0];
 for(const bad of [{...card251,stages:[{...stage,'source-card':78}]},{...card251,stages:[{...stage,filters:[f,f]}]},{...card251,stages:[{...stage,filters:[['and',f[1],f[2]]]}]},
  {...card251,stages:[{...stage,filters:[[f[0],f[1],[f[2][0],f[2][1],['field',f[2][2][1],'Other Column'],...f[2].slice(3)]]]}]},{...card251,stages:[stage,stage]},{database:2,type:'native',native:{query:'SELECT 1'}}])
  assert.throws(()=>targetUnclassifiedQuery(bad),/unclassified filter/,JSON.stringify(bad).slice(0,100));
 assert.throws(()=>targetUnclassifiedQuery({...card251,stages:[{...stage,filters:[[f[0],f[1],[...f[2].slice(0,4)]]]}]}),/exactly the four R025 statuses/);
});
