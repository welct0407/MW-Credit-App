import test from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';
import {LIVE_ROW_CARDS,writeOffRow,liveIncomeRow,writeOffIncomeRow} from '../../project/scripts/metabase/WriteOffSegregation.mjs';
import {privateDirFor,root} from '../../project/scripts/metabase/ReportingApi.mjs';
// R116 PROD: live dashboard 3 tab 16 has, since 28 October 2026, a scalar row of four width-6 cards (168, 169, 170, 171).
// Refine-WriteOffSegregation.mjs accepts only that row, places the write-off question as a fifth card on the same grid row
// (5/5/5/5/4) and reads back exactly that; the Metabase private directory never resolves inside the repository.
const card=(id,col,row,w,h,tab=16,extra={})=>({id:1000+id,card_id:id,dashboard_tab_id:tab,col,row,size_x:w,size_y:h,parameter_mappings:[],visualization_settings:{},...extra});
const live=(row=3,h=3)=>[card(168,0,row,6,h),card(169,6,row,6,h),card(170,12,row,6,h),card(171,18,row,6,h),
 card(184,0,row+h,16,6),card(204,0,row+h+6,24,6),{id:9,card_id:null,dashboard_tab_id:16,col:0,row:1,size_x:24,size_y:2},card(55,0,3,24,3,4)];
const applied=(writeoffs,row=3,h=3)=>[...live(row,h).filter(c=>!LIVE_ROW_CARDS.includes(c.card_id)),
 ...writeOffRow(writeoffs).map(([id,,col,w])=>card(id,col,row,w,h))];

test('the live four-card row is accepted wherever it sits, and its grid row is returned',()=>{
 assert.deepEqual(liveIncomeRow(live()),{row:3,height:3});
 assert.deepEqual(liveIncomeRow(live(5,4)),{row:5,height:4});
 assert.deepEqual(liveIncomeRow([...live()].reverse()),{row:3,height:3},'order of the dashcards does not matter');
});
test('any other shape fails closed',()=>{
 const shapes={
  'the old three-card canonical row':[card(168,0,3,8,3),card(169,8,3,8,3),card(170,16,3,8,3),card(171,16,6,8,3)],
  'a card of another width':live().map(c=>c.card_id===171?{...c,size_x:5}:c),
  'cards on two grid rows':live().map(c=>c.card_id===170?{...c,row:4}:c),
  'cards of two heights':live().map(c=>c.card_id===168?{...c,size_y:2}:c),
  'a missing card':live().filter(c=>c.card_id!==171),
  'a swapped order':live().map(c=>c.card_id===168?{...c,col:6}:c.card_id===169?{...c,col:0}:c),
  'another card sharing the row':[...live(),card(999,0,4,6,1)],
  'a duplicate placement':[...live(),card(170,12,9,6,3)],
  'the row already applied':applied(301),
 };
 for(const [label,dashcards] of Object.entries(shapes))assert.throws(()=>liveIncomeRow(dashcards),/live four-card layout/,label);
 assert.throws(()=>liveIncomeRow(live().map(c=>({...c,dashboard_tab_id:15}))),/live four-card layout/,'the row must be on tab 16');
});
test('the R116 row: five cards on one line of the 24-column grid, the equation then the average',()=>{
 const row=writeOffRow(301);
 assert.deepEqual(row.map(([id])=>id),[168,169,301,170,171]);
 assert.deepEqual(row.map(([,,col,w])=>[col,w]),[[0,5],[5,5],[10,5],[15,5],[20,4]]);
 assert.equal(row.reduce((n,[,,,w])=>n+w,0),24);
 assert.ok(row.every(([,,col],i)=>i===0||col===row[i-1][2]+row[i-1][3]),'contiguous');
});
test('the applied row is read back on the live grid row only; other shapes refuse',()=>{
 assert.deepEqual(writeOffIncomeRow(applied(301),301),{row:3,height:3});
 assert.deepEqual(writeOffIncomeRow(applied(301,5,4),301,16,{row:5,height:4}),{row:5,height:4});
 assert.throws(()=>writeOffIncomeRow(applied(301,5,4),301,16,{row:3,height:3}),/five-card layout/,'moved off the live grid row');
 assert.throws(()=>writeOffIncomeRow(live(),301),/five-card layout/,'not applied');
 assert.throws(()=>writeOffIncomeRow(applied(301).map(c=>c.card_id===171?{...c,size_x:6}:c),301),/five-card layout/,'wrong width');
 assert.throws(()=>writeOffIncomeRow(applied(301),302),/five-card layout/,'another write-off question');
});
test('the private directory: the env as given or with a name, else under ~/.mw-private, never inside the repository',()=>{
 const repo=path.resolve(root,'..'),home='/home/synthetic';
 assert.equal(privateDirFor('r116-writeoff-segregation',{under:true,env:{},home,repo}),'/home/synthetic/.mw-private/MW-Credit-App/metabase/r116-writeoff-segregation');
 assert.equal(privateDirFor('loan-reports-redesign-20261026',{env:{},home,repo}),'/home/synthetic/.mw-private/MW-Credit-App/metabase/loan-reports-redesign-20261026');
 assert.equal(privateDirFor('r116-writeoff-segregation',{under:true,env:{MW_METABASE_PRIVATE_DIR:'/srv/private'},home,repo}),'/srv/private/r116-writeoff-segregation');
 assert.equal(privateDirFor('loan-reports-redesign-20261026',{env:{MW_METABASE_PRIVATE_DIR:'/srv/private/lrr'},home,repo}),'/srv/private/lrr');
 for(const bad of ['C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922','relative/dir',repo,path.join(repo,'project/outputs/private')])
  assert.throws(()=>privateDirFor('x',{env:{MW_METABASE_PRIVATE_DIR:bad},home,repo}),/absolute path outside the repository/,bad);
 assert.throws(()=>privateDirFor('x',{env:{},home:repo,repo}),/outside the repository/,'a home inside the checkout');
});
