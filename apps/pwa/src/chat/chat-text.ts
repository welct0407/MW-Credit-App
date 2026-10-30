// R090 chat wording in English and Thai (design §6.2). No imports, so the unit tests transpile it on its own.

type Pair=readonly [en:string,th:string];
const pick=(pair:Pair,thai:boolean)=>thai?pair[1]:pair[0];

/** The localized reason for a failed reply: the fixed SSE error codes, plus `unavailable` (503 or network). */
const FAILURES:Record<string,Pair>={
 unavailable:['The assistant is unavailable. Try again.','ขณะนี้ผู้ช่วยไม่พร้อมใช้งาน ลองใหม่ภายหลัง'],
 MODEL_UNAVAILABLE:['This model is unavailable right now. Choose another model.','โมเดลนี้ใช้งานไม่ได้ในขณะนี้ เลือกโมเดลอื่น'],
 TURN_TIMEOUT:['The question took too long. Ask a narrower question.','คำถามนี้ใช้เวลานานเกินไป ลองถามให้เจาะจงขึ้น'],
 MODEL_TIMEOUT:['The model did not answer in time. Try again.','โมเดลไม่ตอบภายในเวลาที่กำหนด ลองอีกครั้ง'],
 TOOL_ROUNDS_EXCEEDED:['The question needed too many lookups. Ask a narrower question.','คำถามนี้ต้องค้นข้อมูลหลายครั้งเกินไป ลองถามให้เจาะจงขึ้น'],
 GROUNDING_EXCEEDED:['The figures could not be confirmed. Check the app or ask again.','ยืนยันตัวเลขไม่ได้ ตรวจสอบในแอปหรือถามอีกครั้ง'],
 PROMPT_BLOCKED:['This question could not be answered. Rephrase it.','ตอบคำถามนี้ไม่ได้ ลองถามด้วยคำอื่น'],
 INTERNAL:['Something went wrong. Try again.','เกิดข้อผิดพลาด ลองอีกครั้ง'],
 lost:['Reply not received. Refresh the chat.','ยังไม่ได้รับคำตอบ รีเฟรชแชทนี้'],
 turn_in_progress:['A reply is still being prepared in this thread.','กำลังเตรียมคำตอบในแชทนี้อยู่'],
 thread_full:['This chat is full. Start a new chat.','แชทนี้เต็มแล้ว เริ่มแชทใหม่'],
 thread_gone:['This thread is no longer available.','แชทนี้ไม่มีแล้ว'],
 thread_unavailable:['Could not open this thread.','เปิดแชทนี้ไม่ได้'],
};
export const failureText=(code:string|undefined,thai:boolean)=>pick(FAILURES[code??'']??FAILURES.INTERNAL,thai);
export type FailureAction='retry'|'edit'|'model'|'new';
/** What a failed reply offers: the same question again only where trying again can help. */
export function failureAction(code:string|undefined):FailureAction{
 if(code==='TURN_TIMEOUT'||code==='TOOL_ROUNDS_EXCEEDED'||code==='PROMPT_BLOCKED')return 'edit';
 if(code==='MODEL_UNAVAILABLE')return 'model';
 if(code==='thread_full')return 'new';
 return 'retry';
}
const ACTIONS:Record<FailureAction,Pair>={retry:['Retry','ลองอีกครั้ง'],edit:['Edit question','แก้คำถาม'],model:['Choose model','เลือกโมเดล'],new:['New chat','แชทใหม่']};
export const failureActionLabel=(action:FailureAction,thai:boolean)=>pick(ACTIONS[action],thai);

/** Tool names as the status row and the sources line show them. */
const TOOLS:Record<string,{label:Pair;unit?:Pair}>={
 read_records:{label:['records','ข้อมูล'],unit:['reads','ครั้ง']},
 sql_query:{label:['database','ฐานข้อมูล'],unit:['queries','คำสั่ง']},
 loan_payoff:{label:['loan payoff','ยอดปิดสินเชื่อ']},
 data_catalogue:{label:['catalogue','รายการตาราง']},
 sum_field:{label:['sum','ผลรวม']},
};
export const toolLabel=(name:string,thai:boolean)=>TOOLS[name]?pick(TOOLS[name].label,thai):name;
/** A running tool shows its name; a finished `read_records` shows the table it read (the event summary, lower-cased like the other labels). */
export function toolProgressLabel(tool:{name:string;state:string;summary?:string},thai:boolean){
 return tool.name==='read_records'&&tool.state==='ok'&&tool.summary?tool.summary.toLowerCase():toolLabel(tool.name,thai);
}
/** Elapsed seconds appear on the status row only from this many seconds on (R103). */
export const ELAPSED_FROM_SECONDS=5;
const MAX_PROGRESS_TOOLS=3;
/**
 * The status row of an accepted turn (R103): "Looking up data…", or "Looking up data · loans, database…" once tools
 * run (at most three distinct labels, then "…"), and "Preparing a reply…" before the first `round`. `seconds` is the
 * client-side elapsed time (" · 12 s"), empty before 5 s; the row renders it aria-hidden.
 */
