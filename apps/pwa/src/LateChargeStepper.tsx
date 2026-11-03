import {Icon} from './Icon';
import {wholeBaht} from './display-money';
import {LATE_STEP,stepLate,lateAtFloor} from './late-charge';
export {LATE_STEP,stepLate,lateAtFloor,latePart,lateRejection,latePaidFloorText,lateNote} from './late-charge';
/**
 * R118 (Echo LC-FORM-1, LC-REC-1, LC-COL-2/5): the −/+ buttons that move a late charge by 50, in the loan form's order and
 * markup (span.loan-step-buttons, increase then decrease). context names the charge in the buttons' accessible names
 * ("… for {loan} {date}"); − is disabled at the floor and then points at describedBy (the "already paid" note).
 */
export function LateChargeStepper({value,floor='0',thai,context='',disabled=false,describedBy,onChange}:{value:string;floor?:string|null;thai:boolean;context?:string;disabled?:boolean;describedBy?:string;onChange:(next:string)=>void}){
 const t=(en:string,th:string)=>thai?th:en,suffix=context?t(' for ',' สำหรับ ')+context:'',atFloor=lateAtFloor(value,floor);
 return <span className="loan-step-buttons"><button type="button" disabled={disabled} aria-label={t('Increase late charge by '+LATE_STEP,'เพิ่มค่าปรับล่าช้า '+LATE_STEP)+suffix} onClick={()=>onChange(stepLate(value,LATE_STEP,floor))}><Icon name="increase"/></button><button type="button" disabled={disabled||atFloor} aria-describedby={atFloor?describedBy:undefined} aria-label={t('Decrease late charge by '+LATE_STEP,'ลดค่าปรับล่าช้า '+LATE_STEP)+suffix} onClick={()=>onChange(stepLate(value,-LATE_STEP,floor))}><Icon name="decrease"/></button></span>;
}
/** The before → after figure of a changed amount (Echo LC-FORM-4); an unchanged amount shows once. */
export function ChangedAmount({before,after,thai}:{before:string|null|undefined;after:string;thai:boolean}){
 if(before===undefined||before===null||wholeBaht(before)===wholeBaht(after))return <>{wholeBaht(after)}</>;
 return <><span className="chat-proposal-before">{wholeBaht(before)}</span><span aria-hidden="true"> → </span><span className="visually-hidden">{thai?' เปลี่ยนเป็น ':' becomes '}</span><strong>{wholeBaht(after)}</strong></>;
}
