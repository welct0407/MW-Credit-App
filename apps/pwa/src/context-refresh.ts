import {useEffect,useRef} from 'react';
type Action={label:string;run:()=>void};
let action:Action|null=null;const listeners=new Set<()=>void>();
export const refreshSnapshot=()=>action;
export function subscribeRefresh(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}
export function useContextRefresh(enabled:boolean,label:string,run:()=>void){const latest=useRef(run);latest.current=run;useEffect(()=>{if(!enabled)return;const current={label,run:()=>latest.current()};action=current;listeners.forEach(fn=>fn());return()=>{if(action===current){action=null;listeners.forEach(fn=>fn())}}},[enabled,label]);}
