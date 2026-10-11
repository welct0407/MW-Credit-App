import {expect,type Page} from '@playwright/test';
export async function chooseLanguage(page:Page, language:'EN'|'ไทย') {
 await expect(page.locator('.live-body')).toBeVisible();
 const mobile=page.viewportSize()!.width<=1050;
 if(mobile)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click();
 else if(await page.locator('.live-body').evaluate(el=>el.classList.contains('nav-collapsed')))await page.getByRole('button',{name:/^(Language|ภาษา)$/}).click();
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
