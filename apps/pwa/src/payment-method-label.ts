/** R111 LC-4: one payment method label map. Stored methods stay as they are; only the Loan Close rebate offset (posted
 * by SQL, never offered in a form) gets a bilingual label. */
export const REBATE_OFFSET_METHOD='Referral Rebate Offset';
export function paymentMethodLabel(value:unknown,thai:boolean):string{
 if(value===REBATE_OFFSET_METHOD)return thai?'หักค่าแนะนำ':'Referral Rebate Offset';
 return value===null||value===undefined?'—':String(value);
}