export function progressText(round:number,tools:{name:string;state:string;summary?:string}[],thai:boolean,elapsedSeconds=0){
 const names=[...new Set(tools.map(tool=>toolProgressLabel(tool,thai)))];
 const head=thai?'กำลังค้นหาข้อมูล':'Looking up data';
 const list=names.slice(0,MAX_PROGRESS_TOOLS).join(', ')+(names.length>MAX_PROGRESS_TOOLS?', …':'…');
 const text=round===0&&!names.length?(thai?'กำลังเตรียมคำตอบ…':'Preparing a reply…'):names.length?head+' · '+list:head+'…';
 const whole=Math.floor(elapsedSeconds);
 return {text,seconds:whole>=ELAPSED_FROM_SECONDS?' · '+whole+(thai?' วิ':' s'):''};
}
/** "Checked: database (2 queries), loan payoff" under a committed reply. */
export function sourcesText(tools:{name:string;count:number}[]|undefined,thai:boolean){
 if(!tools?.length)return '';
 const parts=tools.map(({name,count})=>{const label=toolLabel(name,thai),unit=TOOLS[name]?.unit;return count>1?label+' ('+count+(unit?' '+pick(unit,thai):'')+')':label});
 return (thai?'ตรวจแล้ว: ':'Checked: ')+parts.join(', ');
}
/** The line under an assistant reply: the sources and the answering model, e.g. "Checked: database (2 queries) · Gemini 4 Argon". */
export const metaLine=(...parts:(string|null|undefined)[])=>parts.filter(part=>!!part).join(' · ');
/** The service stores the literal "New chat" until the first message names the thread (Archie resolution 12). */
export const threadTitle=(title:string|undefined,thai:boolean)=>!title||title==='New chat'?(thai?'แชทใหม่':'New chat'):title;
/** Short relative time for the thread list ("5 minutes ago", "yesterday"); null past a week (the caller shows the date). */
export function relativeTime(iso:string|undefined|null,thai:boolean,now=Date.now()){
 const at=iso?Date.parse(iso):Number.NaN;if(!Number.isFinite(at))return null;
 const seconds=Math.round((at-now)/1000),format=new Intl.RelativeTimeFormat(thai?'th':'en',{numeric:'auto'});
 const abs=Math.abs(seconds);
 if(abs<60)return format.format(0,'minute');
 if(abs<3600)return format.format(Math.round(seconds/60),'minute');
 if(abs<86400)return format.format(Math.round(seconds/3600),'hour');
 if(abs<7*86400)return format.format(Math.round(seconds/86400),'day');
 return null;
}
/** The Bangkok calendar date (YYYY-MM-DD) of an ISO instant, for the date shown once relativeTime gives up. */
export const bangkokDate=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.parse(iso));
export const EXAMPLES:readonly Pair[]=[
 ['What is due today?','วันนี้มีอะไรครบกำหนดบ้าง'],
 ['Payoff for <borrower> today?','ปิดยอดของ <ผู้กู้> วันนี้เท่าไร'],
 ['Profit this month','กำไรเดือนนี้'],
];
export const MAX_TEXT=4000,COUNTER_FROM=3500;

