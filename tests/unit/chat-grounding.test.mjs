// R090: services/chat/grounding.mjs against the vectors of integration-agent/tests/test_conversation_grounding.py
// (R088): tokenizer, rules, limits, bypasses and the 21 Oct 2026 corpus (copied to tests/unit/fixtures). The
// finish-gate (bridge) cases of the Python file are covered by tests/unit/chat-engine.test.mjs (shared attempt
// counter, rejection text, GROUNDING_EXCEEDED). Synthetic borrowers and amounts throughout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {candidates,check,rejection,Grounding,Dec,MONEY,LIMITS} from '../../services/chat/grounding.mjs';

const CORPUS=new URL('./fixtures/chat-grounding-corpus/',import.meta.url);
const rows=(...items)=>({columns:items.length?Object.keys(items[0]):[],rows:items,row_count:items.length,complete:true});
const obs=(...values)=>Object.fromEntries(values.map((v,i)=>[`observation-${i+1}`,v]));
const LOANS=obs(rows({borrower_id:'B-A',loan_id:'L1',outstanding_principal:'21000.00',daily_interest:'2100.00',due_now:'23450.00'},
 {borrower_id:'B-A',loan_id:'L2',outstanding_principal:'7000.00',daily_interest:'700.00',due_now:'7700.00'},
 {borrower_id:'B-B',loan_id:'L3',outstanding_principal:'35000.00',daily_interest:'3500.00',due_now:'35000.00'}));
const found=text=>candidates(text).map(([shown,value,cls])=>[shown,String(value),cls]);
const verdict=(message,observations=LOANS,instruction='')=>check(message,observations,instruction);

test('tokenizer: classes',()=>{
 for(const [text,expected] of [
  ['Due now: ฿17,600',[['฿17,600','17600','money']]],
  ['Default loss: -฿1,500',[['-฿1,500','1500','money']]],
  ['Fee ฿12.50 only',[['฿12.50','12.50','money']]],
  ['ยอด 12,345 บาท',[['12,345 บาท','12345','money']]],
  ['paid 2,000 baht',[['2,000 baht','2000','money']]],
  ['฿300/day and ฿350 /day',[['฿300/day','300','rate'],['฿350 /day','350','rate']]],
  ['ดอกเบี้ย 300 บาท/วัน และ ฿200 ต่อวัน',[['300 บาท/วัน','300','rate'],['฿200 ต่อวัน','200','rate']]],
  ['598.3% of principal lent',[['598.3%','598.3','percent']]],
  ['คิดเป็นร้อยละ 16.2',[['ร้อยละ 16.2','16.2','percent']]],
  ['ยอด ฿๑๒,๖๐๐',[['฿12,600','12600','money']]],
 ])assert.deepEqual(found(text),expected,text);
});

test('tokenizer: a formula line carries its day count and rate',()=>{
 const [[, ,rateCls,,formula,days,rates],[shown,value,cls,,formula2]]=candidates('฿300/day × 2 days = ฿600');
 assert.deepEqual([rateCls,formula,days,rates.map(String)],['rate',true,[2],['300']]);
 assert.deepEqual([shown,String(value),cls,formula2],['฿600','600','money',true]);
});

test('tokenizer: exemptions are removed first',()=>{
 for(const text of ['As of 21-Oct-2026 22:44 Bangkok, live data','ข้อมูล ณ 21-ต.ค.-2569 14:05 น.','2026-10-21T22:44:00+07:00',
  'due 21/10 and 21/10/2026','Oct 21, 2026','in 2026 and 2569','1. first\n2) second','loan 12345678','700 characters, 12 lines',
  '75 charges on 8 loans','16-Sep to 04-Oct-2026'])assert.deepEqual(found(text),[],text);
 assert.deepEqual(found('due today 21-Oct-2026 ฿2,950 at 14:05'),[['฿2,950','2950','money']]);
 assert.deepEqual(found('฿2,026 in 2026'),[['฿2,026','2026','money']]); // a year is exempt only bare
});

