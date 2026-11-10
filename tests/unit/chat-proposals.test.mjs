// R106 D2/D4/D8: the command catalogue, the host fill, canonical validation and the server-built card
// (services/chat/proposals.mjs, assets/command-catalogue.json), and one proposal per turn in the tool bridge.
// A fake command service answers the screens' reads; synthetic ids and amounts only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalOperation} from '../../services/contracts/operation-command.mjs';
import {canonicalCommand} from '../../services/contracts/payment-command.mjs';
import {loadCatalogue,catalogueView,createProposalPlanner,fieldValue,MAX_GROUP,GROUP_DEADLINE_MS} from '../../services/chat/proposals.mjs';
import {createChatTools,WRITE_TOOLS,TOOLS,PROPOSE_CHUNK} from '../../services/chat/tools.mjs';
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
 // R129 D9: the chat neither creates nor deletes a rebate settlement in this release; the operations are not in the
 // catalogue at all (command-catalogue.json unchanged), so the chat refuses them as unknown.
 // R136: the chat cannot post a loan rollover in this release (design 4.2); it is not in the catalogue either.
 const notChat=['rebate-settlement.create','rebate-settlement.delete','loan.rollover'];
 for(const operation of notChat)assert.ok(contract.has(operation)&&!catalogue.entries.has(operation)&&!Object.hasOwn(catalogue.excluded,operation),operation);
 const operations=[...catalogue.entries.values()].filter(e=>e.kind==='operation').map(e=>e.operation).sort();
 assert.deepEqual(operations,[...contract].filter(op=>!excluded.includes(op)&&!notChat.includes(op)).sort());
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

