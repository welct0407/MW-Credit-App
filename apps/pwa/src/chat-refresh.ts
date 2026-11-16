/** R165: the group chat summary refresh (V150). A user taps Refresh on the summary card; the command service records one
 * open request per borrower (POST /api/collection/{borrowerId}/chat-refresh, body {}); the integration agent's next run
 * summarises that group first and reports an outcome. The collection detail (online and offline) carries the borrower's
 * current request as groupChatRefresh {requestedAt, completedAt, outcome}. This module holds the pure rules and the request
 * call; the card (CollectionChatSummary.tsx) owns the timers and the page-view memory.
 * No queueing: a tap offline does nothing (the button is disabled), and a failed request is simply tapped again. */
export type GroupChatRefreshOutcome='stored'|'unchanged'|'cleared'|'no_group'|'failed';
export type GroupChatRefresh={requestedAt:string;completedAt:string|null;outcome:GroupChatRefreshOutcome|null};
export type ChatRefreshAccess={origin:string;token:()=>Promise<string>;authFailure?:(status:number)=>void};
/** The PWA stops waiting 6 minutes after the request (the agent runs every 2 minutes and takes requests for 10). */
export const CHAT_REFRESH_CUTOFF_MS=6*60*1000;
/** While a request is pending and the detail is open, the detail is refreshed this often. */
export const CHAT_REFRESH_POLL_MS=15_000;
const OUTCOMES:readonly string[]=['stored','unchanged','cleared','no_group','failed'];
const time=(value:unknown)=>typeof value==='string'?Date.parse(value):Number.NaN;
/** A groupChatRefresh value of the V150 shape, or null. */
export function validRefresh(value:unknown):GroupChatRefresh|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const {requestedAt,completedAt,outcome}=value as Record<string,unknown>;
 if(!Number.isFinite(time(requestedAt))||(completedAt!==null&&!Number.isFinite(time(completedAt)))||(completedAt===null)!==(outcome===null)||(outcome!==null&&!OUTCOMES.includes(outcome as string)))return null;
 return {requestedAt:requestedAt as string,completedAt:completedAt as string|null,outcome:outcome as GroupChatRefreshOutcome|null};
}
/** The newer of the server's value and the one the tap answered: the later request wins; for the same request, the
 * completed one (a completion never goes back to open). */
export function mergeRefresh(server:GroupChatRefresh|null|undefined,local:GroupChatRefresh|null|undefined):GroupChatRefresh|null{
 const a=validRefresh(server),b=validRefresh(local);if(!a||!b)return a??b;
 const ta=time(a.requestedAt),tb=time(b.requestedAt);
 if(ta!==tb)return ta>tb?a:b;
 return a.completedAt!==null?a:b;
}
/** The server's open window: the agent takes a request for 10 minutes, and the next tap replaces an older one. */
export const CHAT_REFRESH_OPEN_MS=10*60*1000;
/** Device time the 6-minute wait is measured from (Chase, R165 clock skew): `seenAt`, when this device tapped or first saw
 * this open request, when given; otherwise the server's requestedAt. Never later than now, so a device whose clock is
 * behind the server's (a requestedAt in its future) waits at most 6 minutes, not 6 minutes plus the skew. */
const anchor=(value:GroupChatRefresh,now:number,seenAt:number|null)=>Math.min(seenAt??time(value.requestedAt),now);
/** Open and within the 6-minute cutoff, measured on the device clock from `anchor`. */
export const refreshPending=(value:GroupChatRefresh|null,now:number,seenAt:number|null=null)=>!!value&&value.completedAt===null&&Number.isFinite(time(value.requestedAt))&&now-anchor(value,now,seenAt)<CHAT_REFRESH_CUTOFF_MS;
/** Whether an open request this device sees for the first time starts its own 6-minute wait (seenAt = now): by the device
 * clock it is younger than the server's 10-minute open window, or in the future. That window absorbs a device clock up
 * to 10 minutes ahead; a request older than that is one the server no longer serves, and shows nothing. */
