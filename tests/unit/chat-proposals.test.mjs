// R106 D2/D4/D8: the command catalogue, the host fill, canonical validation and the server-built card
// (services/chat/proposals.mjs, assets/command-catalogue.json), and one proposal per turn in the tool bridge.
// A fake command service answers the screens' reads; synthetic ids and amounts only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalOperation} from '../../services/contracts/operation-command.mjs';
import {canonicalCommand} from '../../services/contracts/payment-command.mjs';
import {loadCatalogue,catalogueView,createProposalPlanner,fieldValue} from '../../services/chat/proposals.mjs';
import {createChatTools,WRITE_TOOLS,TOOLS} from '../../services/chat/tools.mjs';
import {ToolError} from '../../services/chat/errors.mjs';

const V='a'.repeat(64),W='b'.repeat(64);
const ids=()=>{let n=0;return ()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;};
/** A fake command service: GET routes from a map; every call is recorded. */
function service(routes){
 const calls=[];
 const answer=(method,path,body)=>{calls.push([method,path,body]);const value=routes[`${method} ${path}`];if(!value)return {status:404,data:{ok:false,code:'not_found'}};return typeof value==='function'?value(body):value;};
 return {calls,client:{get:async path=>answer('GET',path),post:async(path,body)=>answer('POST',path,body)}};
}
const ok=data=>({status:200,data});
const loanItem={id:'L1',borrowerId:'B1',loanDate:'2026-10-01',principal:'10000.00',transferFee:null,disbursingAccountId:'CA1',type:'ดอกเบี้ยรายวัน',dueDate:null,dailyPayment:null,
 fixedInterest:null,currentDailyInterest:'100.00',paymentInterval:1,arrangement:null,autoChargeEnabled:true,scheduleAnchor:null,borrowerDisplayName:'Somchai (synthetic)',version:V};
const accounts={referrers:[],accounts:[{id:'CA1',label:'Cash box'},{id:'CA2',label:'KBank'}]};
const base={'GET /api/loan-records/L1':ok({item:loanItem}),'GET /api/borrower-options':ok(accounts),'GET /api/borrower-records/B1':ok({item:{id:'B1',name:'สมชาย',description:'Somchai'}})};

test('catalogue: every sample canonicalizes and the list matches the command contracts minus the exclusions',()=>{
 const catalogue=loadCatalogue();
 for(const entry of catalogue.entries.values()){
  if(entry.kind==='payment')assert.doesNotThrow(()=>canonicalCommand(entry.sample),entry.operation);
  else assert.equal(canonicalOperation(entry.sample).operation,entry.operation);
  for(const field of entry.fields)assert.ok(field.label?.en&&field.label?.th,`${entry.operation}.${field.name} label`);
  assert.ok(entry.label.en&&entry.label.th&&entry.description,entry.operation);
 }
 // The operation list of canonicalOperation (the literal list and the three exported management lists).
 const source=readFileSync(new URL('../../services/contracts/operation-command.mjs',import.meta.url),'utf8');
 const literal=JSON.parse('['+/\.\.\.managementOperations,([^\]]+)\]\.includes\(input\.operation\)/.exec(source)[1].replaceAll("'",'"')+']');
 const contract=new Set(['cash-openings.initialize','assessment.create','assessment.update','assessment.refresh','assessment.delete','analytics.refresh',
  ...['capital-contribution','cash-movement'].flatMap(k=>['create','update','delete'].map(a=>`${k}.${a}`)),'settlement.create','settlement.update','settlement.complete','settlement.reverse','settlement.cancel','settlement.settle-all',
  ...['cash-holder','cash-account','partner'].flatMap(k=>['create','update','delete'].map(a=>`${k}.${a}`)),...literal]);
 for(const operation of contract)assert.doesNotThrow(()=>{try{canonicalOperation({requestId:'00000000-0000-4000-8000-000000000001',operation,targetId:'x',expectedVersion:V,predecessorRequestId:null,inputs:{},receiptId:null});}catch(e){if(e.message!=='invalid_request')throw e;}});
 const excluded=['partner.create','partner.update','partner.delete','cash-openings.initialize'];
 const operations=[...catalogue.entries.values()].filter(e=>e.kind==='operation').map(e=>e.operation).sort();
 assert.deepEqual(operations,[...contract].filter(op=>!excluded.includes(op)).sort());
 assert.ok(catalogue.entries.has('payment.record'));
 for(const operation of excluded)assert.ok(Object.hasOwn(catalogue.excluded,operation));
 // Every delete, settlement reverse/cancel and loan default stays included, flagged destructive.
 for(const entry of catalogue.entries.values())if(entry.operation.endsWith('.delete')||['settlement.reverse','settlement.cancel','loan.default'].includes(entry.operation))
  assert.ok(entry.destructive&&entry.consequences.includes('destructive'),entry.operation);
});

