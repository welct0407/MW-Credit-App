import {test,expect} from '@playwright/test';
test('synthetic access states hide prior records totals and selected detail in English and Thai',async({page},info)=>{
 const unexpected:string[]=[];page.on('request',r=>{const u=new URL(r.url());if(u.hostname!=='127.0.0.1'||r.method()!=='GET'||u.pathname.startsWith('/api'))unexpected.push(r.url())});
 await page.goto('/');
 for(const language of ['EN','ไทย']){
  await page.getByRole('button',{name:language,exact:true}).click();
  const access=page.getByLabel(language==='EN'?'Simulated access':'สิทธิ์จำลอง');
  await expect(page.getByText(language==='EN'?'Synthetic session only. No real sign-in or live access is established.':'เซสชันสมมติเท่านั้น ไม่ใช่การลงชื่อเข้าใช้หรือสิทธิ์เข้าถึงระบบจริง')).toBeVisible();
  for(const state of ['signed_out','expired','access_denied','unmapped_login']){
   await access.selectOption('allowed');await page.getByTestId('borrower-SAMPLE-002').click();await access.selectOption(state);
   await expect(page.locator('.borrower-card')).toHaveCount(0);await expect(page.getByTestId('total-due')).toHaveCount(0);await expect(page.locator('.detail-panel')).toHaveCount(0);await expect(page.locator('.access-blocked')).toBeVisible();await expect(page.locator('body')).not.toContainText('SAMPLE-002');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.screenshot({path:`outputs/r052-phase1b/${info.project.name}-${language==='EN'?'en':'th'}-denied.png`,fullPage:true});
  await access.selectOption('allowed');await expect(page.locator('.borrower-card')).toHaveCount(3);await expect(page.locator('.borrower-card[aria-pressed="true"]')).toHaveCount(0);await expect(page.getByTestId('total-due')).toContainText('4,400');
 }
 expect(unexpected).toEqual([]);await page.screenshot({path:`outputs/r052-phase1b/${info.project.name}-allowed.png`,fullPage:true});
});
test('synthetic monetary cents remain visible in EN and Thai without source mutation',async({page})=>{
 await page.route('**/apps/pwa/src/fixtures.ts*',async route=>{const response=await route.fetch();const source=await response.text();expect(source).toMatch(/amount: 1200/);await route.fulfill({response,body:source.replace('amount: 1200','amount: 1200.34')})});
 await page.goto('/');await expect(page.getByTestId('total-due')).toContainText('4,400.34');await expect(page.getByTestId('borrower-SAMPLE-001')).toContainText('1,200.34');await page.getByTestId('borrower-SAMPLE-001').click();await expect(page.getByRole('region',{name:'Borrower details'})).toContainText('1,200.34');await page.getByRole('button',{name:'ไทย',exact:true}).click();await expect(page.getByRole('region',{name:'รายละเอียดผู้กู้'})).toContainText('1,200.34');
});