test('rule 1: observed value',()=>{
 assert.equal(verdict('Payoff ฿23,450').ok,true);
 assert.deepEqual(verdict('Payoff ฿23,451').ungrounded,['฿23,451']);
});

test('every Unicode decimal digit counts, as Python\'s \\d does; the rejection quotes the text as written',()=>{
 // Fullwidth, Arabic-Indic, Thai and mathematical bold digits (vectors checked against conversation_grounding.py).
 const observed=obs(rows({amount:'99999'}));
 for(const [message,quoted] of [['Fee ฿９９,９９９','฿９９,９９９'],['Fee ฿٩٩,٩٩٩ today','฿٩٩,٩٩٩'],['Fee ฿๙๙,๙๙๙','฿99,999'],['Fee ฿𝟗𝟗,𝟗𝟗𝟗','฿𝟗𝟗,𝟗𝟗𝟗']]){
  assert.deepEqual(verdict(message,{},'q').ungrounded,[quoted],message);
  assert.equal(verdict(message,observed,'q').ok,true,message);
 }
});

test('rule 2: sum and difference of observed amounts',()=>{
 assert.deepEqual(verdict('Payoff ฿44,450').rules,{sum:1}); // 21,000 + 23,450
 assert.deepEqual(verdict('Gap ฿15,750').rules,{sum:1});    // 23,450 - 7,700
 assert.equal(verdict('Payoff ฿44,451').ok,false);
});

test('rule 3: column, prefix, suffix and group totals',()=>{
 assert.deepEqual(verdict('Total due ฿66,150').rules,{total:1});
 assert.deepEqual(verdict('Borrower A due ฿31,150').rules,{total:1});
 assert.deepEqual(verdict('Outstanding ฿63,000').rules,{total:1});
 const payoffs=obs(...[['L1','44450'],['L2','14700']].map(([k,a])=>({loan_id:k,eligible:true,calculation:{amount:a}})));
 assert.deepEqual(verdict('Both ฿59,150',payoffs).rules,{total:1});
 const totals=obs({totals:{'B-A':'31150','B-B':'35000'},source:'observation-1',complete:true});
 assert.deepEqual(verdict('All ฿66,150',totals).rules,{total:1});
 assert.equal(verdict('Total due ฿66,151').ok,false);
});

test('rule 4: subset sums of a short column',()=>{
 const charges=obs(rows(...[200,350,425,610].map(v=>({'Ref Loans':'L1','Amount Remaining':String(v)}))));
 assert.deepEqual(verdict('Two of them ฿625',charges).rules,{subset:1});
 assert.equal(verdict('Two of them ฿626',charges).ok,false);
});

test('rule 5: products only in formula lines',()=>{
 const daily=obs(rows({loan_id:'L9',daily_interest:'450.00'}));
 assert.deepEqual(verdict('Gap: ฿450/day × 3 days = ฿1,350',daily).rules,{observed:1,product:1});
 assert.deepEqual(verdict('Gap: ฿450 × 4 = ฿1,800',daily).rules,{observed:1,product:1});
 assert.equal(verdict('Gap: ฿450/day × 3 days = ฿1,400',daily).ok,false);
 assert.equal(verdict('Gap: ฿450/day × 3 days = ฿4,500',daily).ok,false);
 assert.equal(verdict('Interest so far ฿1,350',daily).ok,false);
 assert.deepEqual(verdict('Gap: ฿451/day × 1 day = ฿451',daily).ungrounded,['฿451/day','฿451']);
});

test('rule 6: observed amount plus a derived total',()=>{
 assert.deepEqual(verdict('Owed ฿87,150').rules,{chain:1});
 assert.equal(verdict('Owed ฿87,151').ok,false);
});

test('counts never add to an amount',()=>{
 const counted=obs(rows({loan_id:'L1',amount:'6000.00',charges:40},{loan_id:'L2',amount:'1000.00',charges:2}));
 assert.deepEqual(verdict('Paid ฿6,040',counted).ungrounded,['฿6,040']);
});

