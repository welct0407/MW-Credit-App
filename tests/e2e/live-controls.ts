import {expect,type BrowserContext,type Page} from '@playwright/test';
export async function chooseLanguage(page:Page, language:'EN'|'ไทย') {
 await expect(page.locator('.live-body')).toBeVisible();
 // Signed out, phones show the language choice on the sign-in card (APP-UX-SETTINGS-02), not in the menu.
 const card=await page.locator('.access-language').filter({visible:true}).count()>0,mobile=!card&&page.viewportSize()!.width<=1050;
 if(mobile)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click();
 else if(!card&&await page.locator('.live-body').evaluate(el=>el.classList.contains('nav-collapsed')))await page.getByRole('button',{name:/^(Language|ภาษา)$/}).click();
 const choice=page.getByRole('button',{name:language,exact:true}).filter({visible:true});
 await expect(choice).toBeVisible();await choice.click();
 await expect(page.locator('html')).toHaveAttribute('lang',language==='EN'?'en':'th');
 if(mobile)await page.getByRole('button',{name:/^(Close menu|ปิดเมนู)$/}).click();
}
export async function signOut(page:Page) {
 if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click();
 await page.getByRole('button',{name:/^(Sign out|ออกจากระบบ)$/}).click();
}
// Responsive retained-form harness: use the real desktop language control while
// the same form stays mounted, then restore narrow geometry. This does not claim
// that mobile forms expose a language/menu action beside their global Back.
export async function chooseLanguagePreservingForm(page:Page, language:'EN'|'ไทย') {
 const viewport=page.viewportSize()!;
 const fields=()=>page.locator('main input,main textarea,main select').evaluateAll(elements=>elements.map(element=>{
  const field=element as HTMLInputElement;return {value:field.value,checked:field.checked};
 }));
 const before=await fields();
 if(viewport.width<=1050)await page.setViewportSize({...viewport,width:1440});
 try {await chooseLanguage(page,language);await expect.poll(fields).toEqual(before);}
 finally {if(viewport.width<=1050)await page.setViewportSize(viewport);}
}

// Controlled responsive auth harness: retain the active child/request while
// using the real desktop sign-out control; Back must not cancel it first.
export async function signOutPreservingActiveChild(page:Page) {
 const viewport=page.viewportSize()!;
 if(viewport.width<=1050)await page.setViewportSize({...viewport,width:1440});
 try {await signOut(page);}
 finally {if(viewport.width<=1050)await page.setViewportSize(viewport);}
}

// R062 language choices persist through GET /api/preferences and a
// preference.update command. Harnesses without that API model the preference
// service here; other operation POSTs fall through to the harness's own routes.
export async function routeSyntheticPreferences(target:Page|BrowserContext,origin='https://mw-credit-app-command-dev-test.run.app'){
 const writes:any[]=[];let item:any={id:'synthetic-preference-partner',version:'0'.repeat(63)+'1',language:'English',statementAccountId:null,statementDate:null};
 await target.route(origin+'/api/preferences',r=>r.fulfill({json:{ok:true,item,accounts:[],dates:[]}}));
 await target.route(origin+'/api/operations',r=>{const command=r.request().method()==='POST'?r.request().postDataJSON():null;if(command?.operation!=='preference.update')return r.fallback();writes.push(command);item={...item,...command.inputs,version:(writes.length+1).toString(16).padStart(64,'0')};return r.fulfill({json:{kind:'recorded',originalOutcome:{status:'applied'}}})});
 // The app reconciles a recorded request through GET /api/operations/{id}; an unrelated body there keeps the preference pending and the language controls blocked.
 await target.route(origin+'/api/operations/*',r=>{const id=new URL(r.request().url()).pathname.split('/').at(-1);if(r.request().method()!=='GET'||!writes.some(command=>command.requestId===id))return r.fallback();return r.fulfill({json:{ok:true,kind:'recorded',originalOutcome:{status:'applied',code:null,result:null}}})});
 return writes;
}
