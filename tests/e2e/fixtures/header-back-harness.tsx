import React,{useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{HeaderBack,useHeaderBack}from'../../../apps/pwa/src/HeaderBack';
import{useSwipeBack}from'../../../apps/pwa/src/swipe-back';
function App(){
 const [depth,setDepth]=useState(0),[tick,setTick]=useState(0),[busy,setBusy]=useState(false),[search,setSearch]=useState(false),[stale,setStale]=useState(false),[guard,setGuard]=useState(false),[attempts,setAttempts]=useState(0),active=useHeaderBack();
 const workspace=useRef<HTMLElement|null>(null),back=useRef<HTMLButtonElement|null>(null),searchBack=useRef<HTMLButtonElement|null>(null),searchToken=useRef(Symbol('search')),dialog=useRef<HTMLDialogElement|null>(null);
 useSwipeBack(workspace,search?searchBack:back,search?{token:searchToken.current,disabled:false}:active);
 function leave(next:number){setAttempts(n=>n+1);if(!guard||window.confirm('Leave draft?'))setDepth(next)}
 return <><button onClick={()=>setDepth(1)}>Open parent</button><button onClick={()=>setDepth(2)}>Open child</button><button onClick={()=>setTick(tick+1)}>Rerender parent</button><button onClick={()=>setBusy(!busy)}>Toggle busy</button><button onClick={()=>setSearch(!search)}>Toggle search</button><button onClick={()=>setStale(!stale)}>Toggle stale sibling</button><button onClick={()=>setGuard(!guard)}>Toggle guard</button><button onClick={()=>dialog.current?.showModal()}>Open dialog</button><output>{depth}:{tick}</output><span data-testid="attempts">{attempts}</span>
 <header>{search?<button ref={searchBack} aria-label="Close search" onClick={()=>setSearch(false)}>Back</button>:active&&<button ref={back} aria-label={active.label} disabled={active.disabled} onClick={active.run}>Back</button>}</header>
 <main ref={workspace} style={{height:420,overflowY:'auto'}}>
 {depth>0&&<section><HeaderBack aria-label="Back parent" onClick={()=>leave(0)}/>{depth>1&&<article><HeaderBack aria-label="Back child" disabled={busy} onClick={()=>leave(1)}/></article>}{stale&&<aside hidden><HeaderBack priority={100} aria-label="Stale sibling" onClick={()=>setDepth(99)}/></aside>}</section>}
 <div data-testid="swipe-surface" style={{height:180,background:'#eee'}}>Workspace content</div>
 <input aria-label="Editable name"/><textarea aria-label="Editable note"/><select aria-label="Choice"><option>Option</option></select><button type="button">Content action</button><a href="#target">Content link</a><div contentEditable suppressContentEditableWarning>Editable text</div>
 <div data-testid="horizontal" style={{width:180,overflowX:'auto'}}><div style={{width:600,height:50}}>Horizontal content</div></div><p data-testid="selectable">Selectable workspace text</p><div style={{height:1200}}>Scrollable content</div>
 </main><dialog ref={dialog}><p>Dialog content</p><button onClick={()=>dialog.current?.close()}>Close dialog</button></dialog></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