test('percent via ratio and via an observed column',()=>{
 const roi=obs(rows({'Row ID':'B1','Total Interest Earned':'12600.00','Total Amount Loaned':'1900.00',return_ratio:'0.162'},
  {'Row ID':'B2','Total Interest Earned':'48300.00','Total Amount Loaned':'21000.00',return_ratio:'0.5'}));
 assert.deepEqual(verdict('663.2% of principal lent',roi).rules,{ratio:1});
 assert.deepEqual(verdict('230.0% of principal lent',roi).rules,{ratio:1});
 assert.deepEqual(verdict('16.2% return',roi).rules,{observed:1});
 assert.deepEqual(verdict('663.3% of principal lent',roi).ungrounded,['663.3%']);
});

test('whole-baht rounding and negatives',()=>{
 const decimals=obs(rows({loan_id:'L1',interest:'2318.40'},{loan_id:'L2',interest:'-2700.00'}));
 assert.equal(verdict('Interest ฿2,318',decimals).ok,true);
 assert.equal(verdict('Interest ฿2,318.40',decimals).ok,true);
 assert.equal(verdict('Interest ฿2,318.41',decimals).ok,false);
 assert.equal(verdict('Default loss: -฿2,700',decimals).ok,true);
 assert.equal(verdict('Nothing due today: ฿0',decimals).ok,true);
});

test('request numbers ground',()=>{
 assert.deepEqual(verdict('After ฿25,000 paid',LOANS,'If Borrower A pays 25000 today, how much is left?').rules,{observed:1});
 assert.deepEqual(verdict('After ฿25,000 paid').ungrounded,['฿25,000']);
 assert.deepEqual(verdict('After ฿70,000 paid').rules,{sum:1});
});

test('R092 aggregate-first: a total, the listed lines and the rest ground',()=>{
 // Ten listed charges (13,800 in all) from a LIMIT 10 query plus the aggregate of the whole set: 230 charges, 45,200.
 const listed=Array.from({length:10},(_,i)=>({charge_date:`2026-10-${String(10+i).padStart(2,'0')}`,amount_remaining:`${1200+i*40}.00`}));
 const lines=listed.map(r=>`- ${r.charge_date.slice(8)}-Oct-2026: ฿${Number(r.amount_remaining).toLocaleString('en-US')}`).join('\n');
 assert.equal(listed.reduce((a,r)=>a+Number(r.amount_remaining),0),13800);
 const withRest=obs(rows({due_total:'45200.00',charge_count:230,rest_total:'31400.00'}),rows(...listed));
 const reply=`**Due now: ฿45,200**\n${lines}\n- 220 others: ฿31,400`;
 assert.deepEqual(verdict(reply,withRest).ungrounded??[],[]);
 assert.equal(verdict(reply,withRest).ok,true);
 // Without rest_total the rest is the total minus the listed lines (rule 6: observed amount minus a derived total).
 const withoutRest=obs(rows({due_total:'45200.00',charge_count:230}),rows(...listed));
 assert.equal(verdict(reply,withoutRest).ok,true);
 // A wrong rest or a wrong total is still refused.
 assert.deepEqual(verdict(reply.replace('฿31,400','฿31,500'),withRest).ungrounded,['฿31,500']);
 assert.deepEqual(verdict(reply.replace('฿45,200','฿45,300'),withoutRest).ungrounded.includes('฿45,300'),true);
});

test('seeded transcript amounts never ground',()=>{
 assert.equal(check('Payoff ฿61,370',obs(rows({loan_id:'L4',payoff:'61370.00'})),'').ok,true);
 assert.deepEqual(check('Payoff ฿61,370',LOANS,'and the 20-Sep loan?').ungrounded,['฿61,370']);
});

