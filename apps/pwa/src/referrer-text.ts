/** R129 (V137): pure helpers of the Referrers pages (no imports, unit-tested in tests/unit/rebate-settlement-pwa.test.mjs). */
/** Every typed word must appear in the Thai or the English name (the Borrowers page search). */
export function matchesReferrer(row:{name?:string|null;description?:string|null},query:string){
 const words=query.toLocaleLowerCase().split(/\s+/).filter(Boolean),text=[row.name,row.description].map(v=>String(v??'').toLocaleLowerCase()).join(' ');
 return words.every(word=>text.includes(word));
}
/** The ascending order rebate-settlement.create requires (UTF-8 byte order, the SQL COLLATE "C" comparison); no duplicates. */
export function sortedIds(ids:string[]){
 const encoder=new TextEncoder(),bytes=(value:string)=>encoder.encode(value);
 return [...new Set(ids)].sort((a,b)=>{const x=bytes(a),y=bytes(b);for(let k=0;k<Math.min(x.length,y.length);k++)if(x[k]!==y[k])return x[k]-y[k];return x.length-y.length});
}
/** The sum of decimal money strings, exact in satang, as a two-place decimal string. */
export const moneySum=(values:string[])=>(values.reduce((total,value)=>total+Math.round(Number(value)*100),0)/100).toFixed(2);
export type Referee={borrowerId:string;borrowerLabel:string;loanCount:number;openLoanCount:number;unpaidAmount:string;paidAmount:string;offsetAmount:string;accruingAmount:string};
/** A referred borrower's second line: the loans ("3 loans · 1 open") and the non-zero rebate parts, or null rebates when all
 * are zero (the page shows "No rebates yet", muted). `money` formats a whole-baht amount. */
export function refereeBreakdown(row:Referee,thai:boolean,money:(value:string)=>string){
 const t=(en:string,th:string)=>thai?th:en,n=row.loanCount,open=row.openLoanCount;
 const loans=n===0?t('No loans','ไม่มีสินเชื่อ'):t(n+(n===1?' loan':' loans'),'สินเชื่อ '+n+' รายการ')+(open>0?' · '+t(open+' open','ยังไม่ปิด '+open):'');
 const parts=([['unpaidAmount','Unpaid','ค้างจ่าย'],['paidAmount','Paid','จ่ายแล้ว'],['offsetAmount','Offset','หัก'],['accruingAmount','Accruing','กำลังสะสม']] as const)
  .filter(([key])=>Math.round(Number(row[key])*100)!==0).map(([key,en,th])=>t(en,th)+' '+money(row[key]));
 return {loans,rebates:parts.length?parts.join(' · '):null};
}
/** R184 (V155): pure helpers of the Pay rebates page: the order an amount is applied in, the command's lines and the amount
 * field's states. Amounts are whole baht (a rebate, its offset and every settlement amount are whole). */
export type SettleRow={expenseId:string;closeDate:string;pendingAmount:string};
const byteOrder=(a:string,b:string)=>{const encoder=new TextEncoder(),x=encoder.encode(a),y=encoder.encode(b);for(let k=0;k<Math.min(x.length,y.length);k++)if(x[k]!==y[k])return x[k]-y[k];return x.length-y.length};
/** Whole baht of a decimal money string ("300.00" is 300). */
export const wholeAmount=(value:string|number|null|undefined)=>Math.round(Number(value??0));
/** Oldest close first, then the expense id in UTF-8 byte order: the order of GET /api/referrers/:id `unpaid` (design D5). */
export function oldestFirst<T extends SettleRow>(rows:T[]):T[]{return [...rows].sort((a,b)=>a.closeDate<b.closeDate?-1:a.closeDate>b.closeDate?1:byteOrder(a.expenseId,b.expenseId))}
/** An amount applied over rebates, oldest close first: per rebate what it gets now and what stays pending (a rebate the
 * amount never reaches gets 0). The amount is capped at the rows' total. */
