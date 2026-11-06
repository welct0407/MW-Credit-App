import test from 'node:test';
import assert from 'node:assert/strict';

// R131 (owner, 6 November 2026): Back returns to the opened row's place in its list. A small layout model stands in for the
// browser: each element sits at y inside its parent; a scrolling element offsets its children by its scrollTop; <main>
// sits at the top of the page, offset by the window scroll.
const unquote=value=>value.slice(1,-1).replace(/\\(.)/g,'$1');
class El extends EventTarget{
 constructor(tag,{cls='',record=null,y=0,h=40,scroll=false,height=0,tabindex=false,disabled=false}={}){super();Object.assign(this,{tag,cls,record,y,h,scroll,height,tabindex,disabled,children:[],parentElement:null,top:0,hidden:false})}
 append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node)}return this}
 remove(){const parent=this.parentElement;if(parent)parent.children.splice(parent.children.indexOf(this),1);this.parentElement=null}
 get isConnected(){let node=this;while(node.parentElement)node=node.parentElement;return node===doc.root}
 get scrollHeight(){return Math.max(this.height,this.children.reduce((end,child)=>Math.max(end,child.y+child.h),0))}
 get clientHeight(){return this.scroll&&this.height?this.height:this.scrollHeight}
 get scrollTop(){return this.top}
 set scrollTop(value){this.top=Math.max(0,Math.min(value,this.scrollHeight-this.clientHeight))}
 getAttribute(name){return name==='class'?this.cls:name==='data-record-id'?this.record:name==='tabindex'&&this.tabindex?'0':null}
 hasAttribute(name){return this.getAttribute(name)!==null}
 matches(selector){
  if(selector==='main')return this.tag==='main';
  if(selector==='[data-record-id]')return this.record!==null;
  let match=/^\[data-record-id=(".*")\]$/.exec(selector);if(match)return this.record===unquote(match[1]);
  match=/^\[class~=(".*")\]$/.exec(selector);if(match)return this.cls.split(/\s+/).includes(unquote(match[1]));
  throw Error('selector '+selector);
 }
 *walk(){for(const child of this.children){yield child;yield* child.walk()}}
 querySelectorAll(selector){return [...this.walk()].filter(node=>node.matches(selector))}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null}
 closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null}
 contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false}
 getBoundingClientRect(){
  let top=this.y;for(let parent=this.parentElement;parent;parent=parent.parentElement){top+=parent.y;if(parent.scroll)top-=parent.scrollTop;if(parent.tag==='main')top-=win.scrollY}
  return {top,bottom:top+this.h,height:this.h};
 }
 getClientRects(){for(let node=this;node;node=node.parentElement)if(node.hidden)return [];return [{}]}
 focus(){if(!this.disabled)doc.activeElement=this}
 scrollIntoView(){this.scrolledIntoView=true}
}
const doc={root:new El('html'),body:null,activeElement:null,querySelector(selector){return this.root.querySelector(selector)}};
doc.body=new El('body');doc.root.append(doc.body);
const win={scrollY:0,innerHeight:800,maxScroll:5000,scrollTo(x,y){if(typeof x==='object')throw TypeError('the app uses scrollTo(x, y)');this.scrollY=Math.max(0,Math.min(y,this.maxScroll))}};
let frames=[],clock=0,nextFrame=1;
Object.assign(globalThis,{document:doc,window:win,getComputedStyle:node=>({overflowY:node.scroll?'auto':'visible'}),performance:{now:()=>clock},
 requestAnimationFrame:callback=>{const id=nextFrame++;frames.push({id,callback});return id},cancelAnimationFrame:id=>{frames=frames.filter(frame=>frame.id!==id)}});
const fire=(target,type,fields={})=>target.dispatchEvent(Object.assign(new Event(type),fields));
const runFrames=(count=40)=>{for(let index=0;index<count&&frames.length;index++){const due=frames;frames=[];clock+=16;for(const frame of due)frame.callback(clock)}};
const {createListReturn,RESTORE_WINDOW_MS,RESTORE_CAP_MS}=await import('../../apps/pwa/src/list-return.ts');

