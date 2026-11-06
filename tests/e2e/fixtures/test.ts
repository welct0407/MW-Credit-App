import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test as base,expect,type BrowserContext,type Page,type Route} from '@playwright/test';
export * from '@playwright/test';
// Specs import `test` from here instead of '@playwright/test'. In WebKit (the
// mobile-webkit iPhone project) each test's context is a fresh persistent
// context: Playwright's ephemeral WebKit contexts behave like private browsing
// and abort any IndexedDB transaction that stores a Blob, which an iPhone
// Home Screen app does not. Every other browser keeps Playwright's context.
// WebKit's own setOffline also makes every Blob and File read fail
// (NotReadableError), which an iPhone in airplane mode does not, so offline
// is emulated instead: requests abort as disconnected, navigator.onLine is
// false and the offline/online events fire, as in Chromium.
const offlineKey='__playwright_webkit_offline';
async function emulateOffline(context:BrowserContext){
 let offline=false;const abort=(route:Route)=>route.abort('internetdisconnected');
 await context.addInitScript(key=>{let off=false;try{off=localStorage.getItem(key)==='1'}catch{}Object.defineProperty(Navigator.prototype,'onLine',{configurable:true,get:()=>{try{return localStorage.getItem(key)!=='1'}catch{return !off}}})},offlineKey);
 context.setOffline=async(value:boolean)=>{
  if(value===offline)return;offline=value;
  if(value)await context.route('**/*',abort);else await context.unroute('**/*',abort);
  for(const page of context.pages())await page.evaluate(([key,value])=>{try{if(value)localStorage.setItem(key,'1');else localStorage.removeItem(key)}catch{}window.dispatchEvent(new Event(value?'offline':'online'))},[offlineKey,value] as const).catch(()=>{});
 };
}
export const test=base.extend({
 context:async({context,browserName,playwright,contextOptions,viewport,userAgent,deviceScaleFactor,isMobile,hasTouch,baseURL,locale,timezoneId,permissions,colorScheme,geolocation,offline,extraHTTPHeaders,ignoreHTTPSErrors,javaScriptEnabled,serviceWorkers,bypassCSP,acceptDownloads,actionTimeout,navigationTimeout,headless,launchOptions},use)=>{
  if(browserName!=='webkit'){await use(context);return}
  const options:Record<string,unknown>={...contextOptions,viewport,userAgent,deviceScaleFactor,isMobile,hasTouch,baseURL,locale,timezoneId,permissions,colorScheme,geolocation,offline,extraHTTPHeaders,ignoreHTTPSErrors,javaScriptEnabled,serviceWorkers,bypassCSP,acceptDownloads};
  for(const key of Object.keys(options))if(options[key]===undefined)delete options[key];
  // An ASCII temporary profile: WebKit rejects a --user-data-dir with non-ASCII characters (test titles carry Thai and dashes).
  const profile=await mkdtemp(join(tmpdir(),'mw-webkit-'));
  const persistent=await playwright.webkit.launchPersistentContext(profile,{...launchOptions,headless,...options});
  if(actionTimeout)persistent.setDefaultTimeout(actionTimeout);
  if(navigationTimeout)persistent.setDefaultNavigationTimeout(navigationTimeout);
  await emulateOffline(persistent);
  // WebKit refuses screenshots taller than 32767 device pixels; at the iPhone's 3x scale a long full page
  // passes that, so full-page captures default to CSS pixels there.
  const fullPageInCss=(page:Page)=>{const original=page.screenshot.bind(page);page.screenshot=(options={})=>original(options.fullPage&&!options.scale?{...options,scale:'css'}:options)};
  persistent.pages().forEach(fullPageInCss);persistent.on('page',fullPageInCss);
  try{await use(persistent)}finally{await persistent.close();await rm(profile,{recursive:true,force:true})}
 },
});
type TouchPoint={x:number;y:number};
/**
 * Touch input for specs that drive real touch sequences. Chromium uses the
 * DevTools protocol (native touch); WebKit has no CDP, so the same sequence is
 * dispatched as TouchEvents on the element under the first touch point, the
 * way iOS targets every move and end at the touchstart element.
 */
export async function touchSession(page:Page){
 try{return await page.context().newCDPSession(page)}catch(error){if(!/only available in Chromium/.test(String(error)))throw error}
 return {send:async(method:string,params:{type?:string;touchPoints?:TouchPoint[]}={})=>{
  if(method==='Emulation.setTouchEmulationEnabled')return {};
  if(method!=='Input.dispatchTouchEvent')throw Error('touchSession: unsupported '+method);
  const type={touchStart:'touchstart',touchMove:'touchmove',touchEnd:'touchend',touchCancel:'touchcancel'}[params.type!];
  await page.evaluate(({type,points})=>{
   const w=window as any;if(type==='touchstart')w.__touchTarget=document.elementFromPoint(points[0].x,points[0].y)??document.body;
   const target:Element=w.__touchTarget??document.body;const last=w.__touchLast??points[0];if(points.length)w.__touchLast=points[0];
   // WebKit on Linux exposes TouchEvent but not the Touch or TouchEvent constructors: plain touch records on a cancelable Event.
   const touch=(p:{x:number;y:number})=>({identifier:1,target,clientX:p.x,clientY:p.y,pageX:p.x+scrollX,pageY:p.y+scrollY,screenX:p.x,screenY:p.y,radiusX:1,radiusY:1,force:1,rotationAngle:0});
   const touches=points.map(touch),changed=points.length?touches:[touch(last)];
   const event=new Event(type,{bubbles:true,cancelable:true,composed:true});
   Object.defineProperties(event,{touches:{value:touches},targetTouches:{value:touches},changedTouches:{value:changed}});
   target.dispatchEvent(event);
   if(type==='touchend'||type==='touchcancel'){delete w.__touchTarget;delete w.__touchLast}
  },{type,points:params.touchPoints??[]});
  return {};
 },detach:async()=>{}};
}
/** Clipboard access for Copy actions: WebKit has no clipboard-write permission (writeText is allowed on a user gesture). */
export async function grantClipboard(context:BrowserContext){
 try{await context.grantPermissions(['clipboard-read','clipboard-write'])}catch(error){if(!/Unknown permission/.test(String(error)))throw error;await context.clearPermissions();await context.grantPermissions(['clipboard-read'])}
}
/** Signs in through a spec's synthetic auth module, whose onAuthStateChanged defines window.emitUser once the app imports it (that can follow the load event). */
export async function emitSyntheticUser(page:Page){
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).emitUser),{message:'the synthetic auth module was imported'}).toBe('function');
 await page.evaluate(()=>(window as any).emitUser());
}
