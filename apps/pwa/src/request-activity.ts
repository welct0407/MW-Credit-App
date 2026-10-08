let pending=0;
const listeners=new Set<()=>void>();
export const activitySnapshot=()=>pending;
export function subscribeActivity(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
export function beginRequest(){pending++;listeners.forEach(fn=>fn());let ended=false;return()=>{if(ended)return;ended=true;pending--;listeners.forEach(fn=>fn())}}
