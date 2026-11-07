// Self-contained (no relative imports) so unit tests can load it directly.
/** Requests a screen is waiting on (the header spinner). R133: each one names its kind, so the header can say what it waits for. */
export type RequestKind='read'|'save'|'receipt';
let pending=0;
const counts:Record<RequestKind,number>={read:0,save:0,receipt:0};
const listeners=new Set<()=>void>();
export const activitySnapshot=()=>pending;
/** The kind the header names while requests run: a save before a receipt reading before a read; null when none runs.
 * A primitive, so useSyncExternalStore re-renders only when it changes. */
export const activityKindSnapshot=():RequestKind|null=>counts.save>0?'save':counts.receipt>0?'receipt':counts.read>0?'read':null;
export function subscribeActivity(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
export function beginRequest(kind:RequestKind='read'){
 const counted:RequestKind=kind in counts?kind:'read';
 pending++;counts[counted]++;listeners.forEach(fn=>{fn()});let ended=false;
 return()=>{if(ended)return;ended=true;pending--;counts[counted]--;listeners.forEach(fn=>{fn()})};
}
