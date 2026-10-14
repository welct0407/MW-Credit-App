import {useEffect,useRef,type RefObject} from 'react';

type Options={scope:string;refreshIdentity?:unknown;canOpenMenu:boolean;onOpenMenu:()=>void;refreshButtonRef:RefObject<HTMLButtonElement|null>};
type Gesture={id:number;x:number;y:number;time:number;scope:string;direction:'menu'|'refresh'|null;button:HTMLButtonElement|null;top:boolean;menuSign:1|-1|null;edge:boolean};
const usable=(button:HTMLButtonElement|null)=>!!button&&!button.disabled&&button.isConnected&&button.getClientRects().length>0;
function startContext(target:EventTarget|null,shell:HTMLElement){
 if(!(target instanceof Element)||target.closest('input,textarea,select,[contenteditable="true"],[role="slider"],audio,video,dialog,[aria-modal="true"]')||window.getSelection()?.toString())return null;
 let top=true;
 for(let node:Element|null=target;node;node=node.parentElement){const style=getComputedStyle(node);
  if(node.scrollWidth>node.clientWidth+1&&/auto|scroll/.test(style.overflowX))return null;
  if(node.scrollHeight>node.clientHeight+1&&/auto|scroll/.test(style.overflowY)&&node.scrollTop>1)top=false;
  if(node===shell)break;
 }
 if((document.scrollingElement?.scrollTop??window.scrollY)>1)top=false;
 return {top};
}
/** Dispatches the current visible actions only after a deliberate, single-direction release. */
export function useWorkspaceGestures(workspaceRef:RefObject<HTMLElement|null>,options:Options){
 const latest=useRef(options);latest.current=options;
 useEffect(()=>{
  const shell=workspaceRef.current?.closest<HTMLElement>('.live-shell')??workspaceRef.current;if(!shell)return;
  let gesture:Gesture|null=null,suppressUntil=0;
  const cancel=()=>{gesture=null};
  const start=(event:TouchEvent)=>{cancel();if(event.touches.length!==1||document.querySelector('dialog[open],[aria-modal="true"]'))return;const context=startContext(event.target,shell);if(!context)return;const touch=event.touches[0],current=latest.current;gesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,time:performance.now(),scope:current.scope,direction:null,button:current.refreshButtonRef.current,top:context.top,menuSign:null,edge:false};
   const standalone=matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
   const safari=/Safari/.test(navigator.userAgent)&&!/(Chrome|Chromium|CriOS|Android)/.test(navigator.userAgent);
   // Reserve Safari's browser-history edge only for an eligible root menu.
   // Installed PWAs retain native scrolling until the horizontal move locks.
   gesture.edge=current.canOpenMenu&&touch.clientX<=24&&safari&&!standalone;if(gesture.edge&&event.cancelable)event.preventDefault();
  };
  const move=(event:TouchEvent)=>{if(!gesture)return;if(event.touches.length!==1||latest.current.scope!==gesture.scope){cancel();return}const touch=Array.from(event.touches).find(t=>t.identifier===gesture!.id);if(!touch){cancel();return}const dx=touch.clientX-gesture.x,dy=touch.clientY-gesture.y;
   if(!gesture.direction){if(Math.max(Math.abs(dx),Math.abs(dy))<12)return;if((dx<0||gesture.x<=24)&&Math.abs(dx)>Math.abs(dy)*1.5&&latest.current.canOpenMenu){gesture.direction='menu';gesture.menuSign=dx>0?1:-1;}else if(dy>0&&dy>Math.abs(dx)*1.5&&gesture.top&&usable(gesture.button))gesture.direction='refresh';else{cancel();return}}
   if(gesture.direction==='menu'){if(dx*(gesture.menuSign??0)<0||Math.abs(dy)>Math.abs(dx)){cancel();return}}else{if(dy<0||Math.abs(dx)>Math.abs(dy)){cancel();return}}
   if(event.cancelable)event.preventDefault();
  };
  const end=(event:TouchEvent)=>{const current=gesture;cancel();if(!current||event.touches.length||!event.changedTouches.length||event.changedTouches[0].identifier!==current.id||current.scope!==latest.current.scope||performance.now()-current.time>1800||document.querySelector('dialog[open],[aria-modal="true"]'))return;
   // A quick release can travel beyond the last delivered touchmove. Judge
   // the completed gesture at its final point, including reversal/axis guards.
   const touch=event.changedTouches[0],dx=touch.clientX-current.x,dy=touch.clientY-current.y;
   if(!current.direction&&current.edge&&Math.abs(dx)<10&&Math.abs(dy)<10&&event.target instanceof HTMLElement){if(event.cancelable)event.preventDefault();event.target.focus({preventScroll:true});event.target.click();return;}
   if(current.direction==='menu'?dx*(current.menuSign??0)<80||Math.abs(dy)>Math.abs(dx):current.direction==='refresh'?dy<80||Math.abs(dx)>dy:true)return;
   if(current.direction==='menu'&&latest.current.canOpenMenu){if(event.cancelable)event.preventDefault();suppressUntil=performance.now()+400;latest.current.onOpenMenu()}
   else if(current.direction==='refresh'&&current.button===latest.current.refreshButtonRef.current&&usable(current.button)){if(event.cancelable)event.preventDefault();suppressUntil=0;current.button!.click();suppressUntil=performance.now()+400}
  };
  const click=(event:MouseEvent)=>{if(performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation()}};
  const additional=(event:TouchEvent)=>{if(event.touches.length>1)cancel()};
  shell.addEventListener('touchstart',start,{passive:false});shell.addEventListener('touchmove',move,{passive:false});shell.addEventListener('touchend',end,{passive:false});shell.addEventListener('touchcancel',cancel);shell.addEventListener('click',click,true);document.addEventListener('touchstart',additional,{passive:true});document.addEventListener('visibilitychange',cancel);window.addEventListener('resize',cancel);
  return()=>{cancel();shell.removeEventListener('touchstart',start);shell.removeEventListener('touchmove',move);shell.removeEventListener('touchend',end);shell.removeEventListener('touchcancel',cancel);shell.removeEventListener('click',click,true);document.removeEventListener('touchstart',additional);document.removeEventListener('visibilitychange',cancel);window.removeEventListener('resize',cancel)};
 },[workspaceRef,options.scope,options.canOpenMenu,options.refreshIdentity]);
}