function page(){doc.body.children.slice().forEach(node=>{node.remove()});const main=new El('main');doc.body.append(main);win.scrollY=0;doc.activeElement=null;frames=[];return main}
const rows=(count,start=0)=>Array.from({length:count},(_,index)=>new El('button',{cls:'borrower-card',record:'row-'+(index+start),y:(index+start)*50,h:44}));
const list=(options,count=60)=>new El('section',{cls:'list-panel',...options}).append(...rows(count));

test('phone: the window returns to the opened row and the row takes focus',()=>{
 const main=page();win.innerHeight=800;const section=list({});main.append(section);
 win.scrollTo(0,1200);const opened=section.children[30];const before=opened.getBoundingClientRect().top;
 const position=createListReturn();position.leave(opened);
 // The detail replaces the list and starts at the top.
 section.remove();main.append(new El('article',{cls:'borrower-record',h:300}));win.scrollTo(0,0);
 // Back: the list mounts again (new elements, same records) and restore runs after the state change.
 main.children.slice().forEach(node=>{node.remove()});const again=list({});main.append(again);position.restore();
 assert.equal(win.scrollY,0,'nothing moves before the next frame');
 runFrames();
 assert.equal(win.scrollY,1200);assert.equal(again.children[30].getBoundingClientRect().top,before);assert.equal(doc.activeElement,again.children[30]);
});

test('desktop: a scrolling list panel that remounts gets its position back; a kept sibling panel too',()=>{
 const main=page();const grid=new El('div',{cls:'work-grid'});const panel=list({scroll:true,height:600});const detail=new El('section',{cls:'detail-panel',scroll:true,height:600,y:0}).append(...rows(30,100));
 grid.append(panel,detail);main.append(grid);panel.scrollTop=900;detail.scrollTop=400;
 const position=createListReturn();position.leave(detail.children[15],{keep:[panel]});
 grid.remove();main.append(new El('section',{cls:'borrower-record',h:200}));
 main.children.slice().forEach(node=>{node.remove()});
 const grid2=new El('div',{cls:'work-grid'}),panel2=list({scroll:true,height:600}),detail2=new El('section',{cls:'detail-panel',scroll:true,height:600}).append(...rows(30,100));
 grid2.append(panel2,detail2);main.append(grid2);position.restore();runFrames();
 assert.equal(panel2.scrollTop,900);assert.equal(detail2.scrollTop,400);assert.equal(doc.activeElement,detail2.children[15]);
});

test('top: the section that also hosts the detail starts at the top, and Back restores the list position',()=>{
 const main=page();const section=list({cls:'borrower-record',scroll:true,height:600});main.append(section);section.scrollTop=1000;
 const position=createListReturn();position.leave(section.children[25],{top:true});assert.equal(section.scrollTop,0);
 // The same element now shows the detail; the user scrolls it.
 const rowsBefore=section.children.slice();rowsBefore.forEach(node=>{node.remove()});section.append(new El('dl',{h:1500}));section.dispatchEvent(new Event('wheel'));section.scrollTop=500;
 section.children.slice().forEach(node=>{node.remove()});section.append(...rows(60));position.restore();runFrames();
 assert.equal(section.scrollTop,1000);assert.equal(doc.activeElement,section.children[25]);
});

test('top on a phone: the opened detail starts at the top of the window, and Back returns to the row',()=>{
 const main=page();const section=list({cls:'borrower-record'},45);main.append(section);win.scrollTo(0,901);
 const opened=section.children[30],before=opened.getBoundingClientRect().top;
 const position=createListReturn();position.leave(opened,{top:true});
 assert.equal(win.scrollY,0,'the detail starts at the top');
 section.children.slice().forEach(node=>{node.remove()});section.append(new El('dl',{h:1500}));
 section.children.slice().forEach(node=>{node.remove()});section.append(...rows(45));position.restore();runFrames();
 assert.equal(win.scrollY,901);assert.equal(section.children[30].getBoundingClientRect().top,before);assert.equal(doc.activeElement,section.children[30]);
});