test('performance on a 500-row observation',()=>{
 let seed=7;const random=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%(n+1);};
 const big=obs(rows(...Array.from({length:500},(_,i)=>({'Row ID':`C-${i}`,'Ref Loans':`L-${i%40}`,'Charge Date':`2026-10-${String(i%28+1).padStart(2,'0')}`,
  ...Object.fromEntries(['Principal Due','Interest Due','Principal Paid','Interest Paid','Amount Remaining','Interest Remaining'].map(c=>[c,`${random(3900)}.00`])),
  'Payment Count':random(3),'Payment Status':'ชำระแล้ว',Notes:'cycle 3 days'}))));
 const message='Due now: ฿17,600\n• Overdue (19-Oct-2026): ฿1,000\n• ฿300/day × 2 days = ฿600\n• 16.2% of principal lent\nAs of 21-Oct-2026 22:44 Bangkok, live data';
 const best=Math.min(...Array.from({length:5},()=>check(message,big,'').elapsedMs));
 assert.ok(best<50,`${best} ms`);
});

test('truncation is flagged',()=>{
 const saved=LIMITS.G_CAP;LIMITS.G_CAP=50;
 try{
  const result=check('฿1',obs(rows(...Array.from({length:100},(_,i)=>({loan_id:`L${i}`,amount:`${1000+i}.00`})))),'');
  assert.equal(result.truncated,true);assert.ok(result.groundingValues<200);
 }finally{LIMITS.G_CAP=saved;}
});

test('rejection text',()=>{
 const result=check('Interest ฿52,300 (incl. ฿4,180 first-day charges)',obs(rows({x_id:'1',interest:'52300.00'})),'');
 assert.equal(rejection(result,2),"UNGROUNDED_AMOUNTS: ฿4,180 are not in this turn's observations. Remove them, or re-check the data with a tool and quote the observed figure. Attempt 2 of 3.");
});

test('bypass B1: a month word after an amount does not hide it',()=>{
 for(const [text,value] of [['฿20 Oct fee','฿20'],['฿40 Dec charge','฿40'],['฿25 Mar','฿25'],['฿5 March','฿5']])assert.deepEqual(check(text,LOANS,'').ungrounded,[value],text);
});
test('bypass B2: an amount is never a year or an id',()=>{
 for(const text of ['฿ 2569','2569 บาท','2026 baht','฿12345678','12345678 บาท']){const r=check(text,LOANS,'');assert.deepEqual([r.candidates,r.ok],[1,false],text);}
});
test('bypass B3: an as-of line keeps its amounts',()=>{
 for(const text of ['As of today Borrower A owes ฿99,999','Snapshot 14:05: ฿99,999 due','ณ วันนี้ ค้าง ฿99,999','ข้อมูล ณ 21-ต.ค.-2569 14:05 น. ยอด ฿99,999'])
  assert.deepEqual(check(text,LOANS,'').ungrounded,['฿99,999'],text);
 assert.equal(check('As of 21-Oct-2026 22:44 Bangkok, live data',LOANS,'').candidates,0);
});
test('bypass B4: every written format is a candidate',()=>{
 for(const [text,value] of [['9,999฿',9999],['THB 9,999',9999],['THB9,999',9999],['9,999 THB',9999],['9,999 บ.',9999],['9.9K baht',9900],['฿9k',9000],
  ['1.2 ล้านบาท',1200000],['9 999 baht',9999],['฿1.5M',1500000],['3 หมื่นบาท',30000],['2 แสนบาท',200000],['5 พันบาท',5000]]){
  assert.deepEqual(check(`Owed ${text}`,LOANS,'').ungrounded,[text],text);
  assert.equal(check(`Owed ${text}`,obs(rows({loan_id:'L9',owed:`${value}.00`})),'').ok,true,text);
 }
 assert.deepEqual(candidates('9 999 baht').map(c=>String(c[1])),['9999']);
});
test('dates next to amounts are still exempt',()=>{
 assert.deepEqual(candidates('due 21-Oct-2026 ฿2,950 at 14:05; 9,999฿ 21-Oct-2026').map(c=>[c[0],String(c[1])]),[['฿2,950','2950'],['9,999฿','9999']]);
});

