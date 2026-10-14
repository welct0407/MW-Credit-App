import {useLayoutEffect,useRef,useSyncExternalStore} from 'react';
const blockers=new Set<symbol>(),listeners=new Set<()=>void>();
const notify=()=>{for(const listener of listeners)listener()};
export const appUpdateSafe=()=>blockers.size===0;
export const subscribeAppUpdateSafety=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
export function useAppUpdateSafe(){return useSyncExternalStore(subscribeAppUpdateSafety,appUpdateSafe,()=>false)}
/** Editor/command lifecycles own their blocker; saved queue rows never enter this registry. */
export function useAppUpdateBlock(active:boolean){
 const token=useRef(Symbol('app-update-block'));
 useLayoutEffect(()=>{if(!active)return;blockers.add(token.current);notify();return()=>{blockers.delete(token.current);notify()}},[active]);
}