// R106 chat write proposals: the card's wording (CW2-01: the card's dismiss button is "Don't do this", never "Cancel",
// which the catalogue uses for actions such as Cancel settlement) (D7 codes, D8 consequences). The command service's own rejection
// codes are localized by the PWA's existing table (savedRejectionMessage) in ChatProposalCard.
const PROPOSAL_CODES:Record<string,Pair>={
 reviewer_required:['Only an AI Reviewer Partner can confirm changes from chat.','เฉพาะหุ้นส่วนที่เป็นผู้ตรวจสอบ AI เท่านั้นที่ยืนยันการเปลี่ยนแปลงจากแชทได้'],
 command_required:['Your account cannot record changes.','บัญชีของคุณบันทึกการเปลี่ยนแปลงไม่ได้'],
 proposal_expired:['This proposal expired. Ask again to get a new card.','ข้อเสนอนี้หมดอายุแล้ว ถามใหม่เพื่อรับการ์ดใหม่'],
 proposal_cancelled:['Cancelled. Nothing was changed.','ยกเลิกแล้ว ไม่มีการเปลี่ยนแปลง'],
 proposal_executing:['This change is already being saved.','กำลังบันทึกการเปลี่ยนแปลงนี้อยู่แล้ว'],
 command_busy:['Busy. Nothing was applied. Ask again in a moment.','ระบบกำลังยุ่ง ยังไม่มีการบันทึก ถามใหม่อีกครั้งในไม่ช้า'],
 command_unavailable:['The change was not saved: the app could not record it. Nothing was applied.','ไม่ได้บันทึกการเปลี่ยนแปลง: ระบบบันทึกรายการไม่ได้ ยังไม่มีการเปลี่ยนแปลง'],
 outcome_unknown:['Checking whether the change was saved…','กำลังตรวจสอบว่าบันทึกการเปลี่ยนแปลงแล้วหรือไม่…'],
};
/** A chat-layer code's text, or null when the code is the command service's (the caller uses the app's table). */
export const proposalCodeText=(code:string|null|undefined,thai:boolean)=>code&&PROPOSAL_CODES[code]?pick(PROPOSAL_CODES[code],thai):null;
const PROPOSAL_STATES:Record<string,Pair>={pending:['Waiting for your confirmation','รอการยืนยันของคุณ'],executing:['Saving…','กำลังบันทึก…'],done:['Done','เรียบร้อยแล้ว'],
 failed:['Not saved','ไม่ได้บันทึก'],expired:['Expired','หมดอายุแล้ว'],cancelled:['Cancelled','ยกเลิกแล้ว'],unknown:['Checking the result…','กำลังตรวจสอบผล…']};
export const proposalStateText=(state:string,thai:boolean)=>pick(PROPOSAL_STATES[state]??PROPOSAL_STATES.failed,thai);
/** Unknown past the 5-minute poll: still never "failed", and no retry (reconcile in the app first). */
export const proposalUnresolvedText=(thai:boolean)=>thai?'ยังยืนยันผลไม่ได้ ตรวจสอบในแอปก่อนถามใหม่':'The result is not confirmed yet. Check the app before asking again.';
export const proposalCountdown=(seconds:number,thai:boolean)=>{const m=Math.floor(seconds/60),s=String(seconds%60).padStart(2,'0');return (thai?'หมดอายุใน ':'Expires in ')+m+':'+s};
/** D8 consequences, bounded: amounts arrive formatted by the caller. */
export function consequenceText(item:{code:string},thai:boolean,amount?:string){
 if(item.code==='settles_all_due')return thai?'ชำระรายการเรียกเก็บที่ครบกำหนดทั้งหมดของผู้กู้รายนี้':'Settles every due charge of this borrower.';
 if(item.code==='loan_close_payoff')return (thai?'ปิดสินเชื่อด้วยยอดปิด ':'Closes the loan with the payoff of ')+(amount??'');
 if(item.code==='replaces_plan')return thai?'แทนที่รายการรับชำระและการจัดสรรเดิม':'Replaces the recorded payment and its allocation.';
 if(item.code==='destructive')return thai?'การเปลี่ยนแปลงนี้ลบหรือย้อนกลับข้อมูล และยกเลิกจากแชทไม่ได้':'This deletes or reverses records and cannot be undone from chat.';
 return '';
}
export const proposalButtons={confirm:['Confirm','ยืนยัน'] as Pair,cancel:["Don't do this",'ไม่ทำรายการ'] as Pair,open:['Open record','เปิดรายการ'] as Pair,offline:['Connect to confirm or cancel.','เชื่อมต่ออินเทอร์เน็ตเพื่อยืนยันหรือยกเลิก'] as Pair,askAgain:['Ask again','ถามใหม่'] as Pair};
/** CWR-02: the server card's short Confirm label ("Record ฿700"), or plain Confirm. */
export const confirmText=(label:{en:string;th:string}|null|undefined,thai:boolean)=>label?.en&&label.th?(thai?label.th:label.en):pick(proposalButtons.confirm,thai);
/** CWR-07: "Saved 14:05" (Bangkok) from the journal's recordedAt or the settled time; null when neither parses. */
export function savedAtText(iso:string|null|undefined,thai:boolean){
 const at=iso?Date.parse(iso):Number.NaN;if(!Number.isFinite(at))return null;
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at);
 return (thai?'บันทึกแล้ว ':'Saved ')+time;
}
export const pair=(value:Pair,thai:boolean)=>pick(value,thai);
