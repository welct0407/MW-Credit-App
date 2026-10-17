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

const active=new Map<string,{target:EventTarget|null;since:number}>(),recent=new Map<EventTarget|null,number>(),held=new Map<symbol,Held>();
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
 // UX-HOLD-01: a press older than the cap is treated as ended (its release was lost, e.g. the
 // touched row was removed mid-touch and touchend went to the detached node).
 for(const [key,{target,since}] of active){if(at-since>=HOLD_MAX_MS){active.delete(key);continue}if(within(scope,target))return true}
 for(const [target,time] of recent)if(at-time<HOLD_SETTLE_MS&&within(scope,target))return true;
 return false;
}
function prune(at:number){for(const [target,time] of recent)if(at-time>=HOLD_SETTLE_MS)recent.delete(target)}
function flush(){
 timer=undefined;const at=now();prune(at);
 for(const [token,entry] of [...held])if(at-entry.since>=HOLD_MAX_MS||!interacting(entry.scope,at)){held.delete(token);entry.run()}
 if(held.size)timer=setTimeout(flush,POLL_MS);
}
// Pruned on every event so a removed element is not kept alive by `recent` until the next update.
const touched=(target:EventTarget|null)=>{const at=now();prune(at);recent.set(target,at)};
const press=(key:string,target:EventTarget|null)=>{active.set(key,{target,since:now()})};
const release=(key:string)=>{const entry=active.get(key);if(active.delete(key))touched(entry?.target??null)};
/** Ends every press: the last finger or pointer is up, so anything still listed lost its release. */
const releaseAll=()=>{for(const key of [...active.keys()])release(key)};
function install(){
 if(installed||typeof window==='undefined'||typeof document==='undefined')return;installed=true;
 const options={capture:true,passive:true};
 window.addEventListener('pointerdown',event=>press('p'+event.pointerId,event.target),options);
 // pointercancel (a touch turned into a scroll) ends only that pointer; a pointerup with no other
 // pointer down ends every press, including a touch whose touchend was lost.
 window.addEventListener('pointerup',event=>{release('p'+event.pointerId);if(![...active.keys()].some(key=>key.startsWith('p')))releaseAll()},options);
 window.addEventListener('pointercancel',event=>release('p'+event.pointerId),options);
 // Touch is tracked apart from pointers: a touch that starts a scroll cancels its pointer while the finger stays down.
 // A touch listed as down but absent from event.touches lost its touchend (UX-HOLD-01).
 window.addEventListener('touchstart',event=>{if(event.touches){const down=new Set(Array.from(event.touches,touch=>'t'+touch.identifier));for(const key of [...active.keys()])if(key.startsWith('t')&&!down.has(key))release(key)}for(const touch of Array.from(event.changedTouches))press('t'+touch.identifier,touch.target)},options);
 const touchEnd=(event:TouchEvent)=>{for(const touch of Array.from(event.changedTouches))release('t'+touch.identifier);if(event.touches?.length===0)releaseAll()};
 window.addEventListener('touchend',touchEnd,options);window.addEventListener('touchcancel',touchEnd,options);
 window.addEventListener('scroll',event=>touched(event.target),options);
 // Leaving the app ends every interaction (a release outside the window may never arrive).
 const reset=releaseAll;
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
