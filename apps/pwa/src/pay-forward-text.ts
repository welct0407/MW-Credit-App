/** R110/R111 pay-forward copy shared by Receive payment and Loan Close (Echo RP-6, LC-1). Presentation only. */
export type ForwardRow={loanId:string;chargeId:string;chargeDate:string;principalDue:string;interestDue:string;principal:string;interest:string;lateCharge?:string;partial:boolean};
export const thaiMonthsShort=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'],monthsShort=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** R110 copy dates: "3 Nov" / "3 พ.ย."; a run "2–3 Nov", or "30 Oct – 2 Nov" across months. */
export const shortDate=(day:string|undefined,thai:boolean)=>typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)?Number(day.slice(8,10))+' '+(thai?thaiMonthsShort:monthsShort)[Number(day.slice(5,7))-1]:'—';
export const dateRange=(first:string,last:string,thai:boolean)=>first===last?shortDate(first,thai):first.slice(0,7)===last.slice(0,7)?Number(first.slice(8,10))+'–'+shortDate(last,thai):shortDate(first,thai)+' – '+shortDate(last,thai);
export const whole=(value:unknown)=>typeof value==='string'&&/^(0|[1-9][0-9]{0,16})$/.test(value);
/** R110 D6: consecutive future charges of one loan with identical amounts, each paid in full, collapse into one run. */
export function forwardRuns(rows:ForwardRow[]){
 const runs:ForwardRow[][]=[];
 for(const row of rows){const last=runs.at(-1)?.at(-1);if(last&&last.loanId===row.loanId&&!last.partial&&!row.partial&&last.principalDue===row.principalDue&&last.interestDue===row.interestDue)runs.at(-1)!.push(row);else runs.push([row]);}
 return runs;
}
export const runAmount=(row:ForwardRow)=>whole(row.principalDue)&&whole(row.interestDue)?(BigInt(row.principalDue)+BigInt(row.interestDue)).toString():'0';