test('catalogue view: the operation list and one operation, host fields marked',()=>{
 const catalogue=loadCatalogue();
 const list=catalogueView(catalogue,'');assert.equal(list.operations.length,catalogue.entries.size);assert.ok(list.excluded.includes('partner.update'));
 const close=catalogueView(catalogue,'loan.close');
 assert.deepEqual(close.fields.map(f=>[f.name,!!f.host]),[['paymentDate',true],['cashAccountId',false],['paymentMethod',false],['notes',false],['expectedAmount',true]]);
 assert.throws(()=>catalogueView(catalogue,'partner.update'),/UNSUPPORTED_OPERATION/);
 assert.throws(()=>catalogueView(catalogue,'loan.explode'),/UNKNOWN_OPERATION/);
});

test('field values: the command contract forms from the model and from the screen read',()=>{
 const f=(type,extra={})=>({name:'x',type,...extra});
 assert.equal(fieldValue(f('money'),'10000.00',{fromItem:true}),'10000');assert.equal(fieldValue(f('money'),1500),'1500');assert.equal(fieldValue(f('money'),'12.50'),'12.5');
 assert.throws(()=>fieldValue(f('money'),'1,000'),/INVALID_FIELD:x/);assert.throws(()=>fieldValue(f('money'),'1.234'),/INVALID_FIELD/);
 assert.equal(fieldValue(f('whole'),'1500.00',{fromItem:true}),'1500');assert.throws(()=>fieldValue(f('whole'),'15.5',{fromItem:true}),/FIELD_UNREADABLE:x/);
 assert.equal(fieldValue(f('signed-whole'),'-50'),'-50');assert.throws(()=>fieldValue(f('signed-whole'),'0'));
 assert.equal(fieldValue(f('date'),'2026-10-30'),'2026-10-30');assert.throws(()=>fieldValue(f('date'),'30-Oct-2026'));assert.throws(()=>fieldValue(f('date'),'2026-02-30'));
 assert.equal(fieldValue(f('enum',{values:['A']}),'A'),'A');assert.throws(()=>fieldValue(f('enum',{values:['A']}),'B'));
 assert.equal(fieldValue(f('text'),''),null);assert.equal(fieldValue(f('integer'),'7',{fromItem:true}),7);assert.throws(()=>fieldValue(f('boolean'),'yes'));
});

test('loan.update: the host fills ids and the version; only the stated field changes; the card shows before and after',async()=>{
 const {client,calls}=service(base);
 const planner=createProposalPlanner({client,actor:{partnerId:'P1'},newId:ids()});
 const value=await planner.propose({operation:'loan.update',target:'L1',values:{currentDailyInterest:'120'}});
 const command=JSON.parse(value.command);
 assert.deepEqual(canonicalOperation(command),command);
 assert.equal(command.requestId,value.id);assert.equal(command.targetId,'L1');assert.equal(command.expectedVersion,V);assert.equal(command.predecessorRequestId,null);assert.equal(command.receiptId,null);
 assert.equal(command.inputs.currentDailyInterest,'120');assert.equal(command.inputs.principal,'10000');assert.equal(command.inputs.scheduleAnchor,null);
 assert.deepEqual(value.card.changes,[{field:'currentDailyInterest',label:{en:'Daily interest',th:'ดอกเบี้ยรายวัน'},type:'money',before:'100',after:'120'}]);
 assert.equal(value.card.target.label,'Somchai (synthetic)');assert.equal(value.card.destructive,false);assert.deepEqual(value.card.consequences,[]);
 assert.deepEqual(value.card.confirmLabel,{en:'Edit loan',th:'แก้ไขสินเชื่อ'});
 assert.equal(value.card.values.find(v=>v.field==='disbursingAccountId').display,'Cash box');
 assert.equal(value.card.values.find(v=>v.field==='borrowerId').display,'สมชาย - Somchai');
 assert.ok(calls.every(([method])=>method==='GET'),'a proposal only reads');
 await assert.rejects(planner.propose({operation:'loan.update',target:'L1',values:{currentDailyInterest:'100.00'}}),/NO_CHANGE/);
 await assert.rejects(planner.propose({operation:'loan.update',target:'L9',values:{principal:'1'}}),/TARGET_NOT_FOUND/);
 await assert.rejects(planner.propose({operation:'loan.update',target:'',values:{principal:'1'}}),/TARGET_REQUIRED/);
});

