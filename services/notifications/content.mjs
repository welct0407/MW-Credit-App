// R080: lock-screen wording for one push (iPhone banner: one-line title, body of at most two lines).
// Pure: the facts come from public.pwa_notify_content_v1 (V99); any missing or unknown fact degrades to
// generic text, never to an error. Owner decision: borrower name and amount may show on the lock screen.
export const TITLE_BUDGET=30,BODY_BUDGET=80;
const ACTIVITY={
 'payment.posted':{en:'Payment received',th:'รับชำระแล้ว'},
 'loan.created':{en:'New loan',th:'สินเชื่อใหม่'},
 'loan.closed':{en:'Loan closed',th:'ปิดสินเชื่อแล้ว'},
 // R090 batch 2 (B3): pwa_notify_content_v1 (V105) reports a chat reply's outcome in the event type; the body is the
 // thread title (in the borrower-name slot), shortened like a name; no figures.
 'chat.reply:ok':{en:'Reply ready',th:'ตอบแล้ว'},
 'chat.reply:failed':{en:'Reply failed',th:'ตอบไม่สำเร็จ'}
};
const TEXT={
 en:{gone:'Details no longer available',activity:'New activity'},
 th:{gone:'ไม่มีรายละเอียดแล้ว',activity:'มีรายการใหม่'}
};
const APP='MW Credit';
const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
const graphemes=text=>Array.from(segmenter.segment(text),part=>part.segment);
export const graphemeLength=text=>graphemes(text).length;
const whole=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
/** Same form as apps/pwa/src/display-money.ts wholeBaht; null or non-finite → null (amount omitted). */
export function baht(value){
 if(value==null||value==='')return null;const n=Number(value);if(!Number.isFinite(n))return null;
 const text='฿'+whole.format(Math.abs(n));return n<0&&text!=='฿0'?'-'+text:text;
}
// One line of plain text: control characters and line breaks become single spaces.
const clean=value=>typeof value==='string'?value.replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu,' ').trim():'';
const cut=(text,keep)=>graphemes(text).slice(0,keep).join('').trimEnd()+'…';
/** The generic push when nothing reliable is known (RPC failure, unknown type); English unless Thai is known. */
export function genericNotification(language){return{title:APP,body:TEXT[language==='th'?'th':'en'].activity};}
/** R111 NT-1/NT-2: the rebate a Loan close (loan.closed) or the payment that closed a referred loan (payment.posted, V124)
 * leaves to pay out, "Rebate ฿300 to <referrer>, transfer from Lisa"; none when the whole rebate settled the referrer's
 * loan (payable 0) or the facts predate V122/V124. R129: a pending rebate (v5) reads "Rebate ฿300 pending to <referrer>
 * (฿900 owed)" instead; "transfer from Lisa" stays only for a rebate booked before V137. */
function rebateLine(language,facts){
 if(!['loan.closed','payment.posted'].includes(facts.eventType??''))return null;
 // R129 (V137 pwa_notify_content_v5): a rebate not settled by offset is pending until a settlement pays it, "Rebate ฿300
 // pending to Mai (฿900 owed)" (owed: the payee's pending total now); Lisa transfers nothing at close.
 const pending=baht(facts.rebatePending);
 if(pending&&Number(facts.rebatePending)>0){const owed=baht(facts.rebateOwed);
  return payee=>language==='th'?`ค่าแนะนำ ${pending} ค้างจ่าย${payee?'ให้ '+payee:''}${owed?` (รวมค้างจ่าย ${owed})`:''}`:`Rebate ${pending} pending${payee?' to '+payee:''}${owed?` (${owed} owed)`:''}`;}
 const amount=baht(facts.rebatePayable);if(!amount||!(Number(facts.rebatePayable)>0))return null;
 return payee=>language==='th'?`ค่าแนะนำ ${amount}${payee?' ให้ '+payee:''} โอนจาก Lisa`:`Rebate ${amount}${payee?' to '+payee:''}, transfer from Lisa`;
}
/** R119 (V134 pwa_notify_content_v4 `rebates`): every rebate of the payment, payable parts summed per referrer (Echo
 * PUSH-1, in cents so the sum is exact); only payable (> 0) parts count. null when the facts predate V134. */
