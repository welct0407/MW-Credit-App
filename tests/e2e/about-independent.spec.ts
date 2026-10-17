import {chooseLanguage} from './live-controls';
import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
// R072 About (independent): a signed-in top-level view with release, environment and commit; absent signed out.
let server:ChildProcess;let base:string;let serverLog="";
test.beforeAll(async()=>{
 const port=7500+test.info().workerIndex;base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-about-${port}-${Date.now()}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app'},stdio:'pipe'});
 server.stdout?.on("data",data=>{serverLog+=String(data)});server.stderr?.on("data",data=>{serverLog+=String(data)});
 await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200);
});
test.afterAll(()=>server?.kill()); test.afterEach(async()=>{const info=test.info();if(info.status!==info.expectedStatus)console.log(serverLog)});
const authMock=`let listener;export const browserLocalPersistence='local';export const inMemoryPersistence='memory';export const browserPopupRedirectResolver={};export function initializeAuth(a,o){if(o.persistence!=='local')throw Error('persistence');return {}};export function getAuth(){return {}};export async function setPersistence(a,p){if(p!=='local')throw Error('persistence');}export function onAuthStateChanged(a,fn){listener=fn;fn(null);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener({uid:'synthetic-owner',getIdToken:async()=>'synthetic-bearer'})};export async function signOut(){listener(null)};`;
const borrower={id:'test-row',name:'SYNTHETIC ABOUT FIXTURE',borrowerDisplayName:'SYNTHETIC ABOUT FIXTURE - English',totalProfitEarned:'1.00',createdDate:'2026-10-07',hasActiveLoan:true,outstandingPrincipal:'100.00',note:null};
async function openFromMenu(page:Page,name:RegExp){
 if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click();
 await page.getByRole('button',{name}).filter({visible:true}).click();
}
test('About is a signed-in view with release, environment and commit in English and Thai',async({page},info)=>{
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 const external:string[]=[];
 await page.route('**/deps/firebase_app.js*',route=>route.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));
 await page.route('**/deps/firebase_auth.js*',route=>route.fulfill({contentType:'text/javascript',body:authMock}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async route=>{
  const req=route.request();if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'Authorization','access-control-allow-methods':'GET'}});return}
  await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,source:'dev',items:new URL(req.url()).pathname.endsWith('/loans')?[]:[borrower],item:borrower,nextCursor:null,asOf:'2026-10-07T05:00:00Z',businessDate:'2026-10-07'})}).catch(()=>{});
 });
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1'||u.hostname==='mw-credit-app-read-dev-test.run.app'){await route.fallback();return}external.push(u.hostname);await route.abort()});
 await page.goto(base);await expect(page.getByRole('heading',{name:'Sign in to continue',exact:true})).toBeVisible();
 await expect(page.locator('button[aria-label="About"],button[aria-label="เกี่ยวกับ"]')).toHaveCount(0);
 await page.getByRole('button',{name:'Continue with Google'}).click();await expect(page.getByRole('button',{name:/SYNTHETIC ABOUT FIXTURE/})).toBeVisible();
 await openFromMenu(page,/^About$/);
 const about=page.getByRole('region',{name:'About',exact:true});
 await expect(about).toBeVisible();await expect(page.locator('h1')).toHaveText('About');
 await expect(page.locator('button[aria-label="About"][aria-current="page"]')).not.toHaveCount(0);
 await expect(page.getByRole('button',{name:'Search borrowers'})).toHaveCount(0);
 const value=(label:string)=>about.locator('dt',{hasText:new RegExp('^'+label+'$')}).locator('xpath=following-sibling::dd[1]');
 await expect(value('Release')).toHaveText('R072 · in development');
 await expect(value('Environment')).toHaveText('DEV · dev-lm.mw-credit.com');
 await expect(value('Source commit')).toHaveText(/^([0-9a-f]{7,}|unknown)$/);
 await expect(value('Build')).toHaveText(/^([0-9a-f]{24}|Unavailable)$/);
 await expect(value('Access')).toHaveText('Read-only');await expect(value('Waiting to sync')).toHaveText('None');await expect(value('Language')).toHaveText('English');
 await expect(about.locator('img')).toHaveAttribute('alt','');await expect(about.getByText('DEV',{exact:true})).toBeVisible();
 await about.getByRole('button',{name:'Copy details'}).click();await expect(about.getByRole('status')).toHaveText('Copied');
 const copied=await page.evaluate(()=>navigator.clipboard.readText());
 expect(copied).toMatch(/^MW Credit\nRelease: R072 · in development\nBuild: ([0-9a-f]{24}|unavailable)\nCommit: ([0-9a-f]{7,}|unknown)\nEnvironment: Development \(https:\/\/dev-lm\.mw-credit\.com\)\nApp mode: Browser tab\nConnection: Online\nWaiting to sync: 0$/);
 expect(copied).not.toContain('synthetic-owner');
 await page.screenshot({path:`test-results/r072-about/${info.project.name}-about-en.png`,fullPage:true});
 await chooseLanguage(page,'ไทย');
 const thai=page.getByRole('region',{name:'เกี่ยวกับ',exact:true});
 await expect(thai).toBeVisible();await expect(page.locator('h1')).toHaveText('เกี่ยวกับ');await expect(thai).toContainText('R072 · กำลังพัฒนา');await expect(thai).toContainText('ภาษา');
 // Borrowers is a primary route: the desktop sidebar or the phone bottom bar, without the menu.
 await page.getByRole('button',{name:'ผู้กู้',exact:true}).filter({visible:true}).click();
 await expect(thai).toHaveCount(0);await expect(page.getByRole('button',{name:/SYNTHETIC ABOUT FIXTURE/})).toBeVisible();await expect(page.locator('h1')).toHaveText('ผู้กู้');
 expect(external).toEqual([]);
});