test('model-supplied host fields, unknown fields, unknown and excluded operations are refused',async()=>{
 const {client}=service(base);
 const planner=createProposalPlanner({client,actor:{partnerId:'P1'},newId:ids()});
 for(const key of ['requestId','expectedVersion','targetId','predecessorRequestId','receiptId','allocations'])
  await assert.rejects(planner.propose({operation:'loan.update',target:'L1',values:{[key]:'x'}}),new RegExp(`HOST_FIELD:${key}`));
 await assert.rejects(planner.propose({operation:'loan.close',target:'L1',values:{expectedAmount:'1',cashAccountId:'CA1',paymentMethod:'Cash'}}),/HOST_FIELD:expectedAmount/);
 await assert.rejects(planner.propose({operation:'payment.record',target:'B1',values:{amountReceived:'100',paymentMethod:'Cash',allocations:[]}}),/HOST_FIELD:allocations/);
 await assert.rejects(planner.propose({operation:'loan.update',target:'L1',values:{colour:'red'}}),/UNKNOWN_FIELD:colour/);
 await assert.rejects(planner.propose({operation:'loan.update',target:'L1',values:{principal:'1,000'}}),/INVALID_FIELD:principal/);
 for(const [operation,values] of [['partner.update',{}],['partner.create',{}],['cash-openings.initialize',{}],['payment.correct',{receiptMode:'replace'}],['analytics.refresh',{mode:'Full'}]])
  await assert.rejects(planner.propose({operation,target:'X',values}),/UNSUPPORTED_OPERATION/,operation);
 await assert.rejects(planner.propose({operation:'loan.explode',target:'L1',values:{}}),/UNKNOWN_OPERATION/);
});

test('creates: a host UUID target, required fields named, defaults applied; deletes are destructive',async()=>{
 const {client}=service({...base,'GET /api/expense-records/E1':ok({item:{id:'E1',category:'Other / อื่น ๆ',version:W}})});
 const planner=createProposalPlanner({client,actor:{partnerId:'P1'},newId:ids()});
 const created=await planner.propose({operation:'expense.create',target:'',values:{expenseDate:'2026-10-30',category:'Transportation / ค่าเดินทาง',amount:'150',paidByAccountId:'CA2'}});
 const command=JSON.parse(created.command);
 assert.match(command.targetId,/^[0-9a-f-]{36}$/);assert.notEqual(command.targetId,created.id);assert.equal(command.expectedVersion,null);
 assert.deepEqual(created.card.changes,[]);assert.deepEqual(created.card.values.map(v=>v.field),['expenseDate','category','amount','paidByAccountId']);
 await assert.rejects(planner.propose({operation:'expense.create',target:'',values:{category:'Other / อื่น ๆ',amount:'150'}}),/MISSING_FIELD:expenseDate/);
 const holder=JSON.parse((await planner.propose({operation:'cash-holder.create',target:'',values:{holderName:'Synthetic'}})).command);
 assert.deepEqual(holder.inputs,{holderName:'Synthetic',active:true,sortOrder:1});
 const deletion=await planner.propose({operation:'expense.delete',target:'E1',values:{}});
 assert.equal(deletion.card.destructive,true);assert.deepEqual(deletion.card.consequences,[{code:'destructive'}]);
 assert.deepEqual(JSON.parse(deletion.command).inputs,{});assert.equal(JSON.parse(deletion.command).expectedVersion,W);
});

