// Self-contained (no relative imports) so unit tests can load it directly.
/** R133 troubleshooting (R132 slow startup): when this launch reached each startup step, in ms since the page's time origin
 * (appStart is the wall-clock launch time; navigationType is 0 navigate, 1 reload, 2 back/forward, 3 prerender). The current
 * and the previous launch are kept in localStorage under one key, numbers only, rotated at each launch; a blocked or broken
 * storage only loses the record. The key is written only while a user session exists (setStartupTimingPersistence): a
 * signed-out app stores nothing and sign-out removes it, while this launch stays in memory for a signed-out file. Read by
 * the encrypted troubleshooting file (app.startup). */
export const STARTUP_TIMING_KEY='mw-credit-startup-timing';
export const STARTUP_MARKS=['appStart','navigationType','responseEnd','startupCheckDone','provisionalShown','sessionConfirmedMs','workspaceFirstRender','firstSyncDone'] as const;
export type StartupMark=typeof STARTUP_MARKS[number];
export type StartupMarks=Partial<Record<StartupMark,number>>;
type StorageLike={getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void};
const navigationTypes:Record<string,number>={navigate:0,reload:1,back_forward:2,prerender:3};
const numbersOnly=(value:unknown):StartupMarks=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([key,item])=>(STARTUP_MARKS as readonly string[]).includes(key)&&typeof item==='number'&&Number.isFinite(item))):{};
export function createStartupTiming({storage,now,wallClock=()=>Date.now(),navigation,persist=false}:{storage:()=>StorageLike|null;now:()=>number;wallClock?:()=>number;navigation?:{type?:string;responseEnd?:number}|null;persist?:boolean}){
 let persisting=persist;
 let previous:StartupMarks|null=null;
 try{const saved=JSON.parse(storage()?.getItem(STARTUP_TIMING_KEY)??'null');const marks=numbersOnly(saved?.current);previous=Object.keys(marks).length?marks:null}catch{previous=null}
 const current:StartupMarks={appStart:Math.round(wallClock())};
 const type=navigation?.type!==undefined?navigationTypes[navigation.type]:undefined;if(type!==undefined)current.navigationType=type;
 if(typeof navigation?.responseEnd==='number'&&Number.isFinite(navigation.responseEnd))current.responseEnd=Math.round(navigation.responseEnd);
 const write=()=>{if(!persisting)return;try{storage()?.setItem(STARTUP_TIMING_KEY,JSON.stringify({current,previous}))}catch{/* Timing is optional. */}};
 write();
 return {
  /** Records the first time this launch reached `name` (later calls keep it); returns the recorded value. */
  mark(name:StartupMark,value=now()){if(current[name]===undefined&&Number.isFinite(value)){current[name]=Math.round(value);write()}return current[name]},
  snapshot:()=>({current:{...current},previous:previous&&{...previous}}),
  /** true (a user session exists): writes the record now and at each later mark; false (signed out): removes the key. */
  setPersistence(enabled:boolean){if(enabled===persisting)return;persisting=enabled;if(enabled)write();else try{storage()?.removeItem(STARTUP_TIMING_KEY)}catch{/* Timing is optional. */}},
 };
}
const browser=typeof window!=='undefined'&&typeof performance!=='undefined';
const timing=browser?createStartupTiming({storage:()=>{try{return localStorage}catch{return null}},now:()=>performance.now(),navigation:(()=>{try{return performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined??null}catch{return null}})()}):null;
/** ms since the page's time origin (the app start). */
export const sinceAppStart=()=>typeof performance==='undefined'?0:Math.round(performance.now());
export const recordStartupMark=(name:StartupMark,value?:number)=>timing?.mark(name,value);
export const startupTimingSnapshot=()=>timing?.snapshot()??{current:{},previous:null};
export const setStartupTimingPersistence=(enabled:boolean)=>timing?.setPersistence(enabled);
