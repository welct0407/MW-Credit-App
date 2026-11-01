import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
// R109: the Default Loan sheet's plan (pure module, transpiled as the PWA build does): outcomes, forced switch, blockers
// and the live summary (Echo R109-UX-S02..S05, S07..S09) on Archie's worked example (principal 10,000, rate 3, two
// unpaid charges of 900).
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/default-loss.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {planDefaultLoss,defaultLossPrefill,defaultKeepCharges,defaultLossHeading,defaultLossSummary}=await import('data:text/javascript,'+encodeURIComponent(source));
const money=value=>'฿'+new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value);
const item={type:'ดอกเบี้ยรายวัน',outstandingPrincipal:'10000.00',defaultLoss:null,defaultLossDate:null,currentDailyInterest:'300.00',originalRate:3,unpaidChargeCount:2,unpaidChargeAmount:'1800.00'};
const plan=(over={},options={})=>planDefaultLoss({...item,...over},{amountText:'10000',keepChoice:true,businessDate:'2026-11-01',...options});
test('prefill is the outstanding principal truncated to whole baht; the switch starts on only with an unpaid charge',()=>{
 assert.equal(defaultLossPrefill(item),'10000');assert.equal(defaultLossPrefill({...item,outstandingPrincipal:'10000.75'}),'10000');assert.equal(defaultLossPrefill({...item,outstandingPrincipal:'0.00'}),'');
 assert.equal(defaultKeepCharges(item),true);assert.equal(defaultKeepCharges({...item,unpaidChargeAmount:'0'}),false);
});
test('three outcomes: write off and close, full loss kept, partial (forced on)',()=>{
 const off=plan({},{keepChoice:false});assert.deepEqual([off.outcome,off.keep,off.keepForced,off.blockers],['write-off',false,null,[]]);
 assert.equal(defaultLossHeading(off,false),'Write off and close');
 assert.equal(defaultLossSummary(off,false,money),'Principal falls by ฿10,000 to ฿0. 2 unpaid charges totalling ฿1,800 are written off. The loan closes as Defaulted and no further payments are accepted. Today\'s profit falls by ฿10,000.');
 const kept=plan();assert.deepEqual([kept.outcome,kept.keep,kept.dailyAfter],['full-keep',true,0]);
 assert.equal(defaultLossSummary(kept,true,money),'เงินต้นลดลง ฿10,000 เหลือ ฿0 รายการเรียกเก็บค้างชำระ 2 รายการ รวม ฿1,800 ยังติดตามเก็บได้ ดอกเบี้ยรายวันหยุดและไม่สร้างรายการเรียกเก็บใหม่ กำไรวันนี้ลดลง ฿10,000');
 const partial=plan({},{amountText:'4,000',keepChoice:false});
 assert.deepEqual([partial.outcome,partial.keep,partial.keepForced,partial.principalAfter,partial.dailyBefore,partial.dailyAfter],['partial',true,'on',6000,300,180]);
 assert.equal(defaultLossSummary(partial,false,money),'Principal falls by ฿4,000 to ฿6,000. Daily interest falls from ฿300 to ฿180 for new charges. 2 unpaid charges totalling ฿1,800 stay collectable. Today\'s profit falls by ฿4,000.');
 assert.equal(plan({},{amountText:'10000',keepChoice:false}).keep,false,'back to the full amount the explicit choice returns');
});
test('singular; nothing unpaid: a full loss writes off and closes (Chase D1), a partial loss keeps the loan open',()=>{
 assert.match(defaultLossSummary(plan({unpaidChargeCount:1,unpaidChargeAmount:'900'}),false,money),/1 unpaid charge of ฿900 stays collectable\./);
 const none={unpaidChargeCount:0,unpaidChargeAmount:'0'},full=plan(none,{keepChoice:true});
 assert.deepEqual([full.keepForced,full.keepReason,full.keep,full.outcome],['off','nothing-unpaid',false,'write-off']);
 assert.match(defaultLossSummary(full,false,money),/There are no unpaid charges to write off\. The loan closes as Defaulted/);
 const partial=plan(none,{amountText:'4000'});assert.deepEqual([partial.keepForced,partial.keepReason,partial.keep,partial.outcome],['on','partial',true,'partial']);
 assert.match(defaultLossSummary(partial,false,money),/There are no unpaid charges to collect\./);
});
test('a fully lost loan only writes off and closes, with amount 0 and profit unchanged',()=>{
 const lost=plan({outstandingPrincipal:'0.00',defaultLoss:'10000.00',defaultLossDate:'2026-10-31'},{amountText:'',keepChoice:true});
 assert.deepEqual([lost.fullyLost,lost.amount,lost.keep,lost.keepForced,lost.outcome,lost.blockers],[true,'0',false,'off','write-off',[]]);
 assert.equal(defaultLossSummary(lost,false,money),'2 unpaid charges totalling ฿1,800 are written off. The loan closes as Defaulted and no further payments are accepted. Profit is unchanged.');
 assert.deepEqual(plan({outstandingPrincipal:'0.00',defaultLoss:'10000.00',defaultLossDate:'2026-11-01'},{amountText:''}).blockers,[],'a same-day write-off of a fully lost loan is allowed');
});
test('blockers: amount, partial on another type, missing rate, same day, unpaid charges unavailable',()=>{
 for(const amountText of ['','0','10001','40.5','abc'])assert.deepEqual(plan({},{amountText}).blockers,['amount'],amountText);
 const fixed=plan({type:'กำหนดวันชำระ'},{amountText:'4000'});assert.deepEqual([fixed.keepForced,fixed.keepReason,fixed.keep,fixed.blockers,fixed.outcome],['off','type',false,['partial-type'],null],'UX-V02: no outcome under a block');
 assert.equal(defaultLossSummary(fixed,false,money),'');
 assert.deepEqual(plan({type:'กำหนดวันชำระ'},{amountText:'10000'}).outcome,'write-off');
 for(const keepChoice of [true,false])assert.deepEqual(plan({originalRate:null},{keepChoice}).blockers,['rate-missing']);
 assert.deepEqual(plan({defaultLoss:'2000.00',defaultLossDate:'2026-11-01',outstandingPrincipal:'8000.00'},{amountText:'1000'}).blockers,['same-day']);
 const unknown=plan({unpaidChargeCount:undefined,unpaidChargeAmount:undefined});
 assert.deepEqual([unknown.blockers,unknown.outcome,defaultLossSummary(unknown,false,money)],[['unpaid-unavailable'],null,''],'UX-V03: a cached pre-R109 loan read states nothing');
 for(const over of [{originalRate:null},{defaultLoss:'2000.00',defaultLossDate:'2026-11-01',outstandingPrincipal:'8000.00'}])assert.equal(plan(over,{amountText:'1000'}).outcome,null,'UX-P01');
});