export function applyOldestFirst<T extends SettleRow>(rows:T[],amount:number):{row:T;applied:number;remaining:number}[]{
 let rest=Math.max(0,Math.floor(amount));
 return oldestFirst(rows).map(row=>{const pending=wholeAmount(row.pendingAmount),applied=Math.min(rest,pending);rest-=applied;return {row,applied,remaining:pending-applied}});
}
/** The command's `allocations`: only the rebates that get more than ฿0, ascending by expense id (byte order), as strings. */
export function settlementAllocations(rows:SettleRow[],amount:number):{expenseId:string;amount:string;expectedPending:string}[]{
 return applyOldestFirst(rows,amount).filter(line=>line.applied>0).map(line=>({expenseId:line.row.expenseId,amount:String(line.applied),expectedPending:String(wholeAmount(line.row.pendingAmount))}))
  .sort((a,b)=>byteOrder(a.expenseId,b.expenseId));
}
/** Typed or pasted amount text without thousands separators, spaces and the baht sign (the value stays plain digits). */
export const cleanAmountInput=(text:string)=>text.replace(/[,\s฿]/g,'');
export type SettleAmountState='ok'|'empty'|'zero'|'format'|'over-total'|'over-cap';
/** The amount field's state: `total` is the ticked rebates' pending total, `cap` what an offset can take (null when paying
 * the referrer). Above both, the offset cap is named when it is the lower one. */
export function settleAmountState(text:string,total:number,cap:number|null):SettleAmountState{
 if(text==='')return 'empty';
 if(!/^[0-9]+$/.test(text)||text.length>12)return 'format';
 const value=Number(text);
 if(value<1)return 'zero';
 if(cap!==null&&cap<total&&value>cap)return 'over-cap';
 if(value>total)return 'over-total';
 return 'ok';
}
/** The amount the field shows until it is edited: the ticked total when paying the referrer; for an offset what is due now
 * (the most the plan takes when nothing is due), never more than the ticked total. */
export function defaultSettleAmount(destination:'referrer'|'offset',total:number,offset:{dueAmount?:string;maxAmount?:string}|null):number{
 if(destination!=='offset')return total;
 const due=wholeAmount(offset?.dueAmount),most=wholeAmount(offset?.maxAmount);
 return Math.min(total,due>0?due:most);
}
export type OffsetPreviewLine={chargeId:string;loanId:string|null;chargeDate:string;amount:string;remaining:string;due:boolean;booked:boolean};
/** The offset preview per loan, in the plan's order: the charge dates it pays, their count, the one amount when every charge
 * takes the same, and the last date paid in full. */
export function offsetPreviewRuns(lines:OffsetPreviewLine[],paidThrough:Record<string,string>={}):{loanId:string;first:string;last:string;count:number;each:string|null;amount:number;paidThrough:string|null}[]{
 const runs=new Map<string,{loanId:string;first:string;last:string;count:number;each:string|null;amount:number;paidThrough:string|null}>();
 for(const line of lines){const key=line.loanId??'',run=runs.get(key);
  if(!run)runs.set(key,{loanId:key,first:line.chargeDate,last:line.chargeDate,count:1,each:line.amount,amount:wholeAmount(line.amount),paidThrough:paidThrough[key]??null});
  else{run.count++;run.amount+=wholeAmount(line.amount);if(line.chargeDate<run.first)run.first=line.chargeDate;if(line.chargeDate>run.last)run.last=line.chargeDate;if(run.each!==line.amount)run.each=null;}}
 return [...runs.values()];
}
/** A settlement history row is an offset settlement, a payment to the referrer, a close-time offset or a legacy row. */
export function historyKind(row:{kind?:string;destination?:string|null}):'settlement-offset'|'settlement'|'offset'|'paid-at-close'{
 return row.kind==='settlement'?(row.destination==='offset'?'settlement-offset':'settlement'):row.kind==='offset'?'offset':'paid-at-close';
}
/** D11: a referrer's tiles reconcile: every rebate is unpaid, paid or offset (exact in satang). */
export const tilesTotal=(row:{unpaidAmount:string;paidToDate:string;offsetToDate:string})=>moneySum([row.unpaidAmount,row.paidToDate,row.offsetToDate]);
/** UX-R184-16: a short phrase that must not break across lines ("paid through 6 Nov", "ชำระถึง 9 พ.ย."): its spaces
 * become non-breaking, so the date stays whole and with its words. */
export const keepTogether=(text:string)=>text.replace(/ /g,'\u00a0');