test('opening starts at the top by default; top:false leaves a list that stays on screen where it is',()=>{
 const main=page();const panel=list({scroll:true,height:600});main.append(panel);panel.scrollTop=800;win.scrollTo(0,300);
 const position=createListReturn();position.leave(panel.children[20]);assert.equal(panel.scrollTop,0);assert.equal(win.scrollY,0);
 position.restore();runFrames();assert.equal(panel.scrollTop,800);assert.equal(win.scrollY,300);
 position.leave(panel.children[20],{top:false});assert.equal(panel.scrollTop,800);assert.equal(win.scrollY,300);position.cancel();
});

test('a list that loads after Back is waited for, then focused; positions are re-applied while it grows',()=>{
 const main=page();const section=list({});main.append(section);win.scrollTo(0,800);
 const position=createListReturn();position.leave('row-20');
 section.remove();win.scrollTo(0,0);const empty=new El('section',{cls:'list-panel'});main.append(empty);position.restore();
 runFrames(3);assert.equal(doc.activeElement,null);
 empty.append(...rows(60));runFrames();
 assert.equal(win.scrollY,800);assert.equal(doc.activeElement,empty.children[20]);
});

test('a row that arrives after the half-second window is still waited for (up to the cap), anchored and focused',()=>{
 const main=page();const section=list({});main.append(section);win.scrollTo(0,1200);const before=section.children[30].getBoundingClientRect().top;
 const position=createListReturn();position.leave(section.children[30]);
 section.remove();const later=new El('section',{cls:'list-panel'});main.append(later);position.restore();
 runFrames(55);assert.ok(clock>RESTORE_WINDOW_MS+500,'past the window');assert.ok(frames.length>0,'still waiting for the row');assert.equal(doc.activeElement,null);
 later.append(...rows(60));runFrames(5);assert.equal(doc.activeElement,later.children[30]);assert.ok(frames.length>0,'anchoring frames still run');
 runFrames(20);assert.equal(frames.length,0,'finished after the anchoring frames');assert.equal(later.children[30].getBoundingClientRect().top,before);assert.equal(win.scrollY,1200);
});

test('a row that never arrives ends at the cap; a restore without a row key ends at the half-second window',()=>{
 const main=page();const section=list({});main.append(section);win.scrollTo(0,600);
 const position=createListReturn();position.leave(section.children[10]);section.remove();main.append(new El('section',{cls:'list-panel'}));
 const start=clock;position.restore();runFrames(500);assert.equal(frames.length,0);assert.ok(clock-start>=RESTORE_CAP_MS&&clock-start<RESTORE_CAP_MS+50,'ended at the cap');
 doc.activeElement=null;const plain=createListReturn();plain.leave(null);const from=clock;plain.restore();runFrames(500);
 assert.ok(clock-from>=RESTORE_WINDOW_MS&&clock-from<RESTORE_WINDOW_MS+50,'no row key: half a second');
});

test('a disabled row (the list still busy) is focused once it is enabled',()=>{
 const main=page();const section=list({});main.append(section);win.scrollTo(0,500);
 const position=createListReturn();position.leave(section.children[12]);
 section.remove();const again=list({});again.children.forEach(row=>{row.disabled=true});main.append(again);position.restore();
 runFrames(4);assert.equal(doc.activeElement,null);
 again.children.forEach(row=>{row.disabled=false});runFrames();assert.equal(doc.activeElement,again.children[12]);
});

test('a tap, wheel or a key inside main stops the restore',()=>{
 const main=page();const section=list({});main.append(section);win.scrollTo(0,900);
 const position=createListReturn();position.leave(section.children[20]);
 section.remove();main.append(new El('section',{cls:'list-panel'}));position.restore();runFrames(2);
 fire(main,'touchstart',{touches:[{clientX:100,clientY:300}]});fire(main,'touchend',{changedTouches:[{clientX:102,clientY:301}]});win.scrollTo(0,50);main.children[0].append(...rows(60));runFrames();
 assert.equal(win.scrollY,50);assert.equal(doc.activeElement,null);assert.equal(frames.length,0);
});