test('loan.close: the payoff, plan hash and date come from the close preview; the payoff consequence',async()=>{
 const {client}=service({...base,'GET /api/loan-records/L1/close-preview':ok({sourceVersion:W,businessDate:'2026-10-30',amount:'10300',planHash:'c'.repeat(64),accounts:accounts.accounts})});
 const planner=createProposalPlanner({client,actor:{partnerId:'P1'},newId:ids()});
 const value=await planner.propose({operation:'loan.close',target:'L1',values:{cashAccountId:'CA1',paymentMethod:'Cash'}});
 const command=JSON.parse(value.command);
 assert.equal(command.expectedVersion,W);
 assert.deepEqual(command.inputs,{paymentDate:'2026-10-30',cashAccountId:'CA1',paymentMethod:'Cash',notes:null,expectedAmount:'10300',expectedPlanHash:'c'.repeat(64)});
 assert.deepEqual(value.card.consequences,[{code:'loan_close_payoff',amount:'10300'}]);
 assert.deepEqual(value.card.confirmLabel,{en:'Close for ฿10,300',th:'ปิดยอด ฿10,300'});
 assert.equal(value.card.values.some(v=>v.field==='expectedPlanHash'),false,'the hash is not shown');
 assert.equal(value.card.target.label,'Somchai (synthetic)');
});

test('payment.correct keeps the plan and replaces it with the stated changes; payment.delete carries the payment head',async()=>{
 const preview={item:{sourceVersion:W,predecessorRequestId:'11111111-1111-4111-8111-111111111111',origin:'pwa-plan',proposedBorrowerLabel:'Somchai',
  source:{borrowerId:'B1',amountReceived:'300.00',paymentDate:'2026-10-29',paymentMethod:'Cash',cashAccountId:'CA1',notes:null,allocationMethod:'Selected Charges',targetChargeId:null,targetLoanId:null},
  effectivePlan:{allocations:[{chargeId:'C1',principal:'0',interest:'300',expectedPrincipalRemaining:'0',expectedInterestRemaining:'300',chargeDate:'2026-10-29'}]},
  balances:[{chargeId:'C1',principalRemaining:'0.00',interestRemaining:'300.00',chargeDate:'2026-10-29'}]}};
 const {client}=service({...base,'GET /api/payment-records/PM1/correction-preview':ok(preview)});
 const planner=createProposalPlanner({client,actor:{partnerId:'P1'},newId:ids()});
 const value=await planner.propose({operation:'payment.correct',target:'PM1',values:{paymentMethod:'Bank Transfer',cashAccountId:'CA2'}});
 const command=JSON.parse(value.command);
 assert.equal(command.predecessorRequestId,'11111111-1111-4111-8111-111111111111');assert.equal(command.expectedVersion,W);
 assert.equal(command.inputs.kind,'pwa-plan');assert.equal(command.inputs.receiptMode,'preserve');assert.equal(command.inputs.closePreparationHash,null);
 assert.deepEqual(command.inputs.fields.allocations,[{chargeId:'C1',principal:'0',interest:'300',expectedPrincipalRemaining:'0',expectedInterestRemaining:'300',chargeDate:'2026-10-29'}]);
 assert.deepEqual(value.card.changes.map(c=>[c.field,c.before,c.after]),[['paymentMethod','Cash','Bank Transfer'],['cashAccountId','CA1','CA2']]);
 assert.deepEqual(value.card.consequences,[{code:'replaces_plan'}]);
 await assert.rejects(planner.propose({operation:'payment.correct',target:'PM1',values:{}}),/NO_CHANGE/);
 await assert.rejects(planner.propose({operation:'payment.correct',target:'PM1',values:{amountReceived:'1'}}),/UNKNOWN_FIELD:amountReceived/);
 const deletion=JSON.parse((await planner.propose({operation:'payment.delete',target:'PM1',values:{}})).command);
 assert.equal(deletion.predecessorRequestId,'11111111-1111-4111-8111-111111111111');assert.equal(deletion.expectedVersion,W);
});

