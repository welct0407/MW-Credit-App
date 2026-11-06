// Self-contained (no relative imports) so unit tests can load it directly.
/** R133 (owner, 6 November 2026; Echo SYNC-ACT-UX-1): while the header refresh icon spins, the cell that shows "Updated HH:MM"
 * names the activity. The activity comes from the same inputs as the spinner (headerState 'loading'), so a spinning icon never
 * sits beside the time; offline preparation (poll, focus, queued saves, receipt downloads, reconciliation) does not spin it. */
export type HeaderActivity='connecting'|'signing-in'|'signing-out'|'saving'|'receipt'|'loading';
export type HeaderActivityInput={awaitingSession:boolean;status:string;requestKind:'read'|'save'|'receipt'|null;headerState:string};
/** Highest priority first: a provisional session, signing in or out, a save, a receipt reading, then any other load. */
export function headerActivity({awaitingSession,status,requestKind,headerState}:HeaderActivityInput):HeaderActivity|null{
 if(headerState!=='loading')return null;
 if(awaitingSession)return 'connecting';
 if(status==='signing_in')return 'signing-in';
 if(status==='signing_out')return 'signing-out';
 if(requestKind==='save')return 'saving';
 if(requestKind==='receipt')return 'receipt';
 return 'loading';
}
const labels:Record<HeaderActivity,[string,string]>={
 connecting:['Connecting…','กำลังเชื่อมต่อ…'],
 'signing-in':['Signing in…','กำลังเข้าสู่ระบบ…'],
 'signing-out':['Signing out…','กำลังออกจากระบบ…'],
 saving:['Saving…','กำลังบันทึก…'],
 receipt:['Reading receipt…','กำลังอ่านใบเสร็จ…'],
 loading:['Loading…','กำลังโหลด…'],
};
export const activityLabel=(activity:HeaderActivity|null,thai:boolean)=>labels[activity??'loading'][thai?1:0];
/** shown: the activity the cell names (null: the time or failure shows). startedAt: when the current spin began; shownAt: when
 * the label appeared. */
export type ActivitySettle={shown:HeaderActivity|null;startedAt:number|null;shownAt:number|null};
export const ACTIVITY_SETTLE_IDLE:ActivitySettle=Object.freeze({shown:null,startedAt:null,shownAt:null});
/** Anti-flicker (pure): the label appears only once a spin has lasted `delay` ms and stays at least `hold` ms; a change of
 * kind while it shows swaps the text without a new delay; when the spin ends after the hold the cell returns straight to
 * the time (no "Done"). wakeAt: when to call again with the same input (null: nothing is due). */
export function settleActivity(state:ActivitySettle,next:HeaderActivity|null,now:number,{delay=200,hold=600}:{delay?:number;hold?:number}={}):{state:ActivitySettle;wakeAt:number|null}{
 if(next!==null){
  if(state.shown!==null)return {state:{shown:next,startedAt:state.startedAt??now,shownAt:state.shownAt??now},wakeAt:null};
  const startedAt=state.startedAt??now;
  if(now-startedAt>=delay)return {state:{shown:next,startedAt,shownAt:now},wakeAt:null};
  return {state:{shown:null,startedAt,shownAt:null},wakeAt:startedAt+delay};
 }
 if(state.shown!==null&&state.shownAt!==null&&now-state.shownAt<hold)return {state:{shown:state.shown,startedAt:null,shownAt:state.shownAt},wakeAt:state.shownAt+hold};
 return {state:ACTIVITY_SETTLE_IDLE,wakeAt:null};
}