function payableRebates(facts){
 if(!Array.isArray(facts.rebates))return null;
 const cents=new Map(),v5=facts.rebates.some(r=>r&&typeof r==='object'&&Object.hasOwn(r,'state'));
 for(const r of facts.rebates){
  // R129: with v5 facts only a legacy remainder (Lisa paid it at close: paid-at-close, or a legacy partial offset with
  // nothing pending) is a "transfer from Lisa"; a REFERRAL_REBATE_V3 rebate (pending, paid by a settlement or offset) never is.
  if(v5&&(r?.ruleVersion==='REFERRAL_REBATE_V3'||!['paid-at-close','offset'].includes(r?.state)||Number(r?.pending)>0))continue;
  const n=Number(r?.payable);if(r?.payable==null||r.payable===''||!Number.isFinite(n)||!(n>0))continue;const payee=clean(r.payee);cents.set(payee,(cents.get(payee)??0)+Math.round(n*100));}
 return [...cents].map(([payee,c])=>({payee,payable:c/100}));
}
/** R129 (V137 v5): the pending parts summed per referrer, with the referrer's owed total; null without v5 facts. */
function pendingRebates(facts){
 if(!Array.isArray(facts.rebates)||!facts.rebates.some(r=>r&&typeof r==='object'&&Object.hasOwn(r,'state')))return null;
 const totals=new Map();
 for(const r of facts.rebates){const n=Number(r?.pending);if(r?.pending==null||r.pending===''||!Number.isFinite(n)||!(n>0))continue;const payee=clean(r.payee),owed=Number(r?.owed),entry=totals.get(payee)??{cents:0,owed:0};
  entry.cents+=Math.round(n*100);if(Number.isFinite(owed)&&owed>entry.owed)entry.owed=owed;totals.set(payee,entry);}
 return [...totals].map(([payee,e])=>({payee,payable:e.cents/100,owed:e.owed>0?e.owed:null}));
}
/** R119 (Echo PUSH-2..4): the wording of two or more referrers in one line; the last item is joined with "and"/"และ";
 * the collapsed form is the total and the number of referrers. Every push string of the several-rebates line is here. */
const REBATES={
 // R129: pending rebates of two or more referrers, each with its owed total.
 pending:{
  en:{item:(amount,payee,owed)=>amount+(payee?' to '+payee:'')+(owed?` (${owed} owed)`:''),join:items=>items.length<3?items.join(' and '):items.slice(0,-1).join(', ')+' and '+items.at(-1),
   line:list=>`Rebates pending ${list}`,total:(amount,count)=>`Rebates ${amount} pending to ${count} referrers`},
  th:{item:(amount,payee,owed)=>amount+(payee?' ให้ '+payee:'')+(owed?` (รวมค้างจ่าย ${owed})`:''),join:items=>items.slice(0,-1).join(' ')+' และ '+items.at(-1),
   line:list=>`ค่าแนะนำค้างจ่าย ${list}`,total:(amount,count)=>`ค่าแนะนำค้างจ่ายรวม ${amount} ให้ผู้แนะนำ ${count} ราย`}},
 en:{item:(amount,payee)=>amount+(payee?' to '+payee:''),join:items=>items.length<3?items.join(' and '):items.slice(0,-1).join(', ')+' and '+items.at(-1),
  line:list=>`Rebates ${list}, transfer from Lisa`,total:(amount,count)=>`Rebates ${amount} total to ${count} referrers, transfer from Lisa`},
 th:{item:(amount,payee)=>amount+(payee?' ให้ '+payee:''),join:items=>items.slice(0,-1).join(' ')+' และ '+items.at(-1),
  line:list=>`ค่าแนะนำ ${list} โอนจาก Lisa`,total:(amount,count)=>`ค่าแนะนำรวม ${amount} ให้ผู้แนะนำ ${count} ราย โอนจาก Lisa`}
};
const PAYEE_MIN=6;
/** R119: two or more referrers. Fit (BODY_BUDGET): amounts and "Lisa" are never cut; the borrower name is shortened first
 * (dropped under 2 graphemes), then every payee is cut to one equal length of at least 6; if still over, the total. */
function rebatesBody(language,list,late,name,pending=false){
 const words=pending?REBATES.pending[language]:REBATES[language],sep=' · ',tail=late?sep+late:'';
 const build=keep=>words.line(words.join(list.map(r=>words.item(baht(r.payable),keep==null||graphemeLength(r.payee)<=keep?r.payee:cut(r.payee,keep-1),r.owed==null?null:baht(r.owed)))))+tail;
 const withName=body=>{const rest=BODY_BUDGET-graphemeLength(body)-graphemeLength(sep);return name&&rest>=2?body+sep+(graphemeLength(name)>rest?cut(name,rest-1):name):body;};
 let body=build(null);
 if(graphemeLength(body)>BODY_BUDGET){
  body=null;
  for(let keep=Math.max(...list.map(r=>graphemeLength(r.payee)))-1;keep>=PAYEE_MIN&&body==null;keep--){const b=build(keep);if(graphemeLength(b)<=BODY_BUDGET)body=b;}
  body??=words.total(baht(list.reduce((sum,r)=>sum+Math.round(r.payable*100),0)/100),list.length)+tail;
  if(graphemeLength(body)>BODY_BUDGET)body=cut(body,BODY_BUDGET-1);
 }
 return withName(body);
}
/** R111: a Referral Rebate Offset payment is not cash from the referrer: "Rebate offset ฿300 · <referrer> · from loan <key>". */
const OFFSET={en:{title:'Rebate offset',from:'from loan '},th:{title:'หักค่าแนะนำ',from:'จากสินเชื่อ '}};
function offsetNotification(language,facts){
 const words=OFFSET[language],amount=baht(facts.amount),name=clean(facts.borrowerName),loan=clean(facts.rebateLoan),sep=' · ';
 const head=words.title+(amount?' '+amount:''),tail=loan?sep+words.from+loan:'';
 // The referrer's name is shortened first, then the loan key.
 const room=BODY_BUDGET-graphemeLength(head)-graphemeLength(tail)-graphemeLength(sep);
 let body=head+(name&&room>=4?sep+(graphemeLength(name)>room?cut(name,room-1):name):'')+tail;
 if(graphemeLength(body)>BODY_BUDGET)body=cut(body,BODY_BUDGET-1);
 return{title:words.title,body};
}
/** R118 (Echo LC-PUSH-1): the late-charge part of a "Payment received" push, "Late charge ฿50"; none when 0 or unknown. */
const LATE={en:'Late charge ',th:'ค่าปรับล่าช้า '};
function latePart(language,facts){
 const amount=baht(facts.lateChargeAmount);
 return facts.eventType==='payment.posted'&&amount&&Number(facts.lateChargeAmount)>0?LATE[language]+amount:'';
}
/**
 * @param {{found?:boolean,eventType?:string,language?:string,borrowerName?:string|null,amount?:unknown,rebatePayee?:string|null,rebatePayable?:unknown,paymentMethod?:string|null,rebateLoan?:string|null,lateChargeAmount?:unknown,rebatePending?:unknown,rebateOwed?:unknown,rebates?:{amount?:unknown,payee?:string|null,payable?:unknown,state?:string,pending?:unknown,owed?:unknown,ruleVersion?:string|null}[]|null}|null|undefined} facts
 * @returns {{title:string,body:string}}
 */
