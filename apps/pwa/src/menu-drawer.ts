import {useEffect,useMemo,useRef,type RefObject} from 'react';

export type MenuMotion={begin:()=>boolean;move:(distance:number)=>void;end:(distance:number,velocity:number)=>void;cancel:()=>void};
type Controller=MenuMotion&{open:()=>void;close:(after?:()=>void)=>void;scopeChanged:()=>void};
const inactive:Controller={begin:()=>false,move:()=>{},end:()=>{},cancel:()=>{},open:()=>{},close:()=>{},scopeChanged:()=>{}};
/** Moves the existing modal drawer, preserving its focus trap and contents. */
export function useMenuDrawer(dialogRef:RefObject<HTMLDialogElement|null>,scope:string){
 const controller=useRef<Controller>(inactive);
 const api=useMemo(()=>({begin:()=>controller.current.begin(),move:(distance:number)=>controller.current.move(distance),end:(distance:number,velocity:number)=>controller.current.end(distance,velocity),cancel:()=>controller.current.cancel(),open:()=>controller.current.open(),close:(after?:()=>void)=>controller.current.close(after)}),[]);
 useEffect(()=>{
  const dialog=dialogRef.current;if(!dialog)return;
  let timer=0,frame=0,revision=0,width=0,dragging=false,fromOpen=false,targetOpen=false,suppressUntil=0;
  let afterClose:(()=>void)|undefined;
  let touch:{id:number;x:number;y:number;lastX:number;lastTime:number;velocity:number;locked:boolean}|null=null;
  const clear=()=>{revision++;clearTimeout(timer);cancelAnimationFrame(frame);timer=0;frame=0;touch=null;dragging=false;afterClose=undefined;};
  const position=(offset:number)=>{dialog.style.setProperty('--drawer-offset',Math.max(-width,Math.min(0,offset))+'px');dialog.style.setProperty('--drawer-opacity',String(width?1+Math.max(-width,Math.min(0,offset))/width:1))};
  const cleanup=()=>{dialog.removeAttribute('data-drawer-motion');dialog.style.removeProperty('--drawer-offset');dialog.style.removeProperty('--drawer-opacity')};
  const finish=(open:boolean)=>{const after=!open?afterClose:undefined;afterClose=undefined;targetOpen=open;dragging=false;if(!open&&dialog.open)dialog.close();cleanup();after?.()};
  const settle=(open:boolean)=>{clearTimeout(timer);cancelAnimationFrame(frame);dragging=false;targetOpen=open;const current=++revision;
   if(!dialog.open){cleanup();return;}
   const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:180;dialog.dataset.drawerMotion='settling';position(open?0:-width);
   if(!duration){finish(open);return;}timer=window.setTimeout(()=>{if(current===revision)finish(open)},duration);
  };
  const prepare=()=>{clear();dialog.dataset.drawerMotion='dragging';if(!dialog.open)dialog.showModal();width=dialog.getBoundingClientRect().width;};
  const open=()=>{if(dialog.open&&targetOpen&&!dragging)return;prepare();targetOpen=true;position(-width);dialog.getBoundingClientRect();const current=revision;frame=requestAnimationFrame(()=>{if(current===revision)settle(true)})};
  const close=(after?:()=>void)=>{if(!dialog.open){after?.();return;}if(after)afterClose=after;touch=null;width=dialog.getBoundingClientRect().width;settle(false)};
  const begin=()=>{if(!matchMedia('(max-width:1050px)').matches||dialog.open)return false;prepare();fromOpen=false;targetOpen=false;dragging=true;position(-width);return true};
  const move=(distance:number)=>{if(dragging&&dialog.open)position(fromOpen?-Math.max(0,distance):-width+Math.max(0,distance))};
  const end=(distance:number,velocity:number)=>{if(!dragging)return;const committed=distance>=width*.35||distance>=60&&velocity>.5;settle(committed?!fromOpen:fromOpen)};
  const cancel=()=>{if(dragging)settle(fromOpen)};
  const allowed=(target:EventTarget|null)=>{if(!(target instanceof Element)||!dialog.contains(target)||target.closest('input,textarea,select,[contenteditable="true"],[role="slider"],audio,video')||window.getSelection()?.toString())return false;
   for(let node:Element|null=target;node&&node!==dialog;node=node.parentElement){const style=getComputedStyle(node);if(node.scrollWidth>node.clientWidth+1&&/auto|scroll/.test(style.overflowX))return false;}return true;};
  const start=(event:TouchEvent)=>{if(event.touches.length!==1){touch=null;if(dragging){suppressUntil=performance.now()+400;cancel()}return;}if(!dialog.open||dragging||dialog.dataset.drawerMotion==='settling'||!allowed(event.target))return;const point=event.touches[0];touch={id:point.identifier,x:point.clientX,y:point.clientY,lastX:point.clientX,lastTime:performance.now(),velocity:0,locked:false}};
  const touchMove=(event:TouchEvent)=>{const current=touch;if(!current)return;if(event.touches.length!==1){touch=null;cancel();return;}const point=Array.from(event.touches).find(point=>point.identifier===current.id);if(!point){touch=null;cancel();return;}const dx=point.clientX-current.x,dy=point.clientY-current.y,now=performance.now();
   if(!current.locked){if(Math.max(Math.abs(dx),Math.abs(dy))<12)return;if(dx>=0||-dx<Math.abs(dy)*1.5){touch=null;return;}current.locked=true;clearTimeout(timer);cancelAnimationFrame(frame);revision++;width=dialog.getBoundingClientRect().width;fromOpen=true;dragging=true;dialog.dataset.drawerMotion='dragging';}
   if(Math.abs(dy)>Math.abs(dx)||dx>0){touch=null;suppressUntil=performance.now()+400;cancel();return;}
   if(now>current.lastTime)current.velocity=-(point.clientX-current.lastX)/(now-current.lastTime);current.lastX=point.clientX;current.lastTime=now;move(-dx);if(event.cancelable)event.preventDefault();
  };
  const touchEnd=(event:TouchEvent)=>{const current=touch;touch=null;if(!current?.locked)return;suppressUntil=performance.now()+400;const point=event.changedTouches[0];if(event.touches.length||point?.identifier!==current.id){cancel();return;}const dx=point.clientX-current.x,dy=point.clientY-current.y,now=performance.now();if(event.cancelable)event.preventDefault();if(dx>0||Math.abs(dy)>Math.abs(dx)){cancel();return;}const velocity=now-current.lastTime<100?(point.clientX!==current.lastX&&now>current.lastTime?-(point.clientX-current.lastX)/(now-current.lastTime):current.velocity):0;move(-dx);end(-dx,velocity)};
  const abort=()=>{touch=null;if(dragging){suppressUntil=performance.now()+400;cancel()}};
  const click=(event:MouseEvent)=>{if(performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation()}};
  const cancelEscape=(event:Event)=>{event.preventDefault();close()};
  const closed=()=>{if(dialog.open)return;clear();targetOpen=false;cleanup()};
  const reset=()=>{const restore=dragging?fromOpen:targetOpen;clear();if(dialog.open)finish(restore)};
  controller.current={begin,move,end,cancel,open,close,scopeChanged:()=>{if(dragging){clear();finish(false)}}};
  dialog.addEventListener('touchstart',start,{passive:true});dialog.addEventListener('touchmove',touchMove,{passive:false});dialog.addEventListener('touchend',touchEnd,{passive:false});dialog.addEventListener('touchcancel',abort);dialog.addEventListener('click',click,true);dialog.addEventListener('cancel',cancelEscape);dialog.addEventListener('close',closed);window.addEventListener('resize',reset);document.addEventListener('visibilitychange',reset);
  return()=>{clear();if(dialog.open)dialog.close();cleanup();controller.current=inactive;dialog.removeEventListener('touchstart',start);dialog.removeEventListener('touchmove',touchMove);dialog.removeEventListener('touchend',touchEnd);dialog.removeEventListener('touchcancel',abort);dialog.removeEventListener('click',click,true);dialog.removeEventListener('cancel',cancelEscape);dialog.removeEventListener('close',closed);window.removeEventListener('resize',reset);document.removeEventListener('visibilitychange',reset)};
 },[dialogRef]);
 // biome-ignore lint/correctness/useExhaustiveDependencies: notifies the drawer controller when the scope changes; scope is the trigger
 useEffect(()=>{controller.current.scopeChanged()},[scope]);
 return api;
}
