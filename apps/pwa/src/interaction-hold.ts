/** UX-REFRESH-06: a background dataset update does not swap a list's rows while the user is
 * touching or scrolling it (rows would move under a finger). The newest update is held and
 * applied about one second after the interaction ends, and never later than ten seconds after
 * it arrived. Nothing is dropped: only the latest value per subscription is kept, and a stopped
 * subscription discards its own held run (read-cache re-reads that path when it is subscribed again). */
export const HOLD_SETTLE_MS=1000;
export const HOLD_MAX_MS=10*1000;
const POLL_MS=200;

/** The list element the hold watches; `true` watches the whole document. */
export type HoldScope=true|(()=>Element|null|undefined);
type Held={scope:HoldScope;since:number;run:()=>void};

const active=new Map<string,EventTarget|null>(),recent=new Map<EventTarget|null,number>(),held=new Map<symbol,Held>();
let installed=false,timer:ReturnType<typeof setTimeout>|undefined;
const now=()=>Date.now();
const isDocument=(target:EventTarget|null)=>!target||target===globalThis.window||target===globalThis.document||target===globalThis.document?.documentElement||target===globalThis.document?.body;
function within(scope:HoldScope,target:EventTarget|null){
 if(scope===true)return true;
 const element=scope();if(!element?.isConnected)return false;
 // Scrolling the page scrolls a list that flows with it (phone layout).
 if(isDocument(target))return true;
 try{return element===target||element.contains(target as Node)}catch{return false}
}
/** True while a pointer or touch that started in the scope is down, or the scope scrolled or was
 * released less than HOLD_SETTLE_MS ago. */
export function interacting(scope:HoldScope,at=now()){
 for(const target of active.values())if(within(scope,target))return true;
 for(const [target,time] of recent)if(at-time<HOLD_SETTLE_MS&&within(scope,target))return true;
 return false;
}
function prune(at:number){for(const [target,time] of recent)if(at-time>=HOLD_SETTLE_MS)recent.delete(target)}
function flush(){
 timer=undefined;const at=now();prune(at);
 for(const [token,entry] of [...held])if(at-entry.since>=HOLD_MAX_MS||!interacting(entry.scope,at)){held.delete(token);entry.run()}
 if(held.size)timer=setTimeout(flush,POLL_MS);
}
const touched=(target:EventTarget|null)=>{recent.set(target,now())};
function install(){
 if(installed||typeof window==='undefined'||typeof document==='undefined')return;installed=true;
 const options={capture:true,passive:true};
 window.addEventListener('pointerdown',event=>{active.set('p'+event.pointerId,event.target)},options);
 const pointerEnd=(event:PointerEvent)=>{const target=active.get('p'+event.pointerId);if(active.delete('p'+event.pointerId))touched(target??null)};
 window.addEventListener('pointerup',pointerEnd,options);window.addEventListener('pointercancel',pointerEnd,options);
 // Touch is tracked apart from pointers: a touch that starts a scroll cancels its pointer while the finger stays down.
 window.addEventListener('touchstart',event=>{for(const touch of Array.from(event.changedTouches))active.set('t'+touch.identifier,touch.target)},options);
 const touchEnd=(event:TouchEvent)=>{for(const touch of Array.from(event.changedTouches)){const target=active.get('t'+touch.identifier);if(active.delete('t'+touch.identifier))touched(target??null)}};
 window.addEventListener('touchend',touchEnd,options);window.addEventListener('touchcancel',touchEnd,options);
 window.addEventListener('scroll',event=>touched(event.target),options);
 // Leaving the app ends every interaction (a release outside the window may never arrive).
 const reset=()=>{for(const target of active.values())touched(target);active.clear()};
 window.addEventListener('blur',reset);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')reset()});
}
/** Runs `run` now, or holds it (replacing an earlier held run of the same token) until the scope is idle. */
export function deferWhileInteracting(token:symbol,scope:HoldScope,run:()=>void){
 install();const at=now();prune(at);
 if(!interacting(scope,at)){held.delete(token);run();return}
 held.set(token,{scope,since:held.get(token)?.since??at,run});
 if(!timer)timer=setTimeout(flush,POLL_MS);
}
/** Drops a held run; true when one was waiting. */
export function cancelDeferred(token:symbol){return held.delete(token)}
// Watch from start-up, so an interaction that began before the first update is seen.
install();
