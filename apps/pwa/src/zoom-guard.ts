/** Limit app pinch gestures while retaining single-finger and ordinary wheel scrolling. Browser accessibility settings can override this. */
export function limitAppZoom(){
 const inside=(event:Event)=>event.target instanceof Node&&!!document.getElementById('root')?.contains(event.target);
 const gesture=(event:Event)=>{if(inside(event))event.preventDefault()};
 const touch=(event:TouchEvent)=>{if(event.touches.length>1)gesture(event)};
 const wheel=(event:WheelEvent)=>{if(event.ctrlKey)gesture(event)};
 document.addEventListener('gesturestart',gesture,{passive:false});document.addEventListener('gesturechange',gesture,{passive:false});document.addEventListener('touchmove',touch,{passive:false});document.addEventListener('wheel',wheel,{passive:false});
 return()=>{document.removeEventListener('gesturestart',gesture);document.removeEventListener('gesturechange',gesture);document.removeEventListener('touchmove',touch);document.removeEventListener('wheel',wheel)};
}