export const refreshObservable=(value:GroupChatRefresh|null,now:number)=>!!value&&value.completedAt===null&&now-time(value.requestedAt)<CHAT_REFRESH_OPEN_MS;
export type RefreshPhase='idle'|'pending'|'stored'|'unchanged'|'cleared'|'failed'|'timeout';
/** What the card shows. `watched` is the requestedAt of the request this page view tapped or saw open: an outcome, or the
 * timeout, is shown only for that request (an old completed request from another visit shows nothing). `tapFailed` is a
 * tap the command service did not take (offline mid-request, 5xx, a refusal). A pending request always shows. `seenAt`
 * is the device time this view tapped or first saw the watched request (the 6-minute wait runs from it). */
export function refreshPhase(value:GroupChatRefresh|null,watched:string|null,now:number,tapFailed=false,seenAt:number|null=null):RefreshPhase{
 if(refreshPending(value,now,seenAt))return 'pending';
 if(tapFailed)return 'failed';
 if(!value||watched===null||time(value.requestedAt)!==time(watched))return 'idle';
 if(value.completedAt===null)return 'timeout';
 return value.outcome==='stored'?'stored':value.outcome==='unchanged'?'unchanged':value.outcome==='cleared'?'cleared':'failed';
}
/** Milliseconds until a pending request reaches the cutoff: 0 when it already has or is not pending, never more than 6
 * minutes. */
export const refreshRemaining=(value:GroupChatRefresh|null,now:number,seenAt:number|null=null)=>refreshPending(value,now,seenAt)?Math.min(CHAT_REFRESH_CUTOFF_MS,Math.max(0,anchor(value!,now,seenAt)+CHAT_REFRESH_CUTOFF_MS-now)):0;
/** The card's texts for a phase (Echo R165 UX 01, 02, 08, 10, 12, 13, 14, 16). `clock` formats completedAt as HH:MM. */
export function refreshTexts(phase:RefreshPhase,thai:boolean,online:boolean,clock:string){
 const t=(en:string,th:string)=>thai?th:en;
 const label=t('Refresh group chat summary','รีเฟรชสรุปแชทกลุ่ม');
 const title=phase==='pending'?label:!online?t('Refresh needs an internet connection','ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อรีเฟรช'):phase==='failed'?t('Refresh failed — tap to retry','รีเฟรชไม่สำเร็จ — แตะเพื่อลองอีกครั้ง'):label;
 const meta=phase==='pending'?t('Refreshing summary… this can take a few minutes','กำลังรีเฟรชสรุป… อาจใช้เวลาสักครู่')
  :phase==='unchanged'?t('No new messages · checked ','ไม่มีข้อความใหม่ · ตรวจเมื่อ ')+clock
  :phase==='failed'?t('Couldn’t refresh the summary. Showing the last one.','รีเฟรชสรุปไม่สำเร็จ แสดงสรุปล่าสุดแทน')
  :phase==='timeout'?t('Still not updated. Try again later.','ยังไม่อัปเดต ลองอีกครั้งภายหลัง'):null;
 // The live region announces the start and the final outcome only (UX 16).
 const announce=phase==='pending'?t('Refreshing summary','กำลังรีเฟรชสรุป'):phase==='stored'?t('Summary updated','อัปเดตสรุปแล้ว'):meta??'';
 return {label,title,meta,announce};
}
/** POST /api/collection/{borrowerId}/chat-refresh with body {}. ok with the request's state (accepted, pending or recent),
 * or not ok with the HTTP status (0 for a network failure). A 401 is reported to the session (authFailure). */
export async function requestChatRefresh(access:ChatRefreshAccess,borrowerId:string,fetcher:typeof fetch=fetch):Promise<{ok:true;kind:'accepted'|'pending'|'recent';state:GroupChatRefresh}|{ok:false;status:number}>{
 let response:Response;
 try{
  response=await fetcher(access.origin+'/api/collection/'+encodeURIComponent(borrowerId)+'/chat-refresh',{method:'POST',headers:{Authorization:'Bearer '+await access.token(),'Content-Type':'application/json'},body:'{}',cache:'no-store',credentials:'omit',redirect:'error'});
 }catch{return {ok:false,status:0}}
 if(response.status===401)access.authFailure?.(401);
 if(!response.ok)return {ok:false,status:response.status};
 let body:any;try{body=await response.json()}catch{return {ok:false,status:response.status}}
 const state=validRefresh(body);
 if(body?.ok!==true||!['accepted','pending','recent'].includes(body.kind)||!state)return {ok:false,status:response.status};
 return {ok:true,kind:body.kind,state};
}
