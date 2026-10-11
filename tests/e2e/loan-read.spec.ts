import {chooseLanguagePreservingForm,signOut} from './live-controls';
import {test,expect} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
let server:ChildProcess;let base:string;let serverLog="";
test.beforeAll(async({},info)=>{
 const port=4500+info.workerIndex;base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-live-${port}-${Date.now()}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app'},stdio:'pipe'});
 server.stdout?.on("data",data=>{serverLog+=String(data)});server.stderr?.on("data",data=>{serverLog+=String(data)});
 await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return0()}},{timeout:20000}).toBe(200);
});
function return0(){return 0}
test.afterAll(()=>server?.kill()); test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus)console.log(serverLog)});
const authMock=`let listener;export const browserLocalPersistence='local';export const inMemoryPersistence='memory';export const browserPopupRedirectResolver={};export function initializeAuth(a,o){if(o.persistence!=='local')throw Error('persistence');return {}};export function getAuth(){return {}};export async function setPersistence(a,p){if(p!=='local')throw Error('persistence');}export function onAuthStateChanged(a,fn){listener=fn;fn(null);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener({uid:'synthetic-owner',getIdToken:async()=>'synthetic-bearer'})};export async function signOut(){listener(null)};`;
const borrower={id:'test-row',name:'SYNTHETIC BROWSER FIXTURE',borrowerDisplayName:'SYNTHETIC BROWSER FIXTURE - English',totalProfitEarned:'-12.34',createdDate:'2026-10-07',hasActiveLoan:true,outstandingPrincipal:'1234.56',note:'Synthetic note only'};
const loan={id:'SYNTHETIC-LOAN-1',borrowerId:'test-row',borrowerDisplayName:'SYNTHETIC BROWSER FIXTURE - English',originalDailyInterestRate:'2',loanDate:'2026-10-07',dueDate:null,closeDate:null,loanType:'ดอกเบี้ยรายวัน',status:'ปิดยอดแล้ว',principalAmount:'2345.67',outstandingPrincipal:'1234.56',totalPrincipalReceived:'1111.11',totalInterestReceived:null,totalAmountReceived:'1122.22',defaulted:true,autoChargeEnabled:false};
test('nested loans synthetic list detail pagination errors and stale logout',async({page},info)=>{
 let code=200,hold=false,release:(()=>void)|undefined;const calls:string[]=[];
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));
 await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:authMock}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async r=>{
 const req=r.request(),u=new URL(req.url());if(req.method()==='OPTIONS'){await r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'Authorization'}});return}
 expect(req.method()).toBe('GET');expect(req.headers().authorization).toBe('Bearer synthetic-bearer');expect(req.headers().cookie).toBeUndefined();calls.push(u.pathname+u.search);
 const nested=u.pathname.includes('/loans');if(nested&&hold)await new Promise<void>(resolve=>release=resolve);
 const result={ok:true,source:'dev',asOf:'2026-10-07T05:00:00Z',businessDate:'2026-10-07',items:[borrower,{...borrower,id:'second-row',name:'SECOND SYNTHETIC BORROWER',borrowerDisplayName:'SECOND SYNTHETIC BORROWER - English'}],item:u.pathname.endsWith('/second-row')?{...borrower,id:'second-row',name:'SECOND SYNTHETIC BORROWER'}:borrower,nextCursor:null} as any;
 if(nested){result.items=u.searchParams.has('cursor')||u.pathname.includes('/second-row/')?[]:[loan];result.item=loan;result.nextCursor=u.searchParams.has('cursor')?null:'synthetic-next';}
 await r.fulfill({status:nested?code:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(nested&&code!==200?{ok:false,code:'unavailable'}:result)}).catch(()=>{});
 });
 await page.goto(base);await page.getByRole('button',{name:'Continue with Google'}).click();await page.locator('.borrower-tile-main').first().click();await expect(page.locator('.related-loans .group-inactive')).toContainText('Closed loans');await expect(page.locator('.loan-record')).toContainText('฿');await page.screenshot({path:`outputs/r052-loan-read/REFINED-${info.project.name}-list-en.png`,fullPage:true});
 await page.locator('.loan-record').click();const detail=page.getByRole('article',{name:'Loan details'});await expect(detail).toContainText('2,345.67');await expect(detail).toContainText('Unavailable');await page.screenshot({path:`outputs/r052-loan-read/REFINED-${info.project.name}-detail-en.png`,fullPage:true});
 await chooseLanguagePreservingForm(page,'ไทย');await expect(page.getByRole('article',{name:'รายละเอียดสัญญา'})).toContainText('เงินต้นเริ่มต้น');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`outputs/r052-loan-read/REFINED-${info.project.name}-detail-th.png`,fullPage:true});
 await chooseLanguagePreservingForm(page,'EN');await page.getByRole('button',{name:'Back to loans'}).click();await page.getByRole('button',{name:'Next loans page',exact:true}).click();await expect(page.getByText('No loans for this borrower.',{exact:true})).toBeVisible();expect(calls.some(p=>p.includes('cursor=synthetic-next'))).toBe(true);
 code=503;await page.getByRole('button',{name:'First loans page / refresh',exact:true}).click();await expect(page.getByText('Unable to load loan records.',{exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Borrower details'})).toBeVisible();await expect(page.locator('.loan-freshness')).toHaveCount(0);
 code=404;await page.getByRole('button',{name:'Retry loan list'}).click();await expect(page.getByText('This borrower or loan is no longer available.',{exact:true})).toBeVisible();code=200;await page.getByRole('button',{name:'Retry loan list'}).click();await expect(page.locator('.loan-record')).toHaveCount(1);
 // Back cancels an in-flight nested read; selecting another parent must not revive it.
 await page.setViewportSize({width:390,height:844});hold=true;release=undefined;
 await page.getByRole('button',{name:'First loans page / refresh',exact:true}).click();await expect.poll(()=>Boolean(release)).toBe(true);
 await page.getByRole('button',{name:'Back to list'}).click();await expect(page.locator('.related-loans')).toHaveCount(0);hold=false;release!();
 await page.getByRole('button',{name:/SECOND SYNTHETIC BORROWER/}).click();await expect(page.getByText('No loans for this borrower.',{exact:true})).toBeVisible();await expect(page.locator('.loan-record')).toHaveCount(0);
 await page.getByRole('button',{name:'Back to list'}).click();await page.locator('.borrower-tile-main').first().click();await expect(page.locator('.loan-record')).toHaveCount(1);
 code=401;await page.getByRole('button',{name:'First loans page / refresh',exact:true}).click();await expect(page.getByRole('heading',{name:'Please sign in again'})).toBeVisible();await expect(page.locator('.borrower-tile-main')).toHaveCount(0);await expect(page.locator('.related-loans')).toHaveCount(0);
 code=200;await page.getByRole('button',{name:'Continue with Google'}).click();await page.locator('.borrower-tile-main').first().click();await expect(page.locator('.loan-record')).toHaveCount(1);release=undefined;
 hold=true;await page.getByRole('button',{name:'First loans page / refresh',exact:true}).click();await expect.poll(()=>Boolean(release)).toBe(true);await page.setViewportSize({width:1440,height:844});await signOut(page);release!();await expect(page.getByRole('heading',{name:'Sign in to continue'})).toBeVisible();await expect(page.locator('.related-loans')).toHaveCount(0);
});
