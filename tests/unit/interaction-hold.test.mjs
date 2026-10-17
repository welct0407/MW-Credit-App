import test,{mock} from 'node:test';
import assert from 'node:assert/strict';

// UX-REFRESH-06: a list update waits while the list is touched or scrolled, applies about 1 s
// after the interaction ends and is never held longer than 10 s.
globalThis.window=new EventTarget();
globalThis.document=Object.assign(new EventTarget(),{visibilityState:'visible'});
mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-10-17T00:00:00Z')});
const {deferWhileInteracting,cancelDeferred,HOLD_SETTLE_MS,HOLD_MAX_MS}=await import('../../apps/pwa/src/interaction-hold.ts');
const fire=(type,fields={})=>window.dispatchEvent(Object.assign(new Event(type),fields));
const tick=ms=>mock.timers.tick(ms);
const recorder=()=>{const seen=[];return {seen,run:value=>()=>seen.push(value)}};
const idle=()=>{fire('blur');tick(HOLD_SETTLE_MS+500)};

test('applies at once when nothing is touched or scrolled',()=>{
 idle();const {seen,run}=recorder();deferWhileInteracting(Symbol(),true,run('now'));assert.deepEqual(seen,['now']);
});

test('holds during a press, keeps only the newest value and applies about one second after release',()=>{
 idle();const {seen,run}=recorder(),token=Symbol();
 fire('pointerdown',{pointerId:1});deferWhileInteracting(token,true,run('first'));deferWhileInteracting(token,true,run('second'));
 tick(5000);assert.deepEqual(seen,[]);
 fire('pointerup',{pointerId:1});tick(HOLD_SETTLE_MS-200);assert.deepEqual(seen,[]);
 tick(500);assert.deepEqual(seen,['second']);
 tick(5000);assert.deepEqual(seen,['second']);
});

test('a touch that turns into a scroll stays held while the finger is down, then while scrolling continues',()=>{
 idle();const {seen,run}=recorder();
 fire('pointerdown',{pointerId:2});fire('touchstart',{changedTouches:[{identifier:7,target:null}]});
 deferWhileInteracting(Symbol(),true,run('rows'));
 // The browser cancels the pointer once the touch starts a scroll; the finger is still down.
 fire('pointercancel',{pointerId:2});tick(2000);assert.deepEqual(seen,[]);
 fire('touchend',{changedTouches:[{identifier:7,target:null}]});
 // Momentum scrolling after the finger lifts keeps the hold.
 for(let step=0;step<6;step++){tick(300);fire('scroll');}
 assert.deepEqual(seen,[]);tick(HOLD_SETTLE_MS+300);assert.deepEqual(seen,['rows']);
});

test('is never held longer than the cap and a stopped subscription drops its held value',()=>{
 idle();const {seen,run}=recorder(),dropped=Symbol();
 fire('pointerdown',{pointerId:3});deferWhileInteracting(Symbol(),true,run('capped'));deferWhileInteracting(dropped,true,run('dropped'));cancelDeferred(dropped);
 tick(HOLD_MAX_MS-300);assert.deepEqual(seen,[]);tick(600);assert.deepEqual(seen,['capped']);
 fire('pointerup',{pointerId:3});tick(HOLD_SETTLE_MS*3);assert.deepEqual(seen,['capped']);
});

test('a scoped hold waits only for interaction inside its list or on the page it scrolls with',()=>{
 idle();const {seen,run}=recorder(),list={isConnected:true,contains:target=>target==='inside'},scope=()=>list;
 const touch=(type,identifier,target)=>fire(type,{changedTouches:[{identifier,target}]});
 touch('touchstart',8,'outside');deferWhileInteracting(Symbol(),scope,run('outside'));assert.deepEqual(seen,['outside']);touch('touchend',8,'outside');
 touch('touchstart',9,'inside');deferWhileInteracting(Symbol(),scope,run('inside'));assert.deepEqual(seen,['outside']);
 touch('touchend',9,'inside');tick(HOLD_SETTLE_MS+300);assert.deepEqual(seen,['outside','inside']);
 // A page scroll (target: the document) holds a list that flows with the page; a detached list never waits.
 fire('scroll');deferWhileInteracting(Symbol(),scope,run('page'));assert.deepEqual(seen,['outside','inside']);
 deferWhileInteracting(Symbol(),()=>({isConnected:false,contains:()=>true}),run('detached'));assert.deepEqual(seen,['outside','inside','detached']);
 tick(HOLD_SETTLE_MS+300);assert.deepEqual(seen,['outside','inside','detached','page']);
});

// UX-HOLD-01: a touch whose touchend is lost (the touched row was removed mid-touch, so the event
// went to a detached node) must not hold every page-wide list for good.
test('the last pointer up ends a touch whose touchend was lost',()=>{
 idle();const {seen,run}=recorder();
 fire('touchstart',{changedTouches:[{identifier:20,target:'removed-row'}]});fire('pointerdown',{pointerId:20});
 deferWhileInteracting(Symbol(),true,run('rows'));fire('pointerup',{pointerId:20});
 tick(HOLD_SETTLE_MS+300);assert.deepEqual(seen,['rows']);
});