test('a sideways touch (a swipe-back) never stops the restore; a vertical touch scroll does',()=>{
 const main=page();const section=list({});main.append(section);win.scrollTo(0,900);
 const position=createListReturn();position.leave(section.children[20]);
 section.remove();main.append(new El('section',{cls:'list-panel'}));position.restore();runFrames(2);
 fire(main,'pointerdown',{pointerType:'touch'});fire(main,'touchstart',{touches:[{clientX:5,clientY:400}]});fire(main,'touchmove',{touches:[{clientX:150,clientY:404}]});fire(main,'touchend',{changedTouches:[{clientX:200,clientY:404}]});
 main.children[0].append(...rows(60));runFrames();assert.equal(win.scrollY,900);
 const again=createListReturn();again.leave(main.children[0].children[20]);main.children[0].remove();main.append(new El('section',{cls:'list-panel'}));again.restore();runFrames(2);
 fire(main,'touchstart',{touches:[{clientX:100,clientY:400}]});fire(main,'touchmove',{touches:[{clientX:102,clientY:330}]});assert.equal(frames.length,0);again.cancel();
});

test('a restore stops once its row is replaced by another page',()=>{
 const main=page();const section=list({});main.append(section);win.scrollTo(0,900);
 const position=createListReturn();position.leave(section.children[20]);
 section.remove();const back=list({});main.append(back);position.restore();runFrames(2);assert.equal(win.scrollY,900);
 back.remove();main.append(new El('article',{cls:'borrower-record',h:4000}));win.scrollTo(0,10);runFrames(2);
 assert.equal(win.scrollY,10);assert.equal(frames.length,0);
});

test('a press inside main (a pager tap) stops the restore',()=>{
 const main=page();const section=list({});main.append(section);win.scrollTo(0,900);
 const position=createListReturn();position.leave(section.children[20]);
 section.remove();main.append(new El('section',{cls:'list-panel'}));position.restore();runFrames(2);
 main.dispatchEvent(new Event('pointerdown'));win.scrollTo(0,120);main.children[0].append(...rows(60));runFrames();
 assert.equal(win.scrollY,120);assert.equal(frames.length,0);
});

test('a list that stayed on screen keeps the scroll the user made meanwhile',()=>{
 const main=page();const panel=list({scroll:true,height:600});main.append(panel);panel.scrollTop=700;
 const position=createListReturn();position.leave(panel.children[16],{top:false});
 panel.dispatchEvent(new Event('pointerdown'));panel.scrollTop=1500;
 position.restore();runFrames();
 assert.equal(panel.scrollTop,1500);assert.equal(doc.activeElement,panel.children[16]);assert.equal(panel.children[16].scrolledIntoView,undefined,'not scrolled back into view');
});

test('the opened row keeps its place on screen when content above it grows after Back',()=>{
 const main=page();const header=new El('header',{cls:'record-heading',h:300});const section=new El('section',{cls:'related',y:300}).append(...rows(40));
 main.append(header,section);win.scrollTo(0,1000);const opened=section.children[25],before=opened.getBoundingClientRect().top;
 const position=createListReturn();position.leave(opened);
 header.remove();section.remove();win.scrollTo(0,0);
 // Back: the record heading is still loading (shorter); it grows two frames later.
 const header2=new El('header',{cls:'record-heading',h:80}),section2=new El('section',{cls:'related',y:80}).append(...rows(40));main.append(header2,section2);position.restore();
 runFrames(2);header2.h=300;section2.y=300;runFrames();
 assert.equal(section2.children[25].getBoundingClientRect().top,before);assert.equal(win.scrollY,1000);
});

test('restore without a saved position, a missing row and a missing main never throw',()=>{
 const main=page();const position=createListReturn();assert.doesNotThrow(()=>position.restore());assert.equal(frames.length,0);
 const panel=list({scroll:true,height:600,tabindex:true});main.append(panel);panel.scrollTop=300;
 position.leave(panel.children[10]);panel.children.slice().forEach(node=>{node.remove()});position.restore();
 clock+=RESTORE_CAP_MS;runFrames();assert.equal(doc.activeElement,panel,'the focusable list takes focus when its row is gone');
 main.remove();assert.doesNotThrow(()=>{position.leave('row-1');position.restore();runFrames()});
 position.cancel();assert.equal(frames.length,0);
});
