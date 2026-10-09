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