test('host reads: loan default date and loss amount, next charge booking, settle-all amount, preferences and recent analytics',async()=>{
 const {client}=service({...base,'GET /api/loan-records/L1':ok({item:{...loanItem,outstandingPrincipal:'7500.40'}}),'GET /api/loan-options':ok({businessDate:'2026-10-30',accounts:[]}),
  'GET /api/payment-drafts/B1?scope=all':ok({charges:[],bookable:[{id:'cg8:2:L1:2026-11-06',loanId:'L1',chargeDate:'2026-11-06',principalRemaining:'0',interestRemaining:'700',bookVersion:W}]}),
  'GET /api/management/partners/P2':ok({item:{id:'P2',label:'Partner Two',netAvailableToSettle:'2500.00'}}),
  'GET /api/preferences':ok({item:{id:'P1',language:'English',statementAccountId:null,statementDate:null,version:V}}),
  'GET /api/management/analytics-overview':ok({refreshTarget:{id:'stat-1',version:W}})});
 const planner=createProposalPlanner({client,actor:{partnerId:'P1'},newId:ids()});
 // R109: the loss amount defaults to the outstanding principal in whole baht (truncated) and keeps the unpaid charges.
 const loss=await planner.propose({operation:'loan.default',target:'L1',values:{}});
 assert.deepEqual(JSON.parse(loss.command).inputs,{businessDate:'2026-10-30',amount:'7500',keepCharges:true});
 assert.deepEqual(loss.card.confirmLabel,{en:'Record loss ฿7,500',th:'บันทึกหนี้สูญ ฿7,500'});
 assert.deepEqual(JSON.parse((await planner.propose({operation:'loan.default',target:'L1',values:{amount:'2000',keepCharges:false}})).command).inputs,{businessDate:'2026-10-30',amount:'2000',keepCharges:false});
 await assert.rejects(planner.propose({operation:'loan.default',target:'L1',values:{amount:'20.5'}}),/INVALID_FIELD:amount/);
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
 assert.deepEqual(Object.keys(WRITE_TOOLS[1].inputSchema.properties),['changes','more']);assert.deepEqual(WRITE_TOOLS[1].inputSchema.required,['changes'],'more is optional');
 const call=(name,args,id)=>({name,args,id}),change=(operation,inputs='{}')=>({operation,target_id:'L1',inputs});
 // A failed proposal does not use the turn's one group; malformed changes are refused before any read.
 let results=await tools.runRound([call('propose_action',{changes:[change('bad')]},'1')],{deadline:Date.now()+5000,round:1});
 assert.deepEqual(results.map(r=>r.value),['NO_CHANGE']);
 results=await tools.runRound([call('propose_action',{changes:[change('x','not json')]},'2'),call('propose_action',{changes:[change('x','[1]')]},'2b'),call('propose_action',{changes:[]},'2c'),
  call('propose_action',{changes:Array.from({length:101},()=>change('loan.update'))},'2d'),call('propose_action',{changes:[{operation:'x',target_id:'L1'}]},'2e')],{deadline:Date.now()+5000,round:1});
 assert.deepEqual(results.map(r=>r.value),['INVALID_VALUES','INVALID_VALUES','NO_CHANGES','TOO_MANY_CHANGES','INVALID_CHANGES']);
 results=await tools.runRound([call('propose_action',{changes:[change('loan.update','{"principal":"1500"}'),change('charge.update','{"notes":"x"}')]},'3'),call('propose_action',{changes:[change('loan.update')]},'4')],{deadline:Date.now()+5000,round:2});
 assert.equal(results[0].error,false);assert.equal(results[0].value.observation,'observation-1');assert.equal(results[1].value,'ONE_PROPOSAL_PER_TURN');
 assert.deepEqual(seen.at(-1),{changes:[{operation:'loan.update',target:'L1',values:{principal:'1500'}},{operation:'charge.update',target:'L1',values:{notes:'x'}}],more:false});
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
 assert.match(ASSISTANT_INSTRUCTIONS,/explicitly asks for it/);assert.match(ASSISTANT_INSTRUCTIONS,/never a split/);assert.match(ASSISTANT_INSTRUCTIONS,/on ONE card/);assert.match(ASSISTANT_INSTRUCTIONS,/at most 25 changes, with more:true on every call but the last/);assert.match(ASSISTANT_INSTRUCTIONS,/If any propose_action call fails, nothing is held/);assert.match(ASSISTANT_INSTRUCTIONS,/only change for its borrower/);
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
const oumCharges=Object.fromEntries([1,2,3,4,5,6].map(n=>[`GET /api/charge-records/C${n}`,ok({item:{id:`C${n}`,loanId:`L${n}`,chargeDate:'2026-10-29',principalDue:'0.00',interestDue:'100.00',lateChargeDue:'0.00',
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
test('D12 (owner, 10 November 2026): a group of 100 lines is one card; MAX_GROUP is 100',async()=>{
 assert.equal(MAX_GROUP,100);
 const charges=Object.fromEntries(Array.from({length:100},(_,i)=>[`GET /api/charge-records/H${i+1}`,ok({item:{id:`H${i+1}`,loanId:'L1',chargeDate:'2026-10-29',principalDue:'0.00',interestDue:'100.00',lateChargeDue:'0.00',
  notes:null,borrowerId:'B-OUM',borrowerName:'Oum',borrowerDescription:null,version:V}})]));
 const {client}=service({...base,...charges});
 const lines=await createProposalPlanner({client,actor:{partnerId:'P1'},newId:ids()}).proposeGroup(Array.from({length:100},(_,i)=>({operation:'charge.update',target:`H${i+1}`,values:{interestDue:'150'}})));
 assert.equal(lines.length,100);assert.equal(new Set(lines.map(l=>l.id)).size,100);
 lines.forEach((line,index)=>{assert.deepEqual(line.card.group,{id:lines[0].id,index,count:100,ids:lines.map(l=>l.id)});assert.equal(line.card.target.id,`H${index+1}`);});
});
test('D12 chunks: planLines numbers lines across chunks; finishGroup builds one group of the summed lines; Confirm all runs 270 s',async()=>{
 const {client}=service({...base,...oumCharges});
 const planner=createProposalPlanner({client,actor:{partnerId:'P1'},newId:ids()});
 const edits=sixEdits();
 const first=await planner.planLines(edits.slice(0,2),0,true),second=await planner.planLines(edits.slice(2,4),2,true),last=await planner.planLines(edits.slice(4),4,true);
 const lines=planner.finishGroup([...first,...second,...last]);
 assert.equal(lines.length,6);
 lines.forEach((line,index)=>{assert.deepEqual(line.card.group,{id:lines[0].id,index,count:6,ids:lines.map(l=>l.id)});assert.equal(line.card.target.id,`C${index+1}`);assert.equal('scope' in line,false);});
 await assert.rejects(planner.planLines([{operation:'charge.update',target:'C9',values:{interestDue:'1'}}],4,true),/^ToolError: LINE_5:TARGET_NOT_FOUND$/,'numbering continues across chunks');
 await assert.rejects(planner.planLines([{operation:'charge.update',target:'C9',values:{interestDue:'1'}}]),/^ToolError: TARGET_NOT_FOUND$/,'a lone change keeps its plain code');
 assert.throws(()=>planner.finishGroup([...first,...first]),/^ToolError: DUPLICATE_TARGET:3$/,'group rules span the chunks');
 assert.throws(()=>planner.finishGroup(Array.from({length:101},()=>first[0])),/^ToolError: TOO_MANY_CHANGES$/);
 assert.throws(()=>planner.finishGroup([]),/^ToolError: NO_CHANGES$/);
 assert.equal(GROUP_DEADLINE_MS,270000);assert.equal(PROPOSE_CHUNK,25);
});
test('D12 chunks: the tool bridge holds more:true calls without latching, runs propose calls in call order, and latches only on a final call that succeeds',async()=>{
 const actor={issuer:'iss',subject:'s',partnerId:'P1'};
 const seen=[];let failFinal=true;
 const writes={catalogue:()=>({}),propose:async input=>{
  seen.push([input.changes[0].target,input.more]);
  await new Promise(resolve=>setTimeout(resolve,input.more?10:0));
  if(!input.more&&failFinal){failFinal=false;throw new ToolError('DUPLICATE_TARGET:3');}
  return input.more?{accepted:input.changes.length}:{proposals:[{id:'p'}]};
 }};
 const tools=createChatTools({readProvider:{},sqlTool:{},actor,writes});
 const call=(args,id)=>({name:'propose_action',args,id}),change=target=>({operation:'charge.update',target_id:target,inputs:'{}'});
 let results=await tools.runRound([call({changes:[change('C1')],more:true},'1'),call({changes:[change('C2')],more:true},'2'),call({changes:[change('C3')]},'3')],{deadline:Date.now()+5000,round:1});
 assert.deepEqual(seen,[['C1',true],['C2',true],['C3',false]],'call order although the round runs in parallel');
 assert.deepEqual(results.map(r=>r.error),[false,false,true]);assert.equal(results[2].value,'DUPLICATE_TARGET:3');
 // The failed final call does not use the turn's card; the next final call does, and any call after it is refused before any read.
 results=await tools.runRound([call({changes:[change('C1')],more:false},'4')],{deadline:Date.now()+5000,round:2});assert.equal(results[0].error,false);
 const before=seen.length;
 results=await tools.runRound([call({changes:[change('C5')],more:true},'5'),call({changes:[change('C6')]},'6')],{deadline:Date.now()+5000,round:3});
 assert.deepEqual(results.map(r=>r.value),['ONE_PROPOSAL_PER_TURN','ONE_PROPOSAL_PER_TURN']);assert.equal(seen.length,before);
 // Chase: a call refused for its arguments (before the bridge plans anything) still empties the held lines and frees the turn.
 let resets=0;const other=createChatTools({readProvider:{},sqlTool:{},actor,writes:{...writes,reset:()=>{resets++;}}});
 results=await other.runRound([call({changes:[change('C1')],more:'yes'},'7'),call({changes:Array.from({length:101},()=>change('C1')),more:true},'8'),call({changes:[]},'9')],{deadline:Date.now()+5000,round:1});
 assert.deepEqual(results.map(r=>r.value),['INVALID_CHANGES','TOO_MANY_CHANGES','NO_CHANGES']);assert.equal(resets,3);
 results=await other.runRound([call({changes:[change('C1')]},'10')],{deadline:Date.now()+5000,round:2});assert.equal(results[0].error,false,'the latch was released');assert.equal(resets,3);
});
test('CW3-01: destructive lines come first in the group; the rest keep their order',async()=>{
 const {client}=service({...base,...oumCharges});
 const lines=await createProposalPlanner({client,actor:{partnerId:'P1'},newId:ids()}).proposeGroup([sixEdits()[0],sixEdits()[1],{operation:'charge.delete',target:'C3',values:{}},sixEdits()[3]]);
 assert.deepEqual(lines.map(l=>[l.operation,l.card.target.id,l.card.destructive,l.card.group.index]),
  [['charge.delete','C3',true,0],['charge.update','C1',false,1],['charge.update','C2',false,2],['charge.update','C4',false,3]]);
 assert.equal(lines[0].card.group.id,lines[0].id);assert.deepEqual(lines[1].card.group.ids,lines.map(l=>l.id));
});
test('D12: refusals: 101 lines, the same target twice, a line using a record another line creates, a payment or close with edits for its borrower',async()=>{
 const drafts={'POST /api/payment-drafts/B-OUM/select-all':ok({businessDate:'2026-10-30',borrower:{id:'B-OUM',displayName:'Oum'},charges:[{id:'C1',chargeDate:'2026-10-29',loanDisplayKey:'k',principalRemaining:'0',interestRemaining:'100',amountRemaining:'100'}],accounts:[{id:'CA1',label:'Cash box'}],preferredReceivingAccountId:'CA1'}),
  'POST /api/payment-drafts/B-OUM/auto-assign':ok({charges:[],allocations:[{chargeId:'C1',principal:'0',interest:'100',lateCharge:'0',expectedPrincipalRemaining:'0',expectedInterestRemaining:'100',expectedLateChargeRemaining:'0',chargeDate:'2026-10-29'}],unallocated:'0'}),
  'POST /api/payment-drafts/B-OUM/review':ok({}),
  'GET /api/loan-records/L1/close-preview':ok({sourceVersion:W,businessDate:'2026-10-30',amount:'10300',planHash:'c'.repeat(64),plan:{borrowerId:'B-OUM'}})};
 const planner=()=>createProposalPlanner({client:service({...base,...oumCharges,...drafts}).client,actor:{partnerId:'P1'},newId:ids()});
 await assert.rejects(planner().proposeGroup(Array.from({length:101},(_,i)=>({operation:'charge.update',target:`C${i%6+1}`,values:{interestDue:'150'}}))),/^ToolError: TOO_MANY_CHANGES$/);
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

test('R112: Confirm of a remainder draft builds its v11 (R118; v10 before) command for the chosen purpose under the same id, sends it once; a refusal settles failed',async()=>{
 const {executeProposal}=await import('../../services/chat/proposals.mjs');
 const RID='00000000-0000-4000-8000-0000000000bb';
 const draft={borrowerId:'B1',amountReceived:'1000',paymentDate:'2026-10-30',paymentMethod:'Cash',cashAccountId:'CA1',notes:null};
 const due=[{id:'C1',chargeDate:'2026-10-30',loanDisplayKey:'k',amountRemaining:'700',principalRemaining:'0',interestRemaining:'700'}];
 const dueLine={chargeId:'C1',principal:'0',interest:'700',lateCharge:'0',expectedPrincipalRemaining:'0',expectedInterestRemaining:'700',expectedLateChargeRemaining:'0',chargeDate:'2026-10-30'};
 const rows=[{loanId:'L1',chargeId:'cg8:2:L1:2026-10-31',chargeDate:'2026-10-31',principalDue:'0',interestDue:'300',principal:'0',interest:'300',partial:false}];
 const routes=(forwardOffered=true)=>({...base,
  'POST /api/payment-drafts/B1/select-all':ok({businessDate:'2026-10-30',borrower:{displayName:'สมชาย'},charges:due,accounts:accounts.accounts}),
  'POST /api/payment-drafts/B1/auto-assign':ok({charges:due,allocations:[dueLine],allocated:'700',unallocated:'300',
   remainder:{amount:'300',loans:{},forward:forwardOffered?{rows,paidThrough:{L1:'2026-10-31'},uncovered:'0',blocked:[]}:{rows:[],paidThrough:{},uncovered:'300',blocked:[]},principal:[{loanId:'L1',amount:'300',settles:false,entry:{dailyAfter:'90'}}]}}),
  'POST /api/payment-drafts/B1/plan':ok({businessDate:'2026-10-30',plan:{allocations:[dueLine,{chargeId:rows[0].chargeId,principal:'0',interest:'300',lateCharge:'0',expectedPrincipalRemaining:'0',expectedInterestRemaining:'300',expectedLateChargeRemaining:'0',chargeDate:'2026-10-31'}],
   materialize:[{loanId:'L1',chargeId:rows[0].chargeId,chargeDate:'2026-10-31',principalDue:'0',interestDue:'300'}],principal:[],uncovered:'0',settles:[]}}),
  'POST /api/payment-drafts/B1/review':ok({})});
 const run=async({forwardOffered=true,purpose={forward:true,principal:[]},attempts=1,statusKind='unresolved'}={})=>{
  const {client:reads,calls}=service(routes(forwardOffered));const sent=[];let settled=null;
  const client={...reads,status:async()=>({kind:statusKind}),submit:async(kind,text)=>{sent.push([kind,JSON.parse(text)]);return {result:'recorded',data:{kind:'recorded',originalOutcome:{status:'posted',code:null,paymentId:'pwa:'+RID,recordedAt:'2026-10-30T03:00:00.000Z'}}};}};
  const proposal={id:RID,kind:'payment',operation:'payment.record',attempts,card:{purposeOptions:{}}};
  const store={claimProposal:async()=>({claimed:true,proposal,command:JSON.stringify({requestId:RID,purposeRequired:true,draft})}),settleProposal:async(_p,_t,_id,s)=>{settled=s;return {...proposal,...s};}};
  await executeProposal({store,principal:{},thread:'T',id:RID,client,purpose});
  return {sent,settled,calls};
 };
 const posted=await run();
 assert.equal(posted.sent.length,1);const [kind,command]=posted.sent[0];
 assert.equal(kind,'payment');assert.equal(command.schemaVersion,11);assert.equal(command.requestId,RID);assert.deepEqual(command,canonicalCommand(command));
 assert.equal(command.materialize.length,1);assert.equal(posted.settled.state,'done');assert.deepEqual(posted.settled.record,{type:'payment',id:'pwa:'+RID,paymentId:'pwa:'+RID});
 // The choice is no longer offered when Confirm runs: nothing is sent, the line fails.
 const gone=await run({forwardOffered:false});
 assert.deepEqual([gone.sent.length,gone.settled.state,gone.settled.outcome.code],[0,'failed','purpose_not_offered']);
 // A recorded journal answer wins before any planning; a later attempt is only reconciled (never planned or sent).
 const later=await run({attempts:2});
 assert.deepEqual([later.sent.length,later.settled.state,later.calls.length],[0,'unknown',0]);
});

test('R112 PWA: the card\'s choice becomes the Confirm purpose only for a choice the card offers (chat-protocol.ts choicePurpose)',async()=>{
 const ts=(await import('typescript')).default;
 const source=readFileSync(new URL('../../apps/pwa/src/chat/chat-protocol.ts',import.meta.url),'utf8');
 const {choicePurpose}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
 const options={remainder:'300',dueAmount:'700',businessDate:'2026-10-30',forward:{from:'2026-10-31',paidThrough:'2026-11-02',rows:[]},split:true,
  principal:[{loanId:'L1',loanDisplayKey:null,amount:'300',dailyBefore:null,dailyAfter:null,outstandingBefore:null,outstandingAfter:null}]};
 assert.equal(choicePurpose(options,null),null,'nothing preselected');
 assert.deepEqual(choicePurpose(options,{kind:'forward'}),{forward:true,principal:[]});
 assert.deepEqual(choicePurpose(options,{kind:'principal',loanId:'L1'}),{forward:false,principal:[{loanId:'L1',amount:'300'}]});
 assert.deepEqual(choicePurpose(options,{kind:'split',loanId:'L1',amount:'120'}),{forward:true,principal:[{loanId:'L1',amount:'120'}]});
 for(const choice of [{kind:'split',loanId:'L1',amount:'300'},{kind:'split',loanId:'L1',amount:'0'},{kind:'split',loanId:'L1',amount:'1.5'},{kind:'principal',loanId:'L2'}])assert.equal(choicePurpose(options,choice),null,JSON.stringify(choice));
 assert.equal(choicePurpose({...options,forward:null,split:false},{kind:'forward'}),null);
 assert.equal(choicePurpose(undefined,{kind:'forward'}),null);
});

// R139 (PROD group 066fdc4f): carry-forward versions. A fake command service with the V141 lab's version rules: a loan's
// version hashes its row and its charges (any charge create, update or delete moves it); a charge's version hashes the
// charge and its loan row (a loan.update moves every charge of the loan; a sibling charge's change does not).
function liveService(){
 const loans={L1:{...loanItem},L2:{...loanItem,id:'L2'}},row={L1:1,L2:1},agg={L1:1,L2:1};
 const charges={C1:{loanId:'L1',interestDue:'100.00',own:1},C2:{loanId:'L1',interestDue:'100.00',own:1},C3:{loanId:'L2',interestDue:'100.00',own:1}};
 const calls=[],journal=new Map(),posts=[],reads=new Map();
 const hex=(...parts)=>parts.map(n=>String(n).padStart(8,'0')).join('').padStart(64,'0');
 const loanVersion=id=>hex(1,row[id],agg[id]),chargeVersion=id=>hex(2,row[charges[id].loanId],charges[id].own,Number(id.slice(1)));
 const chargeItem=id=>({id,loanId:charges[id].loanId,chargeDate:'2026-10-29',principalDue:'0.00',interestDue:charges[id].interestDue,lateChargeDue:'0.00',notes:null,borrowerId:'B1',borrowerName:'สมชาย',borrowerDescription:null,version:chargeVersion(id)});
 const svc={calls,posts,loans,charges,row,agg,afterPost:_command=>{},afterGet:(_path,_count)=>{}};
 const get=async path=>{
  calls.push(['GET',path]);const count=(reads.get(path)??0)+1;reads.set(path,count);
  let answer={status:404,data:{ok:false,code:'not_found'}};
  let m=/^\/api\/loan-records\/(L\d)$/.exec(path);if(m&&loans[m[1]])answer=ok({item:{...loans[m[1]],version:loanVersion(m[1])}});
  m=/^\/api\/charge-records\/(C\d+)$/.exec(path);if(m&&charges[m[1]])answer=ok({item:chargeItem(m[1])});
  if(path==='/api/borrower-options')answer=ok(accounts);if(path==='/api/borrower-records/B1')answer=ok({item:{id:'B1',name:'สมชาย',description:'Somchai'}});
  svc.afterGet(path,count);return answer;
 };
 const outcome=(status,code=null)=>({kind:'recorded',originalOutcome:{status,code,result:null,recordedAt:'2026-11-10T03:00:00.000Z'}});
 const apply=command=>{
  const {operation,targetId,expectedVersion,inputs}=command;
  if(!operation)return outcome('posted');   // a payment command (no loan of this group)
  if(operation!=='charge.create'&&(operation.startsWith('loan.')?loanVersion(targetId):charges[targetId]&&chargeVersion(targetId))!==expectedVersion)return outcome('rejected','source_conflict');
  if(operation==='charge.delete'){agg[charges[targetId].loanId]++;delete charges[targetId];}
  else if(operation==='charge.create'){charges['C'+(Object.keys(charges).length+10)]={loanId:inputs.loanId,interestDue:inputs.interestDue,own:1};agg[inputs.loanId]++;}
  else if(operation==='charge.update'){charges[targetId].interestDue=inputs.interestDue;charges[targetId].own++;agg[charges[targetId].loanId]++;}
  else if(operation==='loan.update'){Object.assign(loans[targetId],inputs);row[targetId]++;}
  return outcome('applied');
 };
 svc.client={get,post:async()=>({status:404,data:{}}),status:async(_kind,id)=>journal.get(id)??{kind:'unresolved'},
  submit:async(_kind,text)=>{const command=JSON.parse(text);posts.push(command);calls.push(['POST',command.operation??'payment']);const data=apply(command);journal.set(command.requestId,data);svc.afterPost(command);return {result:'recorded',status:200,data};}};
 svc.outside=loan=>{agg[loan]++;};   // another Partner's payment or charge on the loan
 return svc;
}
function memoryGroup(lines){
 const rows=new Map(lines.map(({scope:_scope,...line})=>[line.id,{...line,threadId:'T',state:'pending',attempts:0,claimedAt:null,expiresAt:new Date(Date.now()+900000).toISOString()}]));
 const store={
  claimProposal:async(_p,_t,id)=>{const row=rows.get(id);if(row.state!=='pending')return {claimed:false,proposal:row};row.state='executing';row.attempts++;row.claimedAt=new Date().toISOString();return {claimed:true,proposal:row,command:row.command};},
  settleProposal:async(_p,_t,id,settlement)=>Object.assign(rows.get(id),settlement),
 };
 return {store,rows,lines:()=>[...rows.values()].map(row=>({...row}))};
}
const runGroup=async(svc,group)=>{
 const {executeGroup}=await import('../../services/chat/proposals.mjs');const logs=[],lines=group.lines(),before=svc.calls.length;
 const result=await executeGroup({store:group.store,principal:{},thread:'T',id:lines[0].id,client:svc.client,log:r=>logs.push(r),lines});
 return {result,logs,calls:svc.calls.slice(before),states:result.lines.map(l=>[l.state,l.outcome?.code??null]),repinned:logs.filter(l=>l.event==='chat_proposal_repinned')};
};
const plan=(svc,changes)=>createProposalPlanner({client:svc.client,actor:{partnerId:'P1'},newId:ids()}).planLines(changes,0,true);
const del=target=>({operation:'charge.delete',target,values:{}}),autoOff=target=>({operation:'loan.update',target,values:{autoChargeEnabled:false}});
const create=loanId=>({operation:'charge.create',target:'',values:{loanId,chargeDate:'2026-11-12',principalDue:'0',interestDue:'90'}});
const pinned=line=>JSON.parse(line.command).expectedVersion;
test('R139: the PROD group shape (charge deletes, loan.update "Automatic charges" off, charge creates on two loans) is all done; each loan.update carries its own group\'s version with the old and new hash logged',async()=>{
 const svc=liveService();
 const lines=await plan(svc,[del('C1'),del('C3'),autoOff('L1'),autoOff('L2'),create('L1'),create('L2')]);
 assert.deepEqual([lines[0].card.target.loanId,lines[1].card.target.loanId,lines[4].card.target.loanId],['L1','L2','L1'],'charge cards name their loan');
 const {states,repinned}=await runGroup(svc,memoryGroup(lines));
 assert.deepEqual(states,Array(6).fill(['done',null]));assert.equal(svc.loans.L1.autoChargeEnabled,false);assert.equal(svc.loans.L2.autoChargeEnabled,false);
 assert.deepEqual(repinned.map(l=>[l.proposal,l.operation,l.from]),[[lines[2].id,'loan.update',pinned(lines[2])],[lines[3].id,'loan.update',pinned(lines[3])]]);
 assert.ok(repinned.every(l=>/^[0-9a-f]{64}$/.test(l.to)&&l.to!==l.from));
 assert.deepEqual([svc.posts[2].requestId,svc.posts[2].expectedVersion,svc.posts[2].inputs],[lines[2].id,repinned[0].to,JSON.parse(lines[2].command).inputs],'same request id and inputs, the carried version');
});
test('R139: a change to the loan from outside the group before Confirm: the loan.update keeps its pinned version and fails source_conflict',async()=>{
 const svc=liveService();
 const lines=await plan(svc,[del('C1'),autoOff('L1')]);
 svc.outside('L1');
 const {states,repinned}=await runGroup(svc,memoryGroup(lines));
 assert.deepEqual(states,[['done',null],['failed','source_conflict']]);assert.deepEqual(repinned,[]);assert.equal(svc.posts[1].expectedVersion,pinned(lines[1]));
});
test('R139: a change from outside the group between two earlier lines (the version read before a line is not the carried one): source_conflict',async()=>{
 const svc=liveService();
 const lines=await plan(svc,[del('C1'),del('C2'),autoOff('L1')]);
 // Reads of L1: the proposal, the Confirm start, before the first delete, after it (carried: read 4); then another
 // Partner changes the loan, so the read before the second delete is not the carried version.
 svc.afterGet=(path,count)=>{if(path==='/api/loan-records/L1'&&count===4)svc.outside('L1');};
 const {states,repinned}=await runGroup(svc,memoryGroup(lines));
 assert.deepEqual(states,[['done',null],['done',null],['failed','source_conflict']]);assert.deepEqual(repinned,[]);
});
test('R139: charge lines after charge lines are not re-read (a sibling charge\'s change does not move their version)',async()=>{
 const svc=liveService();
 const lines=await plan(svc,[del('C1'),{operation:'charge.update',target:'C2',values:{interestDue:'150'}}]);
 const {states,calls}=await runGroup(svc,memoryGroup(lines));
 assert.deepEqual(states,[['done',null],['done',null]]);assert.deepEqual(calls.filter(([method])=>method==='GET'),[]);
});
test('R139: a charge.delete after a loan.update on its loan is carried forward (its version includes the loan row)',async()=>{
 const svc=liveService();
 const lines=await plan(svc,[autoOff('L1'),del('C2')]);
 const {states,repinned,calls}=await runGroup(svc,memoryGroup(lines));
 assert.deepEqual(states,[['done',null],['done',null]]);assert.deepEqual(repinned.map(l=>[l.operation,l.from]),[['charge.delete',pinned(lines[1])]]);
 assert.ok(calls.filter(([method])=>method==='GET').every(([,path])=>path==='/api/charge-records/C2'));
});
test('R139: a payment line affects no other line (nothing re-read, nothing carried)',async()=>{
 const svc=liveService();
 const [update]=await plan(svc,[autoOff('L1')]);
 const PID='00000000-0000-4000-8000-0000000000ff';
 const payment={id:PID,kind:'payment',operation:'payment.record',card:{version:1,operation:'payment.record',target:{type:'borrower',id:'B2',label:'Other'},values:[],changes:[],consequences:[]},command:JSON.stringify({requestId:PID,schemaVersion:11})};
 const {states,repinned,calls}=await runGroup(svc,memoryGroup([payment,update]));
 assert.deepEqual(states,[['done',null],['done',null]]);assert.deepEqual(repinned,[]);assert.deepEqual(calls.filter(([method])=>method==='GET'),[]);
});
test('R139: a line already claimed once is never re-pinned (only reconciled)',async()=>{
 const svc=liveService();
 const lines=await plan(svc,[del('C1'),autoOff('L1')]);
 const group=memoryGroup(lines);
 Object.assign(group.rows.get(lines[0].id),{state:'done'});delete svc.charges.C1;svc.outside('L1');
 Object.assign(group.rows.get(lines[1].id),{state:'unknown',attempts:1,claimedAt:new Date(Date.now()-60000).toISOString()});
 const {states,calls}=await runGroup(svc,group);
 assert.deepEqual(states.map(([state])=>state),['done','unknown']);assert.equal(svc.posts.length,0);assert.deepEqual(calls,[],'no read and no POST');
});
