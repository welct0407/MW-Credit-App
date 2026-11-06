import {useEffect,useRef} from 'react';

/**
 * R131 (owner, 6 November 2026): after opening an item from a list, Back returns to the same place in that list.
 * leave() runs in the open handler, before the state change: it records the window position, every scrolling ancestor of
 * the opened control (by its first class token and its place among matches in <main>, so a remounted list is found again),
 * the row's data-record-id and where the row sat on screen, then starts the opened page at its top (unless top:false).
 * restore() runs in the Back handler, after the state change: it re-applies those positions each frame for about half a
 * second (the list may still be loading or its header may still be growing), and for up to 2 s while the opened row is not
 * there yet; it keeps that row where it was on screen once it exists, then focuses it without scrolling. A wheel, a key, a
 * mouse or pen press, a tap or a vertical touch scroll inside <main> stops it at once; a sideways swipe does not. A list that
 * stayed visible and was scrolled meanwhile is left where the user put it.
 * It never throws: a missing row, container or API only means less is restored.
 */
export const RESTORE_WINDOW_MS=500;
/** A row still loading at the window's end (a record page that fetches its header first) is waited for up to this long; once it
 * is there and usable, ANCHOR_FRAMES more frames keep it in place before the restore ends. */
export const RESTORE_CAP_MS=2000,ANCHOR_FRAMES=10;
export type LeaveOptions={
 /** Start the opened page at its top (the scrolling sections around the opened control, and the window). The default; false
  * where the list stays on screen beside what it opened, or the page places the opened item itself. */
 top?:boolean;
 /** Other scrolling elements to keep (for example a sibling list panel that unmounts with the page). */
 keep?:(Element|null|undefined)[];
};
export type ListReturn={leave:(target?:EventTarget|string|null,options?:LeaveOptions)=>void;restore:()=>void;cancel:()=>void};
type Container={key:string;index:number;top:number;node:Element;moved:boolean};
type Snapshot={pageY:number;containers:Container[];focusKey:string|null;opened:Element|null;rowTop:number|null;release:()=>void};

