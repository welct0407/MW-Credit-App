import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LATE_COLUMN,LATE_SCALAR_SQL,r116Row,lateRow,r116IncomeRow,lateIncomeRow,assertLateRowCardsKept} from '../../project/scripts/metabase/LateCharges.mjs';
import {writeOffRow} from '../../project/scripts/metabase/WriteOffSegregation.mjs';
// R118 (V132): Refine-LateCharges.mjs accepts only the live R116 five-card row of dashboard 3 tab 16 (168, 169, the write-off
// question, 170, 171 at 5/5/5/5/4), fails closed without the write-off question id, and places the late-charge question as a
// sixth card with every card at width 4 on the same grid row. Snippet 2 returns the memo column last.
const W=301,L=402;
const card=(id,col,row,w,h,tab=16,extra={})=>({id:1000+id,card_id:id,dashboard_tab_id:tab,col,row,size_x:w,size_y:h,parameter_mappings:[{parameter_id:'review-income',card_id:id}],visualization_settings:{'card.title':'t'+id},...extra});
const r116=(row=3,h=3)=>[...r116Row(W).map(([id,,col,w])=>card(id,col,row,w,h)),card(184,0,row+h,16,6),card(204,0,row+h+6,24,6),{id:9,card_id:null,dashboard_tab_id:16,col:0,row:1,size_x:24,size_y:2},card(55,0,3,24,3,4)];
const applied=(row=3,h=3)=>[...r116(row,h).filter(c=>![168,169,W,170,171].includes(c.card_id)),...lateRow(W,L).map(([id,,col,w])=>card(id,col,row,w,h))];

test('the R118 row is R116 plus the memo card last, six cards of width 4 filling the 24 columns',()=>{
 assert.deepEqual(r116Row(W),writeOffRow(W),'the R116 row is the one Refine-WriteOffSegregation.mjs places');
 const row=lateRow(W,L);
 assert.deepEqual(row.map(([id])=>id),[168,169,W,170,171,L]);
 assert.deepEqual(row.map(([,,col,w])=>[col,w]),[[0,4],[4,4],[8,4],[12,4],[16,4],[20,4]]);
 assert.equal(row.reduce((n,[,,,w])=>n+w,0),24);
});
test('the live R116 row is accepted wherever it sits; anything else, or no write-off question, fails closed',()=>{
 assert.deepEqual(r116IncomeRow(r116(),W),{row:3,height:3});
 assert.deepEqual(r116IncomeRow([...r116(5,4)].reverse(),W),{row:5,height:4});
 assert.throws(()=>r116IncomeRow(r116(),undefined),/cards\.writeoffs/);
 assert.throws(()=>r116IncomeRow(r116(),null),/cards\.writeoffs/);
 const four=[card(168,0,3,6,3),card(169,6,3,6,3),card(170,12,3,6,3),card(171,18,3,6,3)];
 for(const [name,cards] of Object.entries({'the pre-R116 four-card row':four,'the R118 row already applied':applied(),'a card of another width':r116().map(c=>c.card_id===171?{...c,size_x:5}:c),
  'cards on two grid rows':r116().map(c=>c.card_id===170?{...c,row:4}:c),'another card sharing the row':[...r116(),card(999,0,4,6,1)],'a missing write-off card':r116().filter(c=>c.card_id!==W)}))
  assert.throws(()=>r116IncomeRow(cards,W),/R116 five-card/,name);
});
test('the applied row reads back on the R116 grid row; another row or shape throws',()=>{
 assert.deepEqual(lateIncomeRow(applied(),W,L),{row:3,height:3});
 assert.deepEqual(lateIncomeRow(applied(),W,L,16,{row:3,height:3}),{row:3,height:3});
 assert.throws(()=>lateIncomeRow(applied(),W,L,16,{row:4,height:3}),/six-card/);
 assert.throws(()=>lateIncomeRow(r116(),W,L),/six-card/);
 assert.throws(()=>lateIncomeRow(applied(),W,undefined),/six-card/);
});
test('the five R116 cards may move only col and width',()=>{
 assert.doesNotThrow(()=>assertLateRowCardsKept(r116(),applied(),W));
 assert.throws(()=>assertLateRowCardsKept(r116(),applied().map(c=>c.card_id===W?{...c,parameter_mappings:[]}:c),W),/card 301 changed parameter_mappings/);
 assert.throws(()=>assertLateRowCardsKept(r116(),applied().map(c=>c.card_id===168?{...c,row:9}:c),W),/card 168 changed row/);
});
test('snippet 2 returns the memo column last and Net Profit does not add it again',()=>{
 const snippet=readFileSync(new URL('../../project/scripts/metabase/live-income-period.sql',import.meta.url),'utf8');
 assert.match(snippet,/sum\(e\."Late Charges Received"\) FROM \{\{#186\}\}/);
 assert.match(snippet,/THEN latecharges END AS "Late Charges Received"\nFROM totals\s*$/);
 assert.match(snippet,/THEN income-expenses-writeoffs END AS "Net Profit"/);
 assert.equal(LATE_SCALAR_SQL,`SELECT "${LATE_COLUMN}" FROM statement`);
});
