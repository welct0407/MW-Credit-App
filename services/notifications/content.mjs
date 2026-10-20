// R080: lock-screen wording for one push (iPhone banner: one-line title, body of at most two lines).
// Pure: the facts come from public.pwa_notify_content_v1 (V99); any missing or unknown fact degrades to
// generic text, never to an error. Owner decision: borrower name and amount may show on the lock screen.
export const TITLE_BUDGET=30,BODY_BUDGET=80;
const ACTIVITY={
 'payment.posted':{en:'Payment received',th:'รับชำระแล้ว'},
 'loan.created':{en:'New loan',th:'สินเชื่อใหม่'},
 'loan.closed':{en:'Loan closed',th:'ปิดสินเชื่อแล้ว'}
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
/**
 * @param {{found?:boolean,eventType?:string,language?:string,borrowerName?:string|null,amount?:unknown}|null|undefined} facts
 * @returns {{title:string,body:string}}
 */
export function renderNotification(facts){
 const language=facts?.language==='th'?'th':'en';
 const activity=Object.hasOwn(ACTIVITY,facts?.eventType??'')?ACTIVITY[facts.eventType][language]:undefined;
 if(!facts||!activity)return genericNotification(language);
 const words=TEXT[language];
 if(facts.found!==true)return{title:activity,body:words.gone};
 const amount=baht(facts.amount),title=amount?activity+' '+amount:activity;
 // Body: the borrower name only (owner decision: no actor), shortened with "…" only beyond the budget. V100 already
 // picked the name for the recipient's language (English: the English name only); none gives an empty body, title only.
 const name=clean(facts.borrowerName);
 return{title,body:graphemeLength(name)>BODY_BUDGET?cut(name,BODY_BUDGET-1):name};
}