test('host reads: loan default date, next charge booking, settle-all amount, preferences and recent analytics',async()=>{
 const {client}=service({...base,'GET /api/loan-options':ok({businessDate:'2026-10-30',accounts:[]}),
  'GET /api/payment-drafts/B1?scope=all':ok({charges:[],bookable:[{id:'cg8:2:L1:2026-11-06',loanId:'L1',chargeDate:'2026-11-06',principalRemaining:'0',interestRemaining:'700',bookVersion:W}]}),
  'GET /api/management/partners/P2':ok({item:{id:'P2',label:'Partner Two',netAvailableToSettle:'2500.00'}}),
  'GET /api/preferences':ok({item:{id:'P1',language:'English',statementAccountId:null,statementDate:null,version:V}}),
  'GET /api/management/analytics-overview':ok({refreshTarget:{id:'stat-1',version:W}})});
 const planner=createProposalPlanner({client,actor:{partnerId:'P1'},newId:ids()});
 assert.deepEqual(JSON.parse((await planner.propose({operation:'loan.default',target:'L1',values:{}})).command).inputs,{businessDate:'2026-10-30'});
 const book=JSON.parse((await planner.propose({operation:'loan.book-projected-charge',target:'L1',values:{}})).command);
 assert.deepEqual([book.expectedVersion,book.inputs],[W,{chargeDate:'2026-11-06',principalDue:'0',interestDue:'700'}]);
 const settle=await planner.propose({operation:'settlement.settle-all',target:'P2',values:{}});
 assert.deepEqual(JSON.parse(settle.command).inputs,{partnerId:'P2',reviewedAmount:'2500',notes:null});assert.equal(settle.card.target.label,'Partner Two');
 const preference=JSON.parse((await planner.propose({operation:'preference.update',target:'',values:{language:'ไทย'}})).command);
 assert.deepEqual([preference.targetId,preference.expectedVersion,preference.inputs],['P1',V,{language:'ไทย',statementAccountId:null,statementDate:null}]);
 const refresh=JSON.parse((await planner.propose({operation:'analytics.refresh',target:'',values:{}})).command);
 assert.deepEqual([refresh.targetId,refresh.expectedVersion,refresh.inputs],['stat-1',W,{mode:'Recent'}]);
 await assert.rejects(createProposalPlanner({client,actor:{partnerId:'P9'},newId:ids()}).propose({operation:'preference.update',target:'',values:{language:'ไทย'}}),/TARGET_NOT_FOUND/);
});

test('tool bridge: write tools only with writes; one group per turn; the proposal is an observation; changes[] shape',async()=>{
 const actor={issuer:'iss',subject:'s',partnerId:'P1'};
 const readOnly=createChatTools({readProvider:{},sqlTool:{},actor});
 assert.deepEqual(readOnly.specs().map(t=>t.name),TOOLS.map(t=>t.name));
 let proposals=0;const seen=[];
 const writes={catalogue:op=>({operations:[op]}),propose:async input=>{proposals++;seen.push(input);if(input.changes[0].operation==='bad')throw new ToolError('NO_CHANGE');return {proposals:[{id:'p',card:{values:[{value:'1500'}]}}]};}};
 const tools=createChatTools({readProvider:{},sqlTool:{},actor,writes});
 assert.deepEqual(tools.specs().map(t=>t.name),[...TOOLS,...WRITE_TOOLS].map(t=>t.name));
 assert.deepEqual(Object.keys(WRITE_TOOLS[1].inputSchema.properties),['changes']);
 const call=(name,args,id)=>({name,args,id}),change=(operation,inputs='{}')=>({operation,target_id:'L1',inputs});
 // A failed proposal does not use the turn's one group; malformed changes are refused before any read.
 let results=await tools.runRound([call('propose_action',{changes:[change('bad')]},'1')],{deadline:Date.now()+5000,round:1});
 assert.deepEqual(results.map(r=>r.value),['NO_CHANGE']);
 results=await tools.runRound([call('propose_action',{changes:[change('x','not json')]},'2'),call('propose_action',{changes:[change('x','[1]')]},'2b'),call('propose_action',{changes:[]},'2c'),
  call('propose_action',{changes:Array.from({length:21},()=>change('loan.update'))},'2d'),call('propose_action',{changes:[{operation:'x',target_id:'L1'}]},'2e')],{deadline:Date.now()+5000,round:1});
 assert.deepEqual(results.map(r=>r.value),['INVALID_VALUES','INVALID_VALUES','NO_CHANGES','TOO_MANY_CHANGES','INVALID_CHANGES']);
 results=await tools.runRound([call('propose_action',{changes:[change('loan.update','{"principal":"1500"}'),change('charge.update','{"notes":"x"}')]},'3'),call('propose_action',{changes:[change('loan.update')]},'4')],{deadline:Date.now()+5000,round:2});
 assert.equal(results[0].error,false);assert.equal(results[0].value.observation,'observation-1');assert.equal(results[1].value,'ONE_PROPOSAL_PER_TURN');
 assert.deepEqual(seen.at(-1),{changes:[{operation:'loan.update',target:'L1',values:{principal:'1500'}},{operation:'charge.update',target:'L1',values:{notes:'x'}}]});
 results=await tools.runRound([call('action_catalogue',{operation:''},'5')],{deadline:Date.now()+5000,round:3});
 assert.deepEqual(results[0].value,{operations:['']});
 assert.equal(proposals,2);assert.ok(tools.observations['observation-1'].proposals);
});