export function renderNotification(facts){
 const language=facts?.language==='th'?'th':'en';
 const activity=Object.hasOwn(ACTIVITY,facts?.eventType??'')?ACTIVITY[facts.eventType][language]:undefined;
 if(!facts||!activity)return genericNotification(language);
 const words=TEXT[language];
 if(facts.found!==true)return{title:activity,body:words.gone};
 if(facts.eventType==='payment.posted'&&facts.paymentMethod==='Referral Rebate Offset')return offsetNotification(language,facts);
 const amount=baht(facts.amount),title=amount?activity+' '+amount:activity;
 // Body: the borrower name only (owner decision: no actor), shortened with "…" only beyond the budget. V100 already
 // picked the name for the recipient's language (English: the English name only); none gives an empty body, title only.
 const name=clean(facts.borrowerName);
 // R119: with v4 facts the payable rebates are summed per referrer; one referrer keeps the single-rebate wording with
 // the sum, two or more take the several-rebates line.
 // R129: with v5 facts the pending parts come first (pending wording); only without any is a legacy remainder shown.
 const rebateEvent=['loan.closed','payment.posted'].includes(facts.eventType),pendingList=rebateEvent?pendingRebates(facts):null;
 if(pendingList&&pendingList.length>1)return{title,body:rebatesBody(language,pendingList,latePart(language,facts),name,true)};
 if(pendingList&&pendingList.length===1)facts={...facts,rebatePayee:pendingList[0].payee||null,rebatePending:pendingList[0].payable,rebateOwed:pendingList[0].owed,rebatePayable:null};
 else{
 const list=rebateEvent?payableRebates(facts):null;
 if(list&&list.length>1)return{title,body:rebatesBody(language,list,latePart(language,facts),name)};
 if(list)facts={...facts,rebatePayee:list[0]?.payee||null,rebatePayable:list[0]?.payable??null};
 }
 // R111: the rebate line comes first, then the borrower name; the referrer's name is shortened first, then the borrower's.
 const rebate=rebateLine(language,facts);
 // R118 (Echo LC-PUSH-2): the order is rebate line, late part, name; amounts are never cut; the name is shortened first,
 // then the referrer, and dropped when fewer than 2 graphemes remain.
 const late=latePart(language,facts),sep=' · ';
 if(rebate){
  const payee=clean(facts.rebatePayee),fixed=graphemeLength(rebate(payee?'_':''))-(payee?1:0)+(late?graphemeLength(sep+late):0);
  // NT-1 (loan.closed) shortens the referrer first; NT-2 (payment.posted) the borrower first, the referrer only as far as
  // the line needs (at least 8 kept); the amount and "Lisa" are never cut.
  const room=BODY_BUDGET-fixed-(name?(facts.eventType==='payment.posted'?graphemeLength(sep)+2:graphemeLength(sep+name)):0);
  let body=rebate(payee&&graphemeLength(payee)>room?cut(payee,Math.max(8,room-1)):payee)+(late?sep+late:'');
  if(graphemeLength(body)>BODY_BUDGET)body=cut(body,BODY_BUDGET-1);
  const rest=BODY_BUDGET-graphemeLength(body)-graphemeLength(sep);
  if(name&&rest>=2)body+=sep+(graphemeLength(name)>rest?cut(name,rest-1):name);
  return{title,body};
 }
 if(late){
  const rest=BODY_BUDGET-graphemeLength(late)-graphemeLength(sep);
  return{title,body:late+(name&&rest>=2?sep+(graphemeLength(name)>rest?cut(name,rest-1):name):'')};
 }
 return{title,body:graphemeLength(name)>BODY_BUDGET?cut(name,BODY_BUDGET-1):name};
}
