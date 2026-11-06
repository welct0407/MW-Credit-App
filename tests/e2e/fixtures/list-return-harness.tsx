import {StrictMode,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useListReturn} from '../../../apps/pwa/src/list-return';
// R131 harness: one list (a scrolling panel inside a scrolling window) that opens a short detail and comes back in the ways
// the real pages do: rows already there, rows arriving a few frames later, a shorter list, a removed row, a reordered row.
const full=Array.from({length:60},(_,i)=>'r'+i);
type Mode='plain'|'late'|'slow'|'shrunk'|'removed'|'reordered'|'interrupt';
function App(){
 const [view,setView]=useState<'list'|'detail'>('list'),[ids,setIds]=useState<string[]>(full),[mounted,setMounted]=useState(true),ret=useListReturn();
 useEffect(()=>{if(view==='detail')window.scrollTo(0,0)},[view]);
 function back(mode:Mode){
  setView('list');
  if(mode==='shrunk')setIds(full.slice(0,8));else if(mode==='removed')setIds(full.filter(id=>id!=='r18'));else if(mode==='reordered')setIds([...full.filter(id=>id!=='r18'),'r18']);
  else if(mode==='late'||mode==='slow'||mode==='interrupt'){setIds([]);const frames=mode==='slow'?90:mode==='interrupt'?12:2;let n=0;const tick=()=>{if(++n>=frames)setIds(full);else requestAnimationFrame(tick)};requestAnimationFrame(tick)}
  else setIds(full);
  ret.restore();
  if(mode==='interrupt')document.querySelector('main')!.dispatchEvent(new Event('wheel',{bubbles:true}));
 }
 // A navigation that does not use Back: the list returns, restore() is never called.
 const away=()=>{setView('list');setIds(full)};
 return <div>
  {mounted&&<main>
   {view==='list'?<><div style={{height:400}}>Header block</div>
    {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-scrollable panel, as the real list panels */}<section className="lr-panel" tabIndex={0} aria-label="Panel" style={{height:360,overflowY:'auto'}}>{ids.map(id=><button key={id} type="button" data-record-id={id} style={{display:'block',height:48,margin:'1px 0',width:'100%'}} onClick={event=>{ret.leave(event.currentTarget);setView('detail')}}>Row {id}</button>)}</section>
    <div style={{height:1600}}>Footer block</div></>
   :<section aria-label="Detail"><h2>Detail</h2><div style={{height:300}}>Short detail</div></section>}
  </main>}
  <footer style={{position:'fixed',bottom:0,left:0,right:0,background:'#ddd',display:'flex',flexWrap:'wrap',gap:4}}>
   {(['plain','late','slow','shrunk','removed','reordered','interrupt'] as Mode[]).map(mode=><button key={mode} type="button" onClick={()=>back(mode)}>Back {mode}</button>)}
   <button type="button" onClick={away}>Away</button>
   <button type="button" onClick={()=>setMounted(false)}>Unmount</button>
   <output data-testid="view">{view}</output>
  </footer>
 </div>;
}
const app=<App/>;
const root=createRoot(document.getElementById('root')!);(window as any).__unmount=()=>root.unmount();
root.render(location.search.includes('strict')?<StrictMode>{app}</StrictMode>:app);
