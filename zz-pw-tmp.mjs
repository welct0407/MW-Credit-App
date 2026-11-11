import {accessSecret,sessionFrom,webFrom,SESSION_SECRET,WEB_SECRET,TOKEN_URL} from '/home/user/MW-Credit-App/scripts/dev/claude-test-token.mjs';
import {chromium,devices} from '@playwright/test';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const S='/tmp/claude-0/-home-user-MW-Credit-App/6751dc7f-ee53-577e-b7e2-efcbbaac10a1/scratchpad/';
const at=process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
const {refreshToken}=sessionFrom(await accessSecret(SESSION_SECRET,{accessToken:at}));const web=webFrom(await accessSecret(WEB_SECRET,{accessToken:at}));
const x=await (await fetch(TOKEN_URL+'?key='+web.apiKey,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken})})).json();
const claims=JSON.parse(Buffer.from(x.id_token.split('.')[1],'base64url').toString());if(claims.aud!=='clever-oasis-508610-n7')throw Error('aud');
const key=`firebase:authUser:${web.apiKey}:[DEFAULT]`;
const value=JSON.stringify({uid:claims.user_id??claims.sub,email:claims.email,emailVerified:true,isAnonymous:false,providerData:[],stsTokenManager:{refreshToken:x.refresh_token,accessToken:x.id_token,expirationTime:Date.now()+3500000},createdAt:String(Date.now()),lastLoginAt:String(Date.now()),apiKey:web.apiKey,appName:'[DEFAULT]'});
const dir=mkdtempSync(join(tmpdir(),'r140-prof-'));
const ctx=await chromium.launchPersistentContext(dir,{...devices['Pixel 7'],proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined});
await ctx.addInitScript(([k,v])=>{if(location.origin==='https://dev-lm.mw-credit.com'&&!localStorage.getItem(k))localStorage.setItem(k,v)},[key,value]);
await ctx.route(/\.run\.app/,r=>r.request().method()==='GET'?r.continue():(console.log('BLOCKED',r.request().method(),r.request().url()),r.abort()));
const page=await ctx.newPage();
const flat=async()=>(await page.locator('main').innerText()).replace(/\n+/g,' | ');
const open=async(name,pred)=>{const c=pred(page.locator('.borrower-card'));if(!(await c.count())){console.log('no card',name);return false}await c.first().click();await page.waitForTimeout(2000);console.log('===',name);console.log((await flat()).slice(0,1100));console.log('dts',JSON.stringify(await page.locator('main dt').allInnerTexts()));await page.screenshot({path:S+'dev-'+name+'.png',fullPage:true});await page.locator('.live-menu-toggle').click();await page.waitForSelector('.borrower-card');return true};
try{
await page.goto('https://dev-lm.mw-credit.com');await page.waitForTimeout(5000);
await page.locator('.live-menu-toggle').click();await page.getByRole('button',{name:'ค่าใช้จ่าย',exact:true}).filter({visible:true}).click();
await page.waitForSelector('.borrower-card',{timeout:20000});
// scroll list to load more
for(let i=0;i<4;i++){await page.mouse.wheel(0,3000);await page.waitForTimeout(600)}
const tiles=await page.locator('.borrower-card').evaluateAll(a=>a.map(x=>x.innerText.replace(/\n+/g,' | ')));console.log('tiles with Thai/English borrower names:',JSON.stringify(tiles.filter(t=>/ช่าย|R129|Yr/.test(t))));
await open('offset-thai',c=>c.filter({hasText:'ช่าย'}));
await open('r129-paid',c=>c.filter({hasText:'R129'}).filter({hasText:'จ่ายแล้ว'}));
await open('manual-paid',c=>c.filter({hasText:'฿70'}));
await page.getByRole('button',{name:/เพิ่ม/}).first().click();await page.waitForTimeout(1500);
for(const q of ['ช่าย','R129 Test Referrer A']){await page.locator('.expense-payee-search input').fill(q);await page.locator('.expense-payee-search button').click();await page.waitForTimeout(2500);console.log('search',q,JSON.stringify(await page.locator('main fieldset').first().locator('button').allInnerTexts()))}
}finally{await ctx.close();rmSync(dir,{recursive:true,force:true})}
