import {useSyncExternalStore} from 'react';
const subscribe=(listener:()=>void)=>{window.addEventListener('online',listener);window.addEventListener('offline',listener);return()=>{window.removeEventListener('online',listener);window.removeEventListener('offline',listener)}};
/** Connection state that repaints on change; handlers keep reading navigator.onLine directly. */
export function useOnline(){return useSyncExternalStore(subscribe,()=>navigator.onLine,()=>true)}
