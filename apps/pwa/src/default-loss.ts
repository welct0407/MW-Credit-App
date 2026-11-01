/** R109 Default Loan with a loss amount and kept charges: what the sheet's choices mean (pure; unit-tested). */
export type DefaultLossItem={type?:string|null;outstandingPrincipal?:string|null;defaultLoss?:string|null;defaultLossDate?:string|null;currentDailyInterest?:string|null;originalRate?:number|string|null;unpaidChargeCount?:number|null;unpaidChargeAmount?:string|null};
export type DefaultLossOutcome='write-off'|'full-keep'|'partial';
/** Why Review stays disabled; the sheet shows one message per code. */
export type DefaultLossBlocker='amount'|'partial-type'|'rate-missing'|'same-day'|'unpaid-unavailable';
export type DefaultLossPlan={
 /** Outstanding 0 after an earlier loss: only write off and close remains (amount 0, no new posting). */
 fullyLost:boolean;outstanding:number;maxAmount:number;amount:string|null;partial:boolean;
 /** 'on' or 'off' when the choice is forced (and the switch disabled); null when the Partner chooses. */
 keepForced:'on'|'off'|null;
 /** Why it is forced: a partial amount, another loan type, a fully lost loan, or (Chase D1) a full amount with nothing unpaid. */
 keepReason:'partial'|'type'|'fully-lost'|'nothing-unpaid'|null;
 /** null while any blocker applies (R109-UX-V02, V03, P01): no heading or summary contradicts the message shown. */
 keep:boolean;outcome:DefaultLossOutcome|null;
 unpaidCount:number|null;unpaidAmount:number|null;dailyBefore:number|null;dailyAfter:number|null;principalAfter:number|null;
 blockers:DefaultLossBlocker[];
};
const DAILY='ดอกเบี้ยรายวัน';
const numberOf=(value:unknown)=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
/** The prefill: outstanding principal in whole baht, truncated (the amount is a whole-baht integer). */
export const defaultLossPrefill=(item:DefaultLossItem)=>{const value=numberOf(item.outstandingPrincipal);return value===null||value<=0?'':String(Math.trunc(value))};
/** The switch's starting position: on when an unpaid charge remains, off otherwise (R109-UX-S03). */
export const defaultKeepCharges=(item:DefaultLossItem)=>(numberOf(item.unpaidChargeAmount)??0)>0;
export function planDefaultLoss(item:DefaultLossItem,{amountText,keepChoice,businessDate}:{amountText:string;keepChoice:boolean;businessDate:string|null}):DefaultLossPlan{
 const outstanding=numberOf(item.outstandingPrincipal)??0,loss=numberOf(item.defaultLoss)??0,daily=item.type===DAILY;
 const fullyLost=outstanding<=0&&loss>0,maxAmount=Math.max(0,Math.floor(outstanding));
 const text=fullyLost?'0':amountText.replace(/[,\s]/g,'');
 const valid=fullyLost||(/^(0|[1-9][0-9]*)$/.test(text)&&Number(text)>=1&&Number(text)<=maxAmount);
 const amount=valid?text:null,value=amount===null?null:Number(amount);
 const partial=!fullyLost&&value!==null&&value<outstanding;
 const unpaidCount=typeof item.unpaidChargeCount==='number'&&Number.isInteger(item.unpaidChargeCount)&&item.unpaidChargeCount>=0?item.unpaidChargeCount:null;
 const unpaidAmount=unpaidCount===null?null:numberOf(item.unpaidChargeAmount);
 // Chase D1: a full loss with nothing unpaid would leave an open loan at 0 that nothing closes, so it writes off and closes.
 const nothingUnpaid=unpaidCount!==null&&unpaidAmount!==null&&(unpaidCount===0||unpaidAmount<=0);
 const keepReason=fullyLost?'fully-lost':!daily?'type':partial?'partial':nothingUnpaid?'nothing-unpaid':null;
 const keepForced=keepReason===null?null:keepReason==='partial'?'on':'off';
 const keep=keepForced==='on'?true:keepForced==='off'?false:keepChoice;
 const rate=numberOf(item.originalRate),dailyBefore=numberOf(item.currentDailyInterest);
 const principalAfter=value===null?null:Math.max(0,outstanding-value);
 const dailyAfter=principalAfter===null||!daily?null:principalAfter===0?0:rate===null?null:Math.round(principalAfter*rate/100);
 const blockers:DefaultLossBlocker[]=[];
 if(value===null)blockers.push('amount');
 else if(partial&&!daily)blockers.push('partial-type');
 // The V68 recompute needs the frozen rate whenever principal falls on a daily-interest loan, on every path.
 if(daily&&rate===null&&value!==null&&value>0)blockers.push('rate-missing');
 if(value!==null&&value>0&&businessDate!==null&&item.defaultLossDate===businessDate)blockers.push('same-day');
 if(unpaidCount===null||unpaidAmount===null)blockers.push('unpaid-unavailable');
 const outcome:DefaultLossOutcome|null=value===null||blockers.length>0?null:partial?'partial':keep?'full-keep':'write-off';
 return {fullyLost,outstanding,maxAmount,amount,partial,keepForced,keepReason,keep,outcome,unpaidCount,unpaidAmount,dailyBefore,dailyAfter,principalAfter,blockers};
}
/** The outcome heading (also the confirm page title, R109-UX-S06). */
export function defaultLossHeading(plan:DefaultLossPlan,thai:boolean){
 const t=(en:string,th:string)=>thai?th:en;
 return plan.outcome==='partial'?t('Partial loss','ตัดหนี้สูญเงินต้นบางส่วน'):plan.outcome==='full-keep'?t('Full loss, charges kept','ตัดหนี้สูญเงินต้นทั้งหมด เก็บรายการเรียกเก็บไว้'):t('Write off and close','ตัดหนี้สูญและปิดสินเชื่อ');
}
/** The live summary (R109-UX-S04, S05); money is formatted by the caller's whole-baht formatter. */
export function defaultLossSummary(plan:DefaultLossPlan,thai:boolean,money:(value:number)=>string){
 if(!plan.outcome||plan.amount===null)return '';
 const x=money(Number(plan.amount)),n=plan.unpaidCount??0,u=money(plan.unpaidAmount??0);
 const kept=thai?(n===0?'ไม่มีรายการเรียกเก็บค้างชำระให้ติดตาม':n===1?`รายการเรียกเก็บค้างชำระ 1 รายการ ${u} ยังติดตามเก็บได้`:`รายการเรียกเก็บค้างชำระ ${n} รายการ รวม ${u} ยังติดตามเก็บได้`)
  :(n===0?'There are no unpaid charges to collect.':n===1?`1 unpaid charge of ${u} stays collectable.`:`${n} unpaid charges totalling ${u} stay collectable.`);
 const written=thai?(n===0?'ไม่มีรายการเรียกเก็บค้างชำระให้ตัดออก':n===1?`รายการเรียกเก็บค้างชำระ 1 รายการ ${u} ถูกตัดออก`:`รายการเรียกเก็บค้างชำระ ${n} รายการ รวม ${u} ถูกตัดออก`)
  :(n===0?'There are no unpaid charges to write off.':n===1?`1 unpaid charge of ${u} is written off.`:`${n} unpaid charges totalling ${u} are written off.`);
 const closes=thai?'สินเชื่อปิดเป็นผิดนัดและจะไม่รับชำระเพิ่ม':'The loan closes as Defaulted and no further payments are accepted.';
 const profit=thai?`กำไรวันนี้ลดลง ${x}`:`Today's profit falls by ${x}.`;
 const parts=plan.fullyLost?[written,closes,thai?'กำไรไม่เปลี่ยนแปลง':'Profit is unchanged.']
  :plan.outcome==='write-off'?[thai?`เงินต้นลดลง ${x} เหลือ ฿0`:`Principal falls by ${x} to ฿0.`,written,closes,profit]
  :plan.outcome==='full-keep'?[thai?`เงินต้นลดลง ${x} เหลือ ฿0`:`Principal falls by ${x} to ฿0.`,
    kept,
    thai?'ดอกเบี้ยรายวันหยุดและไม่สร้างรายการเรียกเก็บใหม่':'Daily interest stops and no new charges are created.',profit]
  :[thai?`เงินต้นลดลง ${x} เหลือ ${money(plan.principalAfter??0)}`:`Principal falls by ${x} to ${money(plan.principalAfter??0)}.`,
    ...(plan.dailyBefore!==null&&plan.dailyAfter!==null?[thai?`ดอกเบี้ยรายวันลดจาก ${money(plan.dailyBefore)} เป็น ${money(plan.dailyAfter)} สำหรับรายการเรียกเก็บใหม่`:`Daily interest falls from ${money(plan.dailyBefore)} to ${money(plan.dailyAfter)} for new charges.`]:[]),
    kept,profit];
 return parts.join(' ');
}
