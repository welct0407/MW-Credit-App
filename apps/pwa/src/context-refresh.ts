import {useEffect,useRef} from 'react';
type Action={label:string;run:()=>void;priority:number};
const actions:Action[]=[];const listeners=new Set<()=>void>();
export const refreshSnapshot=()=>actions.reduce<Action|null>((best,current)=>!best||current.priority>=best.priority?current:best,null);
export function subscribeRefresh(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}
export function useContextRefresh(enabled:boolean,label:string,run:()=>void,priority=0){const latest=useRef(run);latest.current=run;useEffect(()=>{if(!enabled)return;const current={label,priority,run:()=>latest.current()};actions.push(current);listeners.forEach(fn=>{fn()});return()=>{const index=actions.indexOf(current);if(index>=0){actions.splice(index,1);listeners.forEach(fn=>{fn()})}}},[enabled,label,priority]);}