test('opening request: recent_actions only for a turn that may propose (D10); the prompt keeps one system text',async()=>{
 const {openingRequest,ASSISTANT_INSTRUCTIONS}=await import('../../services/chat/prompt.mjs');
 const base={partnerLanguage:'English',asOf:'2026-10-30T10:00:00.000000+07:00',text:'Did it work?'};
 assert.deepEqual(Object.keys(JSON.parse(openingRequest(base))),['partner_language','as_of','request']);
 const rows=[{operation:'expense.create',target:null,state:'done',code:null,settled_at:'2026-10-30T03:00:00.000Z'}];
 assert.deepEqual(JSON.parse(openingRequest({...base,recentActions:rows})).recent_actions,rows);
 assert.match(ASSISTANT_INSTRUCTIONS,/I can only read records for you; use the app screens\./);
 assert.match(ASSISTANT_INSTRUCTIONS,/explicitly asks for it/);assert.match(ASSISTANT_INSTRUCTIONS,/never a split/);assert.match(ASSISTANT_INSTRUCTIONS,/ONE propose_action call/);assert.match(ASSISTANT_INSTRUCTIONS,/only change for its borrower/);
});

test('CWR-05: a Partner who may not propose has propose_action only, answering REVIEWER_REQUIRED without any read',async()=>{
 const {REVIEWER_REQUIRED}=await import('../../services/chat/tools.mjs');
 const reads=[];const readProvider={catalogue:async()=>{reads.push('catalogue');return {}},query:async()=>{reads.push('query');return {rows:[]}}};
 const tools=createChatTools({readProvider,sqlTool:{query:async()=>{reads.push('sql');return {}}},actor:{issuer:'i',subject:'s',partnerId:'P2'},writes:{refuse:true}});
 assert.deepEqual(tools.specs().map(t=>t.name),[...TOOLS.map(t=>t.name),'propose_action']);
 const [result,catalogue]=await tools.runRound([{name:'propose_action',args:{changes:[{operation:'loan.delete',target_id:'L1',inputs:'{}'}]},id:'1'},{name:'action_catalogue',args:{operation:''},id:'2'}],{deadline:Date.now()+5000,round:1});
 assert.equal(result.error,false);assert.equal(result.value.code,'REVIEWER_REQUIRED');assert.equal(result.value.changed,false);
 assert.deepEqual(result.value.message,REVIEWER_REQUIRED.message);assert.ok(REVIEWER_REQUIRED.message.th.length>10);
 assert.equal(catalogue.value,'UNSUPPORTED_TOOL_OR_ARGUMENTS');assert.deepEqual(reads,[]);
 const {ASSISTANT_INSTRUCTIONS}=await import('../../services/chat/prompt.mjs');assert.match(ASSISTANT_INSTRUCTIONS,/REVIEWER_REQUIRED, reply with its message text verbatim/);
 assert.deepEqual(confirmLabelOf('payment.record',{amountReceived:'1234567'}),{en:'Record ฿1,234,567',th:'บันทึก ฿1,234,567'});
 assert.equal(confirmLabelOf('payment.record',{}),null);
});
import {confirmLabel} from '../../services/chat/proposals.mjs';
const confirmLabelOf=(operation,values)=>confirmLabel(loadCatalogue().entries.get(operation),values);