test('a touchend with no fingers left, or a new touch that does not list it, ends a lost touch',()=>{
 idle();const {seen,run}=recorder();
 fire('touchstart',{changedTouches:[{identifier:21,target:'removed-row'}]});
 fire('touchstart',{changedTouches:[{identifier:22,target:'other'}],touches:[{identifier:21},{identifier:22}]});
 deferWhileInteracting(Symbol(),true,run('both-up'));
 fire('touchend',{changedTouches:[{identifier:22,target:'other'}],touches:[]});
 tick(HOLD_SETTLE_MS+300);assert.deepEqual(seen,['both-up']);
 fire('touchstart',{changedTouches:[{identifier:23,target:'removed-row'}]});
 // The next touch lists only itself: touch 23 is no longer down, so a list holding on 23's row does not wait.
 fire('touchstart',{changedTouches:[{identifier:24,target:'elsewhere'}],touches:[{identifier:24}]});
 tick(HOLD_SETTLE_MS+300);
 const list={isConnected:true,contains:target=>target==='removed-row'};
 deferWhileInteracting(Symbol(),()=>list,run('scoped'));assert.deepEqual(seen,['both-up','scoped']);
 fire('touchend',{changedTouches:[{identifier:24,target:'elsewhere'}],touches:[]});
});

test('a press older than the cap no longer holds a new update',()=>{
 idle();const {seen,run}=recorder();
 fire('touchstart',{changedTouches:[{identifier:25,target:'removed-row'}]});
 deferWhileInteracting(Symbol(),true,run('held'));tick(HOLD_MAX_MS+300);assert.deepEqual(seen,['held']);
 // The stuck touch has expired: a later update applies at once instead of lagging another 10 s.
 deferWhileInteracting(Symbol(),true,run('later'));assert.deepEqual(seen,['held','later']);
});

test('a pointer cancelled by a scroll ends only itself, not the finger still down',()=>{
 idle();const {seen,run}=recorder();
 fire('pointerdown',{pointerId:26});fire('touchstart',{changedTouches:[{identifier:26,target:null}]});
 fire('pointercancel',{pointerId:26});deferWhileInteracting(Symbol(),true,run('rows'));
 tick(3000);assert.deepEqual(seen,[]);
 fire('touchend',{changedTouches:[{identifier:26,target:null}],touches:[]});tick(HOLD_SETTLE_MS+300);assert.deepEqual(seen,['rows']);
});

// UX-HOLD-03: on a computer, a mouse resting on a clickable row or keyboard focus on one also holds, under the same cap.
const fireAt=(type,target,fields={})=>{const event=Object.assign(new Event(type),fields);Object.defineProperty(event,'target',{value:target});window.dispatchEvent(event)};
const element=(clickable,{focusVisible=false}={})=>{const node={isConnected:true,matches:selector=>selector===':focus-visible'&&focusVisible};node.closest=()=>clickable?node:null;return node};

test('a mouse resting on a clickable row in the list holds, until it leaves or the cap',()=>{
 idle();const {seen,run}=recorder(),row=element(true),list={isConnected:true,contains:target=>target===row};
 fireAt('pointerover',row,{pointerType:'mouse'});
 deferWhileInteracting(Symbol(),()=>list,run('hover'));tick(3000);assert.deepEqual(seen,[]);
 fireAt('pointerout',row,{pointerType:'mouse',relatedTarget:null});tick(300);assert.deepEqual(seen,['hover']);
 fireAt('pointerover',row,{pointerType:'mouse'});deferWhileInteracting(Symbol(),true,run('capped'));
 tick(HOLD_MAX_MS+300);assert.deepEqual(seen,['hover','capped']);
 fireAt('pointerout',row,{pointerType:'mouse',relatedTarget:null});
});

test('hover on a touch screen, on a non-clickable area or outside the list does not hold',()=>{
 idle();const {seen,run}=recorder(),row=element(true),other=element(true),list={isConnected:true,contains:target=>target===row};
 fireAt('pointerover',row,{pointerType:'touch'});deferWhileInteracting(Symbol(),true,run('touch'));
 fireAt('pointerover',element(false),{pointerType:'mouse'});deferWhileInteracting(Symbol(),true,run('plain'));
 fireAt('pointerover',other,{pointerType:'mouse'});deferWhileInteracting(Symbol(),()=>list,run('outside'));
 assert.deepEqual(seen,['touch','plain','outside']);
 // A hovered row removed from the page no longer holds.
 other.isConnected=false;deferWhileInteracting(Symbol(),true,run('removed'));assert.deepEqual(seen,['touch','plain','outside','removed']);
 fire('blur');
});

test('keyboard focus on a row holds; focus left by a mouse click does not',()=>{
 idle();const {seen,run}=recorder(),keyboard=element(true,{focusVisible:true}),clicked=element(true);
 fireAt('focusin',keyboard);deferWhileInteracting(Symbol(),true,run('keyboard'));tick(2000);assert.deepEqual(seen,[]);
 fireAt('focusout',keyboard,{relatedTarget:null});tick(300);assert.deepEqual(seen,['keyboard']);
 fireAt('focusin',clicked);deferWhileInteracting(Symbol(),true,run('clicked'));assert.deepEqual(seen,['keyboard','clicked']);
 // Leaving the app ends hover and focus holds.
 fireAt('focusin',keyboard);fireAt('pointerover',keyboard,{pointerType:'mouse'});fire('blur');
 deferWhileInteracting(Symbol(),true,run('after-blur'));assert.deepEqual(seen,['keyboard','clicked','after-blur']);
});
