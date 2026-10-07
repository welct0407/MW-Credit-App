import type {Page} from '@playwright/test';
export async function chooseLanguage(page:Page, language:'EN'|'ไทย') {
 const mobile=page.viewportSize()!.width<=1050;
 if(mobile)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click();
 else if(await page.locator('.live-body').evaluate(el=>el.classList.contains('nav-collapsed')))await page.getByRole('button',{name:/^(Language|ภาษา)$/}).click();
 await page.getByRole('button',{name:language,exact:true}).click();
 if(mobile)await page.getByRole('button',{name:/^(Close menu|ปิดเมนู)$/}).click();
}
export async function signOut(page:Page) {
 if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click();
 await page.getByRole('button',{name:/^(Sign out|ออกจากระบบ)$/}).click();
}