// D12: groups ("One card, Confirm all"). Oum's six loans each have one charge to edit (synthetic ids).
const oumCharges=Object.fromEntries([1,2,3,4,5,6].map(n=>[`GET /api/charge-records/C${n}`,ok({item:{id:`C${n}`,loanId:`L${n}`,chargeDate:'2026-10-29',principalDue:'0.00',interestDue:'100.00',
 notes:'Carry-forward note '.repeat(20).trim(),borrowerId:'B-OUM',borrowerName:'Oum',borrowerDescription:null,version:V}})]));
const sixEdits=()=>[1,2,3,4,5,6].map(n=>({operation:'charge.update',target:`C${n}`,values:{interestDue:'150'}}));
test('D12: six charge edits become one group of six lines with card.group indexes; only changed fields are changes',async()=>{
 const {client}=service({...base,...oumCharges});
 const lines=await createProposalPlanner({client,actor:{partnerId:'P1'},newId:ids()}).proposeGroup(sixEdits());
 assert.equal(lines.length,6);
 const head=lines[0].id;
 lines.forEach((line,index)=>{
  assert.deepEqual(line.card.group,{id:head,index,count:6,ids:lines.map(l=>l.id)});
  const command=JSON.parse(line.command);assert.equal(command.requestId,line.id);assert.equal(command.targetId,`C${index+1}`);assert.equal(command.expectedVersion,V);
  assert.deepEqual(line.card.changes.map(c=>[c.field,c.before,c.after]),[['interestDue','100','150']]);
  assert.equal(line.card.changes.some(c=>c.field==='notes'),false,'the unchanged long note is not a change');
 });
 assert.equal(new Set(lines.map(l=>l.id)).size,6);assert.equal('scope' in lines[0],false);
});
test('CW3-01: destructive lines come first in the group; the rest keep their order',async()=>{
 const {client}=service({...base,...oumCharges});
 const lines=await createProposalPlanner({client,actor:{partnerId:'P1'},newId:ids()}).proposeGroup([sixEdits()[0],sixEdits()[1],{operation:'charge.delete',target:'C3',values:{}},sixEdits()[3]]);
 assert.deepEqual(lines.map(l=>[l.operation,l.card.target.id,l.card.destructive,l.card.group.index]),
  [['charge.delete','C3',true,0],['charge.update','C1',false,1],['charge.update','C2',false,2],['charge.update','C4',false,3]]);
 assert.equal(lines[0].card.group.id,lines[0].id);assert.deepEqual(lines[1].card.group.ids,lines.map(l=>l.id));
});
test('D12: refusals: 21 lines, the same target twice, a line using a record another line creates, a payment or close with edits for its borrower',async()=>{
 const drafts={'POST /api/payment-drafts/B-OUM/select-all':ok({businessDate:'2026-10-30',borrower:{id:'B-OUM',displayName:'Oum'},charges:[{id:'C1',chargeDate:'2026-10-29',loanDisplayKey:'k',principalRemaining:'0',interestRemaining:'100',amountRemaining:'100'}],accounts:[{id:'CA1',label:'Cash box'}],preferredReceivingAccountId:'CA1'}),
  'POST /api/payment-drafts/B-OUM/auto-assign':ok({charges:[],allocations:[{chargeId:'C1',principal:'0',interest:'100',expectedPrincipalRemaining:'0',expectedInterestRemaining:'100',chargeDate:'2026-10-29'}],unallocated:'0'}),
  'POST /api/payment-drafts/B-OUM/review':ok({}),
  'GET /api/loan-records/L1/close-preview':ok({sourceVersion:W,businessDate:'2026-10-30',amount:'10300',planHash:'c'.repeat(64),plan:{borrowerId:'B-OUM'}})};
 const planner=()=>createProposalPlanner({client:service({...base,...oumCharges,...drafts}).client,actor:{partnerId:'P1'},newId:ids()});
 await assert.rejects(planner().proposeGroup(Array.from({length:21},(_,i)=>({operation:'charge.update',target:`C${i%6+1}`,values:{interestDue:'150'}}))),/^ToolError: TOO_MANY_CHANGES$/);
 await assert.rejects(planner().proposeGroup([]),/NO_CHANGES/);
 await assert.rejects(planner().proposeGroup([sixEdits()[0],{operation:'charge.update',target:'C1',values:{notes:null}}]),/DUPLICATE_TARGET:2/);
 await assert.rejects(planner().proposeGroup([{operation:'payment.record',target:'B-OUM',values:{amountReceived:'100',paymentMethod:'Cash'}},sixEdits()[1]]),/PAYMENT_LINE_ALONE:1/);
 await assert.rejects(planner().proposeGroup([sixEdits()[0],{operation:'loan.close',target:'L1',values:{cashAccountId:'CA1',paymentMethod:'Cash'}}]),/PAYMENT_LINE_ALONE:2/);
 await assert.rejects(planner().proposeGroup([{operation:'payment.record',target:'B-OUM',values:{amountReceived:'100',paymentMethod:'Cash'}},{operation:'payment.record',target:'B-OUM',values:{amountReceived:'100',paymentMethod:'Cash'}}]),/DUPLICATE_TARGET:2/);
 // ids(): line 1 takes request id 1 and creates loan id 2; line 2 names that loan.
 const newLoan='00000000-0000-4000-8000-000000000002';
 await assert.rejects(planner().proposeGroup([{operation:'loan.create',target:'',values:{borrowerId:'B1',loanDate:'2026-10-30',principal:'1000',disbursingAccountId:'CA1',type:'ดอกเบี้ยรายวัน'}},
  {operation:'charge.create',target:'',values:{loanId:newLoan,chargeDate:'2026-10-31',principalDue:'0',interestDue:'10'}}]),/DEPENDS_ON_NEW_RECORD:2/);
 await assert.rejects(planner().proposeGroup([sixEdits()[0],{operation:'charge.update',target:'C9',values:{interestDue:'1'}}]),/LINE_2:TARGET_NOT_FOUND/);
 // Fail closed: with a payment or close in the group, a line whose borrower cannot be read (lookup failed or absent) is refused.
 const unreadable=()=>createProposalPlanner({client:service({...base,...oumCharges,...drafts,'GET /api/loan-records/L-DOWN':()=>{throw new Error('lookup down')},
  'GET /api/loan-records/L2':ok({item:{...loanItem,id:'L2',borrowerId:undefined}}),'GET /api/loan-records/L2/close-preview':ok({sourceVersion:W,businessDate:'2026-10-30',amount:'500',planHash:'d'.repeat(64),plan:{}})}).client,actor:{partnerId:'P1'},newId:ids()});
 const pay={operation:'payment.record',target:'B-OUM',values:{amountReceived:'100',paymentMethod:'Cash'}};
 for(const loanId of ['L-DOWN','L-GONE'])
  await assert.rejects(unreadable().proposeGroup([pay,{operation:'charge.create',target:'',values:{loanId,chargeDate:'2026-10-31',principalDue:'0',interestDue:'10'}}]),/^ToolError: LINE_2:BORROWER_UNRESOLVED$/,loanId);
 await assert.rejects(unreadable().proposeGroup([sixEdits()[0],{operation:'loan.close',target:'L2',values:{cashAccountId:'CA1',paymentMethod:'Cash'}}]),/^ToolError: LINE_2:BORROWER_UNRESOLVED$/);
 // Without a payment or close the same line is fine (no borrower rule to apply), and a close alone needs no borrower.
 assert.equal((await unreadable().proposeGroup([sixEdits()[0],{operation:'charge.create',target:'',values:{loanId:'L-DOWN',chargeDate:'2026-10-31',principalDue:'0',interestDue:'10'}}])).length,2);
 assert.equal((await unreadable().proposeGroup([{operation:'loan.close',target:'L2',values:{cashAccountId:'CA1',paymentMethod:'Cash'}}])).length,1);
 // A payment alone, and edits of other borrowers mixed, are fine.
 assert.equal((await planner().proposeGroup([{operation:'payment.record',target:'B-OUM',values:{amountReceived:'100',paymentMethod:'Cash'}}])).length,1);
 assert.equal((await planner().proposeGroup([sixEdits()[0],{operation:'loan.update',target:'L1',values:{currentDailyInterest:'120'}}])).length,2);
});