const documents=()=>readdirSync(CORPUS).filter(n=>n.endsWith('.json')).sort().map(n=>JSON.parse(readFileSync(new URL(n,CORPUS),'utf8')));
test('corpus: the 12 replies keep their verdicts',()=>{
 const verdicts=new Map();
 for(const doc of documents())for(const [model,reply] of Object.entries(doc.replies)){
  const result=check(reply.text,doc.observations,doc.request);
  verdicts.set(`${doc.question}/${model}`,[result.ok,result.ungrounded]);
  assert.deepEqual([result.ok,result.ungrounded],[reply.expected.ok,reply.expected.ungrounded],`${doc.question} ${model}`);
 }
 assert.equal(verdicts.size,12);
 assert.deepEqual([...verdicts].filter(([,[ok]])=>!ok).map(([k])=>k),['Q2/argon']);
 assert.deepEqual(verdicts.get('Q2/argon')[1],['฿35,210']);
});
test('corpus: mutated amounts are rejected unless they land on an observed or summed figure',()=>{
 const accepted={'+1':[],x10:[]},total={'+1':0,x10:0};
 const money=new RegExp(MONEY.source,'gud');
 for(const doc of documents()){
  const table=new Grounding(doc.observations,doc.request);
  for(const [model,reply] of Object.entries(doc.replies)){
   const text=reply.text;
   for(const m of text.matchAll(money)){
    const value=Dec.parse(m.groups.num.replaceAll(',',''));
    if(value.zero||reply.expected.ungrounded.includes(m[0].trim()))continue;
    assert.ok(value.integral());
    for(const [label,next] of [['+1',value.round(0)+1n],['x10',value.round(0)*10n]]){
     const [start,end]=m.indices.groups.num;
     const mutated=text.slice(0,start)+next.toLocaleString('en-US')+text.slice(end);
     const result=check(mutated,doc.observations,doc.request);
     const line=text.slice(0,start).split('\n').length-1;
     const candidate=candidates(mutated).find(c=>c[3]===line&&c[1].eq(new Dec(next,0)));
     const rule=table.money(candidate[1],candidate[4],candidate[5],candidate[6],candidate[2],candidate[7]);
     assert.equal(result.ok&&!reply.expected.ungrounded.length,rule!==null&&result.ok);
     total[label]++;if(rule)accepted[label].push([doc.question,model,m[0].trim(),String(next),rule]);
    }
   }
  }
 }
 assert.deepEqual(total,{'+1':256,x10:256});
 assert.deepEqual(accepted['+1'],[]);
 assert.ok(accepted.x10.length<=103,String(accepted.x10.length));
 assert.ok(accepted.x10.every(([,,,,rule])=>['observed','total','subset','sum','chain'].includes(rule)));
});
test('corpus: changed dates and times do not change a verdict',()=>{
 for(const doc of documents())for(const [model,reply] of Object.entries(doc.replies)){
  let text=reply.text.replace(/(\d{2})-(Oct|Sep|Aug)-2026/g,(_,d,mon)=>`${String(Number(d)%28+1).padStart(2,'0')}-${mon}-2026`);
  text=text.replace(/(\d{2}):(\d{2})/g,(_,h,mi)=>`${h}:${String((Number(mi)+7)%60).padStart(2,'0')}`);
  assert.notEqual(text,reply.text);
  assert.equal(check(text,doc.observations,doc.request).ok,reply.expected.ok,`${doc.question} ${model}`);
 }
});
test('corpus checks are fast',()=>{
 for(const doc of documents())for(const reply of Object.values(doc.replies))
  assert.ok(Math.min(...[0,1,2].map(()=>check(reply.text,doc.observations,doc.request).elapsedMs))<50);
});
test('decimal helpers follow Python Decimal',()=>{
 assert.equal(String(Dec.parse('9.9').mul(new Dec(1000n,0))),'9900.0');
 assert.equal(String(Dec.parse('1e3')),'1E+3');
 assert.equal(String(Dec.parse('0.0000001')),'1E-7');
 assert.equal(Dec.parse('-2.5').round(0),-3n);
 assert.equal(Dec.parse('2318.405').round(2),231841n);
});
