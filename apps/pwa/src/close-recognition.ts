/**
 * R128 (owner, 5 November 2026): slip recognition on the Close Loan page, as Receive payment reads a slip (R075/R076,
 * SelectedCharges.tsx). Pure rules; LoanClose.tsx holds the request, its deadline and the upload guard. Nothing here writes.
 * - The amount is never filled: the closing amount is the server's quote. A slip amount is compared with it (a note).
 * - The receiving account follows R076: the slip's matched account replaces an empty account unless one was chosen by hand.
 * - The method becomes Bank Transfer unless the user changed it.
 * - The bank reference fills an empty field; a reference already on a recorded payment is named.
 * - The slip date is used only when it is the business date (the close is today's); its transfer time is then carried
 *   (hidden) into the command, else the date is named as not used.
 */
export type CloseSlipField='account'|'reference';
export type CloseRecognition={receiptId:string;phase:'reading'|'failed'|'unconfirmed'|'done';provider?:string|null;filled?:CloseSlipField[];
 slipAmount?:string|null;slipAccountId?:string|null;slipReference?:string|null;slipTime?:string|null;referenceExists?:boolean;
 dateNotUsed?:string|null;accountNote?:'unmatched'|'ambiguous'|null};
/** The form as recognition finds it; a field typed during recognition counts as not empty (touched). */
export type CloseSlipForm={account:string;method:string;bankReference:string;accountChosen:boolean;touched:ReadonlySet<string>};
export type CloseSlipFill={account?:string;method?:'Bank Transfer';bankReference?:string;transferTime:string};
export const normalizedCloseReference=(value:string)=>value.replace(/[\s-]/g,'').toUpperCase();
export const validCloseReference=(value:string)=>/^[A-Z0-9]{6,100}$/.test(value);
const validTime=(value:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const text=(value:unknown)=>typeof value==='string'?value:null;

/** The recognition response (status 200 or not, its JSON) as the recognition state and the fields it fills. */
export function readCloseSlip(receiptId:string,ok:boolean,data:any,context:{businessDate:string;accounts:{id:string}[]},form:CloseSlipForm):{recognition:CloseRecognition;fill:CloseSlipFill|null}{
 if(ok&&data?.status==='unrecognized')return {recognition:{receiptId,phase:'unconfirmed'},fill:null};
 if(!ok||data?.status!=='recognized'||!data.suggestion||typeof data.suggestion!=='object')return {recognition:{receiptId,phase:'failed'},fill:null};
 const s=data.suggestion,filled:CloseSlipField[]=[],fill:CloseSlipFill={transferTime:''};
 const amount=text(s.amountReceived),accountId=text(s.cashAccountId),reference=text(s.bankReference),day=text(s.paymentDate),time=text(s.transferTime);
 const slipAmount=amount&&/^[1-9][0-9]{0,16}$/.test(amount)?amount:null;
 const slipAccountId=accountId&&context.accounts.some(row=>row.id===accountId)?accountId:null;
 const slipReference=reference&&validCloseReference(reference)?reference:null;
 const slipDay=day&&day===context.businessDate?day:null;
 const slipTime=time&&validTime(time)&&slipDay?time:null;
 if(slipAccountId&&form.account!==slipAccountId&&!form.accountChosen){fill.account=slipAccountId;filled.push('account');}
 if(!form.touched.has('method')&&form.method!=='Bank Transfer')fill.method='Bank Transfer';
 if(slipReference&&normalizedCloseReference(form.bankReference)===''&&!form.touched.has('reference')){fill.bankReference=slipReference;filled.push('reference');}
 fill.transferTime=slipTime??'';
 const warnings:any[]=Array.isArray(data.warnings)?data.warnings:[],outside=warnings.find(w=>w?.code==='date_outside_window');
 // A slip date other than the business date is never used; name it when it was readable.
 const outsideDate=text(outside?.date)??(day&&!slipDay?day:null);
 const dateNotUsed=outside||(day&&!slipDay)?(outsideDate&&/^\d{4}-\d{2}-\d{2}$/.test(outsideDate)?outsideDate:''):null;
 const accountNote=slipAccountId?null:warnings.some(w=>w?.code==='account_ambiguous')?'ambiguous':warnings.some(w=>w?.code==='account_unmatched')||accountId?'unmatched':null;
 const provider=typeof data.provider==='string'&&/^[a-z][a-z0-9_-]{0,31}$/.test(data.provider)?data.provider.charAt(0).toUpperCase()+data.provider.slice(1):null;
 return {recognition:{receiptId,phase:'done',provider,filled,slipAmount,slipAccountId,slipReference,slipTime,referenceExists:warnings.some(w=>w?.code==='reference_exists'),dateNotUsed,accountNote},fill};
}

/** The slip facts the close command carries: bankReference and transferTime, each only when present, Bank Transfer only. */
export function closeSlipInputs(method:string,bankReference:string,transferTime:string):{bankReference?:string;transferTime?:string}{
 if(method!=='Bank Transfer')return {};
 const reference=normalizedCloseReference(bankReference);
 return {...(validCloseReference(reference)?{bankReference:reference}:{}),...(validTime(transferTime)?{transferTime}:{})};
}

export type CloseSlipNotes={status:string|null;summary:string|null;amount:{match:boolean;text:string}|null;account:string|null;accountNote:string|null;date:string|null;reference:string|null};
/**
 * Echo LC-UX: the recognition lines. status: reading / not read / not a completed transfer; summary: what was filled;
 * amount: the slip amount against the closing amount (recompared whenever the preview changes); account: R076 mismatch
 * (with the "Use slip account" button in the form); date: the slip date not used; reference: already recorded.
 */
export function closeSlipNotes(r:CloseRecognition|null,form:{amount:string|null;account:string;accountLabel:(id:string)=>string|undefined;method:string;bankReference:string},
 thai:boolean,format:{money:(value:string)=>string;day:(value:string)=>string}):CloseSlipNotes{
 const t=(en:string,th:string)=>thai?th:en,none:CloseSlipNotes={status:null,summary:null,amount:null,account:null,accountNote:null,date:null,reference:null};
 if(!r)return none;
 if(r.phase==='reading')return {...none,status:t('Reading slip…','กำลังอ่านสลิป…')};
 if(r.phase==='failed')return {...none,status:t('Slip not read — enter details manually.','อ่านสลิปไม่ได้ — กรุณากรอกรายละเอียดเอง')};
 if(r.phase==='unconfirmed')return {...none,status:t('The slip does not show a completed transfer — enter details manually.','สลิปไม่แสดงการโอนที่สำเร็จ — กรุณากรอกรายละเอียดเอง')};
 const fields=(r.filled??[]).map(field=>({account:t('account','บัญชี'),reference:t('reference','เลขอ้างอิง')})[field]);
 const summary=fields.length?`${t('From slip','จากสลิป')}${r.provider?` (${r.provider})`:''}: ${fields.join(', ')}. ${t('Check before review.','ตรวจสอบก่อนกดตรวจสอบรายการ')}`
  :t('Slip read; no empty fields to fill. Check before review.','อ่านสลิปแล้ว ไม่มีช่องว่างให้กรอก ตรวจสอบก่อนกดตรวจสอบรายการ');
 let amount:CloseSlipNotes['amount']=null;
 if(r.slipAmount&&form.amount&&/^[1-9][0-9]*$/.test(form.amount)){
  const match=BigInt(r.slipAmount)===BigInt(form.amount);
  amount={match,text:match?t('Slip amount matches the closing amount.','ยอดในสลิปตรงกับยอดปิด')
   :t(`Slip shows a different amount: ${format.money(r.slipAmount)}. Closing amount ${format.money(form.amount)}.`,`สลิปแสดงยอดที่ต่างกัน: ${format.money(r.slipAmount)} ยอดปิด ${format.money(form.amount)}`)};
 }
 const account=r.slipAccountId&&form.account!==''&&form.account!==r.slipAccountId?`${t('Slip shows a different account: ','สลิปแสดงบัญชีที่ต่างกัน: ')}${form.accountLabel(r.slipAccountId)??r.slipAccountId}.`:null;
 const accountNote=r.accountNote==='ambiguous'?t('Slip account matches more than one account — check the receiving account.','บัญชีในสลิปตรงกับหลายบัญชี — กรุณาตรวจสอบบัญชีรับชำระ')
  :r.accountNote==='unmatched'?t('Slip account not matched — check the receiving account.','บัญชีในสลิปไม่ตรงกับบัญชีรับชำระ — กรุณาตรวจสอบบัญชีรับชำระ'):null;
 const date=typeof r.dateNotUsed==='string'?(r.dateNotUsed?`${t('Slip date not used: ','ไม่ได้ใช้วันที่ตามสลิป: ')}${format.day(r.dateNotUsed)}.`:t('Slip date not used.','ไม่ได้ใช้วันที่ตามสลิป')):null;
 const reference=normalizedCloseReference(form.bankReference);
 const duplicate=r.referenceExists&&form.method==='Bank Transfer'&&reference!==''&&reference===r.slipReference?t('This reference is already on a recorded payment.','เลขอ้างอิงนี้มีอยู่ในรายการรับชำระที่บันทึกแล้ว'):null;
 return {status:null,summary,amount,account,accountNote,date,reference:duplicate};
}

/** LC-UX 7: the notes repeated on the confirmation, as plain text, in form order. */
export const closeConfirmNotes=(notes:CloseSlipNotes):string[]=>[notes.amount?.text??null,notes.account,notes.accountNote,notes.date,notes.reference].filter((line):line is string=>!!line);
