import React,{createContext,useContext,useEffect,useLayoutEffect,useRef,useSyncExternalStore} from 'react';
const NavigationScope=createContext('');
export function BackNavigationScope({name,children}:{name:string;children:React.ReactNode}){const parent=useContext(NavigationScope);return <NavigationScope.Provider value={parent+'/'+name}>{children}</NavigationScope.Provider>}
type Entry={token:symbol;navigationKey:string;node:HTMLSpanElement;priority:number;props:React.ButtonHTMLAttributes<HTMLButtonElement>};
type BackAction={token:symbol;navigationKey:string;label:string|undefined;disabled:boolean;run:React.MouseEventHandler<HTMLButtonElement>};
const entries=new Map<symbol,Entry>(),listeners=new Set<()=>void>();let snapshot:BackAction|null=null;
function publish(){
 const visible=[...entries.values()].filter(entry=>{for(let node:HTMLElement|null=entry.node.parentElement;node;node=node.parentElement){if(node.hidden||getComputedStyle(node).display==='none')return false}return entry.node.isConnected});
 visible.sort((a,b)=>b.priority-a.priority);const chosen=visible[0],label=chosen?.props['aria-label'],disabled=Boolean(chosen?.props.disabled);
 if(snapshot?.token===chosen?.token&&snapshot?.navigationKey===chosen?.navigationKey&&snapshot?.label===label&&snapshot?.disabled===disabled||!snapshot&&!chosen)return;
 snapshot=chosen?{token:chosen.token,navigationKey:chosen.navigationKey,label,disabled,run:event=>{const current=entries.get(chosen.token);if(current&&!current.props.disabled)current.props.onClick?.(event)}}:null;listeners.forEach(fn=>fn());
}
export function useHeaderBack(){useEffect(()=>{window.addEventListener('resize',publish);return()=>window.removeEventListener('resize',publish)},[]);return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn)}},()=>snapshot,()=>null)}
/** Keep existing page-specific leave/disabled guards; only relocate their control. */
export function HeaderBack({priority,navigationKey,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{priority?:number;navigationKey:string}){
 const scope=useContext(NavigationScope);navigationKey=scope?scope+'/'+navigationKey:navigationKey;
 const node=useRef<HTMLSpanElement>(null),token=useRef(Symbol('header-back'));
 useLayoutEffect(()=>{if(!node.current)return;let depth=0;for(let parent:HTMLElement|null=node.current.parentElement;parent;parent=parent.parentElement)depth++;
 entries.set(token.current,{token:token.current,navigationKey,node:node.current,priority:priority??depth,props});publish();return()=>{entries.delete(token.current);publish()}},[]);
 useLayoutEffect(()=>{const entry=entries.get(token.current);if(entry){entry.props=props;entry.navigationKey=navigationKey;publish()}});
 return <span ref={node} hidden data-header-back=""/>;
}
