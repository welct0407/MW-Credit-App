import {useLayoutEffect,useRef,type RefObject} from 'react';

type Action={token:symbol;navigationKey:string;disabled:boolean};
type Frame={key:string;node:HTMLElement;scrolls:[number,number][];top:number;left:number;width:number;background:string};
type Gesture={id:number;x:number;y:number;dx:number;lastX:number;lastTime:number;velocity:number;button:HTMLButtonElement;token:symbol;locked:boolean;edge:boolean};
type Layers={host:HTMLDivElement;front:HTMLDivElement;back:HTMLDivElement;width:number};
const modalOpen=()=>!!document.querySelector('dialog[open],[aria-modal="true"]');
/** A successful create can replace its temporary chooser/form branch with the saved record. */
export function replaceBackTransition(parentKey:string){document.dispatchEvent(new CustomEvent('mw-back-replace',{detail:parentKey}))}
const usable=(button:HTMLButtonElement|null):button is HTMLButtonElement=>!!button&&!button.disabled&&button.isConnected&&button.getClientRects().length>0&&getComputedStyle(button).visibility==='visible';
function horizontal(target:EventTarget|null,shell:HTMLElement){
 if(!(target instanceof Element))return true;
 for(let node:Element|null=target;node;node=node.parentElement){
  const style=getComputedStyle(node);
  if(node.matches('input[type="range"],[role="slider"],audio,video'))return true;
  if(node.scrollWidth>node.clientWidth+1&&(/^(auto|scroll)$/.test(style.overflowX)||node.matches('input,textarea,[contenteditable]')))return true;
  if(node===shell)return false;
 }
 return true;
}
function capture(shell:HTMLElement,key:string):Frame{
 const node=shell.cloneNode(true) as HTMLElement,source=[shell,...Array.from(shell.querySelectorAll<HTMLElement>('*'))],copies=[node,...Array.from(node.querySelectorAll<HTMLElement>('*'))];
 const scrolls=source.map((element,index):[number,number]=>{
  const copy=copies[index];copy.removeAttribute('id');
  if(element instanceof HTMLInputElement&&copy instanceof HTMLInputElement){copy.value=element.value;copy.checked=element.checked}
  if(element instanceof HTMLTextAreaElement&&copy instanceof HTMLTextAreaElement)copy.value=element.value;
  if(element instanceof HTMLSelectElement&&copy instanceof HTMLSelectElement)copy.selectedIndex=element.selectedIndex;
  if(element instanceof HTMLCanvasElement&&copy instanceof HTMLCanvasElement)copy.getContext('2d')?.drawImage(element,0,0);
  return[element.scrollLeft,element.scrollTop];
 });
 node.style.opacity='';node.inert=true;node.setAttribute('aria-hidden','true');
 const rect=shell.getBoundingClientRect();
 return{key,node,scrolls,top:rect.top,left:rect.left,width:rect.width,background:getComputedStyle(document.body).backgroundColor};
}
function layer(frame:Frame,role:string,viewport:{left:number;top:number},width:number){
 const layer=document.createElement('div');layer.dataset.backLayer=role;
 Object.assign(layer.style,{position:'absolute',inset:'0',overflow:'hidden',background:frame.background==='rgba(0, 0, 0, 0)'?'white':frame.background,transform:'translate3d(0,0,0)'});
 const clone=frame.node.cloneNode(true) as HTMLElement;clone.style.width=width+'px';clone.style.margin='0';clone.style.position='relative';clone.style.left=(frame.left-viewport.left)+'px';clone.style.top=(frame.top-viewport.top)+'px';clone.querySelectorAll<HTMLElement>('.topbar,.live-bottom-nav,:scope>header,:scope>footer').forEach(node=>{node.style.visibility='hidden'});
 const canvases=Array.from(frame.node.querySelectorAll('canvas'));clone.querySelectorAll('canvas').forEach((canvas,index)=>{if(canvases[index]?.width&&canvases[index]?.height)canvas.getContext('2d')?.drawImage(canvases[index],0,0)});
 layer.append(clone);return{layer,clone,scrolls:frame.scrolls};
}
/** Actual rendered page frames are visual-only. The live Back button remains the sole navigation authority. */
export function useSwipeBack(workspaceRef:RefObject<HTMLElement|null>,buttonRef:RefObject<HTMLButtonElement|null>,action:Action|null,scope=''){
 const latest=useRef({buttonRef,action,scope});latest.current={buttonRef,action,scope};
 const reconcile=useRef<()=>void>(()=>{});
 useLayoutEffect(()=>{
  const workspace=workspaceRef.current,root=workspace?.closest<HTMLElement>('.live-shell')??workspace;
  if(!root)return;const shell=root;
  let frames:Frame[]=[],candidate:Frame|null=null,pendingBack=false,replaceParent:string|null=null,currentScope=latest.current.scope;
  let gesture:Gesture|null=null,layers:Layers|null=null,settling=false,committing=false,suppressUntil=0,raf=0,settleTimer=0;
  const key=()=>latest.current.action?.navigationKey??'root';
  const disposeLayers=()=>{if(settleTimer)window.clearTimeout(settleTimer);settleTimer=0;layers?.host.remove();layers=null;settling=false};
  const reset=()=>{gesture=null;disposeLayers()};
  function update(){
   raf=0;
   const nextKey=key(),nextScope=latest.current.scope;
   if(nextScope!==currentScope){reset();frames=[];candidate=null;pendingBack=false;replaceParent=null;currentScope=nextScope}
   if(gesture&&(latest.current.action?.token!==gesture.token||latest.current.action.disabled))reset();
   if(layers&&!settling)return;
   const current=frames.at(-1);
   if(!current)frames=[capture(shell,nextKey)];
   else if(current.key!==nextKey){
    const ancestor=frames.map(frame=>frame.key).lastIndexOf(nextKey);
    if(replaceParent!==null){const index=frames.map(frame=>frame.key).lastIndexOf(replaceParent);frames=index>=0?frames.slice(0,index+1):[];replaceParent=null}
    else if(pendingBack||ancestor>=0){frames=ancestor>=0?frames.slice(0,ancestor+1):[]}
    else if(nextKey==='root')frames=[];
    else if(candidate?.key===current.key)frames[frames.length-1]=candidate;
    if(frames.at(-1)?.key!==nextKey)frames.push(capture(shell,nextKey));
    else frames[frames.length-1]=capture(shell,nextKey);
    candidate=null;
   }else if(!layers)frames[frames.length-1]=capture(shell,nextKey);
   pendingBack=false;
  }
  const schedule=()=>{if(!raf)raf=requestAnimationFrame(update)};
  reconcile.current=schedule;
  function show(){
   const prior=frames.at(-2);if(!prior)return false;
   const rect=workspace!.getBoundingClientRect(),header=shell.querySelector('.topbar,header')?.getBoundingClientRect(),footer=shell.querySelector('.live-bottom-nav,footer')?.getBoundingClientRect();
   const top=Math.max(0,rect.top,header?.bottom??0),bottom=Math.min(window.innerHeight,rect.bottom,footer?.width?footer.top:window.innerHeight),viewport={left:rect.left,top};if(bottom<=top)return false;
   const width=shell.getBoundingClientRect().width,background=layer(prior,'previous',viewport,width),foreground=layer(capture(shell,key()),'current',viewport,width),host=document.createElement('div');host.dataset.backTransition='';host.inert=true;host.setAttribute('aria-hidden','true');
   Object.assign(host.style,{position:'fixed',left:rect.left+'px',top:top+'px',width:rect.width+'px',height:(bottom-top)+'px',zIndex:'10000',overflow:'hidden',pointerEvents:'none',isolation:'isolate'});
   foreground.layer.style.boxShadow='-4px 0 18px #0003';host.append(background.layer,foreground.layer);document.body.append(host);
   for(const item of[background,foreground]){const nodes=[item.clone,...Array.from(item.clone.querySelectorAll<HTMLElement>('*'))];item.scrolls.forEach(([left,top],index)=>{if(nodes[index]){nodes[index].scrollLeft=left;nodes[index].scrollTop=top}})}
   layers={host,front:foreground.layer,back:background.layer,width:rect.width};return true;
  }
  function draw(dx:number){if(!layers)return;const offset=Math.max(0,Math.min(layers.width,dx));layers.front.style.transform=`translate3d(${offset}px,0,0)`;layers.back.style.transform=`translate3d(${-.25*(layers.width-offset)}px,0,0)`}
  function finish(commit:boolean){
   if(!layers){gesture=null;return}
   gesture=null;settling=true;
   const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:180;
   layers.front.style.transition=`transform ${duration}ms ease-out`;layers.back.style.transition=`transform ${duration}ms ease-out`;draw(commit?layers.width:0);
   settleTimer=window.setTimeout(()=>{disposeLayers();schedule()},duration+20);
  }
  const activation=(event:Event)=>{
   if(!committing&&(layers||performance.now()<suppressUntil)){event.preventDefault();event.stopImmediatePropagation();return}
   if(!(event.target instanceof Node)||!shell.contains(event.target)||layers&&!committing)return;
   const button=latest.current.buttonRef.current;
   pendingBack=!!button&&(event.target===button||button.contains(event.target));
   candidate=capture(shell,key());if(frames.length)frames[frames.length-1]=candidate;schedule();
  };
  const start=(event:TouchEvent)=>{
   if(settling||gesture?.locked)return;
   gesture=null;const touch=event.touches[0],active=latest.current.action,button=latest.current.buttonRef.current;
   if(event.touches.length!==1||!touch||!active||active.disabled||!usable(button)||modalOpen()||horizontal(event.target,shell)||frames.length<2)return;
   const standalone=matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
   const safari=/Safari/.test(navigator.userAgent)&&!/(Chrome|Chromium|CriOS|Android)/.test(navigator.userAgent);
   gesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,dx:0,lastX:touch.clientX,lastTime:performance.now(),velocity:0,button,token:active.token,locked:false,edge:touch.clientX<24&&safari&&!standalone};
   // Only an eligible in-app edge gesture claims Safari's otherwise competing history gesture.
   if(gesture.edge&&event.cancelable)event.preventDefault();
  };
  const move=(event:TouchEvent)=>{
   const current=gesture;if(!current)return;const touch=event.touches[0];
   if(event.touches.length!==1||touch?.identifier!==current.id||latest.current.action?.token!==current.token||!usable(current.button)){finish(false);return}
   const dx=touch.clientX-current.x,dy=Math.abs(touch.clientY-current.y),now=performance.now();
   if(!current.locked){
    if(dx< -8||dy>10&&dy>Math.abs(dx)){gesture=null;return}
    if(dx<10||dx<dy*1.5)return;
    if(!event.cancelable||!show()){gesture=null;return}current.locked=true;
   }
   if(event.cancelable)event.preventDefault();
   if(now>current.lastTime)current.velocity=(touch.clientX-current.lastX)/(now-current.lastTime);
   current.lastX=touch.clientX;current.lastTime=now;current.dx=Math.max(0,dx);draw(current.dx);
  };
  const end=(event:TouchEvent)=>{
   const current=gesture;if(!current)return;
   if(!current.locked){gesture=null;if(current.edge&&event.changedTouches[0]&&Math.abs(event.changedTouches[0].clientX-current.x)<10&&Math.abs(event.changedTouches[0].clientY-current.y)<10&&event.target instanceof HTMLElement){if(event.cancelable)event.preventDefault();event.target.focus({preventScroll:true});event.target.click()}return}
   if(event.cancelable)event.preventDefault();suppressUntil=performance.now()+450;
   const active=latest.current.action,point=event.changedTouches[0],velocity=performance.now()-current.lastTime<100?current.velocity:0;
   const commit=event.touches.length===0&&point?.identifier===current.id&&active?.token===current.token&&!active.disabled&&latest.current.buttonRef.current===current.button&&usable(current.button)&&!modalOpen()&&(current.dx>=(layers?.width??window.innerWidth)*.35||current.dx>=60&&velocity>.5);
   if(!commit){finish(false);return}
   const oldKey=key();gesture=null;settling=true;committing=true;
   try{current.button.click()}finally{committing=false}
   requestAnimationFrame(()=>{update();finish(key()!==oldKey)});
  };
  const cancel=()=>finish(false);
  const additional=(event:TouchEvent)=>{if(event.touches.length>1)cancel()};
  const clear=()=>{reset();candidate=null;schedule()};
  const replace=(event:Event)=>{replaceParent=(event as CustomEvent<string>).detail};
  const freshPointer=()=>{suppressUntil=0};
  const observer=new MutationObserver(schedule);observer.observe(shell,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','value','disabled','aria-busy']});
  shell.addEventListener('click',activation,true);shell.addEventListener('touchstart',start,{passive:false});shell.addEventListener('touchmove',move,{passive:false});shell.addEventListener('touchend',end,{passive:false});shell.addEventListener('touchcancel',cancel,{passive:true});
  shell.addEventListener('pointerdown',freshPointer,true);
  document.addEventListener('touchstart',additional,{passive:true});document.addEventListener('visibilitychange',clear);window.addEventListener('resize',clear);shell.addEventListener('scroll',schedule,true);
  window.addEventListener('scroll',schedule,{passive:true});
  document.addEventListener('mw-back-replace',replace);
  update();
  return()=>{reset();if(raf)cancelAnimationFrame(raf);observer.disconnect();reconcile.current=()=>{};frames=[];candidate=null;shell.removeEventListener('click',activation,true);shell.removeEventListener('pointerdown',freshPointer,true);shell.removeEventListener('touchstart',start);shell.removeEventListener('touchmove',move);shell.removeEventListener('touchend',end);shell.removeEventListener('touchcancel',cancel);document.removeEventListener('touchstart',additional);document.removeEventListener('visibilitychange',clear);document.removeEventListener('mw-back-replace',replace);window.removeEventListener('resize',clear);window.removeEventListener('scroll',schedule);shell.removeEventListener('scroll',schedule,true)};
 },[workspaceRef]);
 useLayoutEffect(()=>{reconcile.current()});
}
