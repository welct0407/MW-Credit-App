import {useLayoutEffect,type RefObject} from 'react';

type Action = {token:symbol;disabled:boolean};
type Gesture = {id:number;x:number;y:number;started:number;button:HTMLButtonElement};
const interactive = 'input,textarea,select,button,a,label,summary,iframe,audio,video,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="link"],[role="slider"],[draggable="true"]';
const selectedText = () => window.getSelection()?.isCollapsed === false;
const modalOpen = () => !!document.querySelector('dialog[open],[aria-modal="true"]');
function usable(button:HTMLButtonElement|null):button is HTMLButtonElement {
 return !!button&&!button.disabled&&button.isConnected&&button.getClientRects().length>0&&getComputedStyle(button).visibility==='visible';
}
function eligible(target:EventTarget|null,workspace:HTMLElement) {
 if(!(target instanceof Element)||target.closest(interactive)||selectedText()||modalOpen())return false;
 for(let node:Element|null=target;node;node=node.parentElement){
  const style=getComputedStyle(node);
  if(node.scrollWidth>node.clientWidth+1&&/^(auto|scroll)$/.test(style.overflowX))return false;
  if(node===workspace)return true;
 }
 return false;
}

/** A deliberate content swipe clicks the currently visible Back control; native scrolling keeps ownership. */
export function useSwipeBack(workspaceRef:RefObject<HTMLElement|null>,buttonRef:RefObject<HTMLButtonElement|null>,action:Action|null) {
 useLayoutEffect(()=>{
  const workspace=workspaceRef.current;
  if(!workspace||!action||action.disabled)return;
  let gesture:Gesture|null=null;
  const cancel=()=>{gesture=null};
  const additionalTouch=(event:TouchEvent)=>{if(event.touches.length!==1)cancel()};
  const start=(event:TouchEvent)=>{
   cancel();const touch=event.touches[0],button=buttonRef.current;
   // Leave the browser's screen-edge history gesture alone.
   if(event.touches.length!==1||!touch||touch.clientX<24||touch.clientX>window.innerWidth-24||!usable(button)||!eligible(event.target,workspace))return;
   gesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,started:performance.now(),button};
  };
  const move=(event:TouchEvent)=>{
   if(!gesture)return;
   const touch=event.touches[0];
   if(event.touches.length!==1||touch?.identifier!==gesture.id){cancel();return}
   const dx=touch.clientX-gesture.x,dy=Math.abs(touch.clientY-gesture.y);
   if(performance.now()-gesture.started>700||dx< -12||(dy>12&&dy>Math.abs(dx))||!usable(gesture.button))cancel();
  };
  const end=(event:TouchEvent)=>{
   const current=gesture;cancel();if(!current||event.touches.length||event.changedTouches.length!==1)return;
   const touch=event.changedTouches[0],dx=touch.clientX-current.x,dy=Math.abs(touch.clientY-current.y);
   if(touch.identifier!==current.id||dx<80||dx<dy*2||performance.now()-current.started>700||buttonRef.current!==current.button||!usable(current.button)||selectedText()||modalOpen())return;
   current.button.click();
  };
  workspace.addEventListener('touchstart',start,{passive:true});workspace.addEventListener('touchmove',move,{passive:true});
  workspace.addEventListener('touchend',end,{passive:true});workspace.addEventListener('touchcancel',cancel,{passive:true});
  document.addEventListener('touchstart',additionalTouch,{passive:true});document.addEventListener('visibilitychange',cancel);
  return()=>{cancel();workspace.removeEventListener('touchstart',start);workspace.removeEventListener('touchmove',move);workspace.removeEventListener('touchend',end);workspace.removeEventListener('touchcancel',cancel);document.removeEventListener('touchstart',additionalTouch);document.removeEventListener('visibilitychange',cancel)};
 },[workspaceRef,buttonRef,action?.token,action?.disabled]);
}
