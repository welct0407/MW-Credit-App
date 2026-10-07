import {test,expect} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
let server:ChildProcess;let base:string;
test.beforeAll(async({},info)=>{
 const port=4300+info.workerIndex;base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--mode','live-dev','--host','127.0.0.1','--port',String(port),'--strictPort'],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app'},stdio:'pipe'});
 await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return0()}},{timeout:20000}).toBe(200);
});
function return0(){return 0}
test.afterAll(()=>server?.kill());
const authMock=`let listener;export const inMemoryPersistence='memory';export function getAuth(){return {}};export async function setPersistence(a,p){if(p!=='memory')throw Error('persistence');}export function onAuthStateChanged(a,fn){listener=fn;fn(null);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener({uid:'synthetic-owner',getIdToken:async()=>'synthetic-bearer'})};export async function signOut(){listener(null)};`;
const borrower={id:'test-row',name:'SYNTHETIC BROWSER FIXTURE',createdDate:'2026-10-07',hasActiveLoan:true,outstandingPrincipal:'1234.56',note:'Synthetic note only'};
test('live entry mocked sign-in read errors signout and stale response isolation',async({page},info)=>{
 const external:string[]=[];let pendingRelease:(()=>void)|undefined;let hold=false;let responseStatus=200;
 await page.route('**/node_modules/.vite/deps/firebase_app.js*',route=>route.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));
 await page.route('**/node_modules/.vite/deps/firebase_auth.js*',route=>route.fulfill({contentType:'text/javascript',body:authMock}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async route=>{
  const req=route.request();if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'Authorization','access-control-allow-methods':'GET'}});return}
  expect(req.method()).toBe('GET');expect(req.headers().authorization).toBe('Bearer synthetic-bearer');expect(req.headers().cookie).toBeUndefined();
  if(hold)await new Promise<void>(resolve=>{pendingRelease=resolve});
  const body=responseStatus===200?{ok:true,source:'dev',items:[borrower],item:borrower,nextCursor:null,asOf:'2026-10-07T05:00:00Z',businessDate:'2026-10-07'}:{ok:false,code:'access_denied'};
  await route.fulfill({status:responseStatus,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)}).catch(()=>{});
 });
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1'||u.hostname==='mw-credit-app-read-dev-test.run.app'){await route.fallback();return}external.push(u.hostname);await route.abort()});
 await page.goto(base);await expect(page.getByRole('heading',{name:'Sign in to continue',exact:true})).toBeVisible();await expect(page.locator('.borrower-card')).toHaveCount(0);await expect(page.getByText('Access-state simulator',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Continue with Google'}).click();await expect(page.getByRole('button',{name:/SYNTHETIC BROWSER FIXTURE/})).toBeVisible();await expect(page.getByRole('button',{name:/SYNTHETIC BROWSER FIXTURE/})).toContainText('1,234.56');
 await page.getByRole('button',{name:/SYNTHETIC BROWSER FIXTURE/}).click();await expect(page.getByRole('region',{name:'Borrower details'})).toContainText('Synthetic note only');await page.screenshot({path:`outputs/r052-auth-read/${info.project.name}-MOCKED-allowed.png`,fullPage:true});
 if(await page.getByRole('button',{name:'Back to list'}).isVisible())await page.getByRole('button',{name:'Back to list'}).click();
 responseStatus=403;await page.getByRole('button',{name:'Refresh / first page'}).click();await expect(page.getByRole('heading',{name:'This account does not have access'})).toBeVisible();await expect(page.locator('.borrower-card')).toHaveCount(0);await expect(page.getByRole('region',{name:'Borrower details'})).toHaveCount(0);
 responseStatus=200;await page.getByRole('button',{name:'Continue with Google'}).click();await expect(page.locator('.borrower-card')).toHaveCount(1);hold=true;await page.getByRole('button',{name:'Refresh / first page'}).click();await expect.poll(()=>Boolean(pendingRelease)).toBe(true);await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.locator('.borrower-card')).toHaveCount(0);pendingRelease!();await expect(page.getByRole('heading',{name:'Sign in to continue'})).toBeVisible();await expect(page.locator('.borrower-card')).toHaveCount(0);
 await page.getByRole('button',{name:'ไทย',exact:true}).click();await page.screenshot({path:`outputs/r052-auth-read/${info.project.name}-MOCKED-signedout-th.png`,fullPage:true});expect(external).toEqual([]);expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
});