const quote=(value:string)=>'"'+value.replace(/["\\]/g,'\\$&')+'"';
const isElement=(value:unknown):value is Element=>!!value&&typeof (value as Element).closest==='function'&&typeof (value as Element).getAttribute==='function';
const scope=():Element|null=>document.querySelector('main')??document.body;
const scrolls=(node:Element)=>{try{return /^(auto|scroll)$/.test(getComputedStyle(node).overflowY)}catch{return false}};
const overflowing=(node:Element)=>scrolls(node)&&node.scrollHeight>node.clientHeight+1;
const firstClass=(node:Element)=>(node.getAttribute('class')??'').trim().split(/\s+/)[0]??'';
const byClass=(root:Element,key:string)=>Array.from(root.querySelectorAll('[class~='+quote(key)+']'));
const byRecord=(root:Element,key:string)=>root.querySelector('[data-record-id='+quote(key)+']');
const recordKey=(node:Element|null)=>node?.closest('[data-record-id]')?.getAttribute('data-record-id')??null;
const now=()=>performance.now();
// The two-argument form: an options object with behavior 'instant' throws on Safari versions that predate it, and nothing here
// sets a smooth scroll-behavior, so this jump is immediate everywhere.
const windowTo=(top:number)=>window.scrollTo(0,top);
// The user taking over inside <main> stops a restore: a wheel, a key, a mouse or pen press, a tap, or a touch that starts to
// scroll vertically. A sideways touch (a swipe-back) does not: it is never counted against the restore, and these listeners
// are passive, so the gesture itself is untouched.
const TAP=10;
const MOVES=['pointerdown','touchstart','wheel','keydown'] as const;

export function createListReturn():ListReturn{
 let saved:Snapshot|null=null,frame=0,stopRun:(()=>void)|null=null;
 const stopRestore=()=>{if(frame)cancelAnimationFrame(frame);frame=0;stopRun?.();stopRun=null};
 const drop=()=>{saved?.release();saved=null};
 function leave(target?:EventTarget|string|null,options:LeaveOptions={}){
  let top=false;
  try{
   stopRestore();drop();
   const root=scope();if(!root)return;
   top=options.top!==false;
   let opened:Element|null=null;
   if(typeof target==='string')opened=byRecord(root,target);else if(isElement(target))opened=target;
   if(!opened&&isElement(document.activeElement)&&root.contains(document.activeElement)&&document.activeElement!==root)opened=document.activeElement;
   const containers:Container[]=[],seen=new Set<Element>(),ancestors:Element[]=[];
   const add=(node:Element)=>{if(seen.has(node)||!scrolls(node))return false;seen.add(node);const key=firstClass(node);containers.push({key,index:key?byClass(root,key).indexOf(node):-1,top:node.scrollTop,node,moved:false});return true};
   for(let node=opened?.parentElement??null;node&&node!==root&&node!==document.body;node=node.parentElement)if(add(node))ancestors.push(node);
   for(const node of options.keep??[])if(node)add(node);
   const focusKey=typeof target==='string'?target:recordKey(opened);
   const row=focusKey!==null?byRecord(root,focusKey):null;
   const rowTop=row?row.getBoundingClientRect().top:null;
   // A scroll the user makes in a list that stays on screen (the desktop board beside its detail) wins over the saved one.
   const marks:[Element,()=>void][]=[];
   for(const container of containers){if(top&&ancestors.includes(container.node))continue;const mark=()=>{container.moved=true};marks.push([container.node,mark]);for(const type of MOVES)container.node.addEventListener(type,mark,{passive:true})}
   saved={pageY:window.scrollY,containers,focusKey,opened,rowTop,release:()=>{for(const [node,mark] of marks)for(const type of MOVES)node.removeEventListener(type,mark)}};
  }catch{drop();return}
  // Starting the opened page at its top never costs the saved position.
  if(top)try{for(const container of saved?.containers??[])if(container.node.contains(saved!.opened))container.node.scrollTop=0;if(window.scrollY!==0)windowTo(0)}catch{}
 }
 function restore(){
  const snapshot=saved;saved=null;stopRestore();if(!snapshot)return;snapshot.release();
  const root=scope();if(!root)return;
  const started=now(),deadline=started+RESTORE_WINDOW_MS,cap=started+RESTORE_CAP_MS;let focused=false,seen:Element|null=null,ready=0;
  const resolve=(container:Container):Element|null=>{if(container.node.isConnected)return container.node;if(!container.key)return null;const list=byClass(root,container.key);return list[container.index]??list[0]??null};
  const rowElement=():HTMLElement|null=>{const row=snapshot.focusKey!==null?byRecord(root,snapshot.focusKey):null;return row as HTMLElement|null};
  // The scroller that moves the row: its nearest overflowing ancestor, else the window.
  const rowScroller=(row:Element):Element|null=>{for(let node=row.parentElement;node&&node!==document.body;node=node.parentElement){if(overflowing(node))return node;if(node===root)break}return null};
  // Only a list that stayed in place (it still holds the opened row) keeps a scroll the user made while away; a section that
  // hosted the detail in between does not.
  const held=(container:Container)=>container.moved&&container.node.isConnected&&!!snapshot.opened?.isConnected&&container.node.contains(snapshot.opened);
  const apply=(row:HTMLElement|null)=>{
   const anchor=row&&snapshot.rowTop!==null&&row.getClientRects().length>0?rowScroller(row):undefined;
   for(const container of snapshot.containers){if(held(container))continue;const node=resolve(container);if(node&&node!==anchor&&node.scrollTop!==container.top)node.scrollTop=container.top}
   if(anchor!==null&&window.scrollY!==snapshot.pageY)windowTo(snapshot.pageY);
   if(row&&snapshot.rowTop!==null&&anchor!==undefined){
    if(anchor&&snapshot.containers.some(container=>container.node===anchor&&held(container)))return;
    const delta=row.getBoundingClientRect().top-snapshot.rowTop;
    if(Math.abs(delta)>1){if(anchor)anchor.scrollTop+=delta;else windowTo(window.scrollY+delta)}
   }
  };
  const focusable=(row:HTMLElement|null)=>!!row&&!(row as HTMLButtonElement).disabled&&row.getClientRects().length>0;
  const visible=(row:HTMLElement)=>{const box=row.getBoundingClientRect();let top=0,bottom=window.innerHeight;const scroller=rowScroller(row);if(scroller){const area=scroller.getBoundingClientRect();top=Math.max(top,area.top);bottom=Math.min(bottom,area.bottom)}return box.bottom>top&&box.top<bottom};
  const fallback=()=>{
   if(snapshot.opened?.isConnected&&focusable(snapshot.opened as HTMLElement))return snapshot.opened as HTMLElement;
   // Else the nearest kept list container that takes focus (the keyboard-scrollable panels).
   for(const container of snapshot.containers){const node=resolve(container);if(node?.hasAttribute('tabindex'))return node as HTMLElement}
   return null;
  };
  const finish=()=>{
   stopRestore();const row=rowElement();
   if(!focused){const target=focusable(row)?row:fallback();target?.focus({preventScroll:true})}
   const scroller=row?rowScroller(row):null,kept=!!scroller&&snapshot.containers.some(container=>container.node===scroller&&held(container));
   if(row&&!kept&&row.getClientRects().length>0&&!visible(row))row.scrollIntoView({block:'nearest'});
  };
  const step=()=>{
   frame=0;
   try{
    const row=rowElement();
    // The restored row went away for good (a swipe-back or another Back replaced the page): stop moving that page.
    if(seen&&!seen.isConnected&&!row){stopRestore();return}
    apply(row);
    if(row)seen=row;
    if(!focused&&focusable(row)){row!.focus({preventScroll:true});focused=true}
    if(focusable(row))ready++;
    const time=now();
    if(time>=cap||time>=deadline&&(snapshot.focusKey===null||ready>ANCHOR_FRAMES)){finish();return}
   }catch{stopRestore();return}
   frame=requestAnimationFrame(step);
  };
  const interrupt=()=>stopRestore();let touch:{x:number;y:number}|null=null;
  const point=(event:Event,list:'touches'|'changedTouches')=>{const item=(event as TouchEvent)[list]?.[0];return item?{x:item.clientX,y:item.clientY}:null};
  const handlers:[string,(event:Event)=>void][]=[
   ['wheel',interrupt],['keydown',interrupt],
   ['pointerdown',event=>{if((event as PointerEvent).pointerType!=='touch')interrupt()}],
   ['touchstart',event=>{touch=point(event,'touches')}],
   ['touchmove',event=>{const at=point(event,'touches');if(!touch||!at)return;const dx=Math.abs(at.x-touch.x),dy=Math.abs(at.y-touch.y);if(dy>TAP&&dy>dx)interrupt()}],
   ['touchend',event=>{const at=point(event,'changedTouches');if(touch&&at&&Math.abs(at.x-touch.x)<TAP&&Math.abs(at.y-touch.y)<TAP)interrupt();touch=null}],
  ];
  for(const [type,handler] of handlers)root.addEventListener(type,handler,{capture:true,passive:true});
  stopRun=()=>{for(const [type,handler] of handlers)root.removeEventListener(type,handler,{capture:true})};
  frame=requestAnimationFrame(step);
 }
 return {leave,restore,cancel:()=>{stopRestore();drop()}};
}

/** One saved list position per open/Back pair; ref-based, so it never re-renders. */
export function useListReturn():ListReturn{
 const ref=useRef<ListReturn|null>(null);
 if(!ref.current)ref.current=createListReturn();
 useEffect(()=>()=>ref.current?.cancel(),[]);
 return ref.current;
}
