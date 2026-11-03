import {stepMoney} from './loan-form-values';
import {wholeBaht} from './display-money';
/** R118: a charge's late charge moves by 50 whole baht. */
export const LATE_STEP=50;
const digits=(value:string|null|undefined)=>typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value);
/** The late charge stepped by `step` in whole baht (a legacy fraction rounds first), never below `floor` (what was already
 * paid on it) nor 0. An unreadable value stays as it is (validation names it). */
export function stepLate(value:string|null|undefined,step:number,floor:string|null|undefined='0'):string{
 const next=stepMoney(value||'0',step);if(!digits(next))return next;
 const least=digits(floor)?BigInt(floor as string):0n;return BigInt(next)<least?least.toString():next;
}
/** True when − would go below what was paid (or below 0). */
export function lateAtFloor(value:string|null|undefined,floor:string|null|undefined='0'){return !digits(value||'0')||BigInt(value||'0')<=(digits(floor)?BigInt(floor as string):0n);}
/** "Late charge ฿50" / "ค่าปรับล่าช้า ฿50" when the amount is not zero, else ''. */
export function latePart(amount:string|null|undefined,thai:boolean){return typeof amount==='string'&&/^-?[0-9]+(\.[0-9]+)?$/.test(amount)&&Number(amount)!==0?(thai?'ค่าปรับล่าช้า ':'Late charge ')+wholeBaht(amount):'';}
/** R118 (Echo LC-ERR-1): the charge guard's refusal (P5B06, record_requires_reconciliation) for a changed late charge. */
export function lateRejection(code:string,paid:string|null|undefined,thai:boolean){
 if(code!=='record_requires_reconciliation')return null;const amount=wholeBaht(paid??'0');
 return thai?'ค่าปรับล่าช้าต้องไม่น้อยกว่า '+amount+' ที่ชำระแล้ว':'Late charge cannot be less than the '+amount+' already paid on it.';
}
