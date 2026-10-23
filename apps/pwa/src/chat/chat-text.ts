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
/** "Round 2 · checking Loans, Payments…" from the `round` and `tool` events. */
export function progressText(round:number,tools:{name:string;state:string;summary?:string}[],thai:boolean){
 const names=[...new Set(tools.map(tool=>toolProgressLabel(tool,thai)))];
 const head=thai?'รอบที่ '+round:'Round '+round;
 return names.length?head+(thai?' · กำลังตรวจ ':' · checking ')+names.join(', ')+'…':head+(thai?' · กำลังคิด…':' · thinking…');
}
/** "Checked: database (2 queries), loan payoff" under a committed reply. */
export function sourcesText(tools:{name:string;count:number}[]|undefined,thai:boolean){
 if(!tools?.length)return '';
 const parts=tools.map(({name,count})=>{const label=toolLabel(name,thai),unit=TOOLS[name]?.unit;return count>1?label+' ('+count+(unit?' '+pick(unit,thai):'')+')':label});
 return (thai?'ตรวจแล้ว: ':'Checked: ')+parts.join(', ');
}
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
