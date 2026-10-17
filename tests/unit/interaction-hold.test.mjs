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
