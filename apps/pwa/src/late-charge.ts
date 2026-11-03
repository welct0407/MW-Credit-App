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
const REFRESH_EN='Late charge cannot be less than what was already paid on it. Refresh to see the current amount.';
const REFRESH_TH='ค่าปรับล่าช้าต้องไม่น้อยกว่ายอดที่ชำระแล้ว รีเฟรชเพื่อดูยอดปัจจุบัน';
/** R118 (Echo LC-ERR-1, LC-ERR-R2-1): the server's refusal of a late charge below what was paid (P5B06,
 *  record_requires_reconciliation), on the edit page and both shortcuts: the paid amount may have moved since the screen
 *  was read, so the text names no figure and asks for a refresh. Any other code keeps the generic message (null). */
export function lateRejection(code:string,thai:boolean){return code==='record_requires_reconciliation'?(thai?REFRESH_TH:REFRESH_EN):null;}
/** The edit page's own check of a typed figure, before anything is sent: names the known paid amount ("฿20 already paid");
 *  without a known paid amount, the refresh text. */
export function latePaidFloorText(paid:string|null|undefined,thai:boolean){
 if(!digits(paid)||paid==='0')return thai?REFRESH_TH:REFRESH_EN;const amount=wholeBaht(paid);
 return thai?'ค่าปรับล่าช้าต้องไม่น้อยกว่า '+amount+' ที่ชำระแล้ว':'Late charge cannot be less than the '+amount+' already paid on it.';
}
/** The Collection row note (Echo LC-COL-3, LC-COL-R2-2): "Late charge ฿50", plus " · ฿50 paid" / " · ชำระแล้ว ฿50" once
 *  something was paid on it; '' without a late charge. */
export function lateNote(due:string|null|undefined,paid:string|null|undefined,thai:boolean){
 const part=latePart(due,thai);if(!part||!digits(paid)||paid==='0')return part;
 return part+' · '+(thai?'ชำระแล้ว '+wholeBaht(paid):wholeBaht(paid)+' paid');
}
