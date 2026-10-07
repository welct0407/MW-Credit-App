import {test,expect,type Page} from '@playwright/test';
import {borrowers,sampleDate} from '../../apps/pwa/src/fixtures';
const cards=(page:Page)=>page.locator('.borrower-card');
const nav=(page:Page)=>page.getByRole('navigation',{name: page.viewportSize()!.width<900?'Quick navigation':'Main navigation'});
const amount=(text:string|null)=>Number(text?.replace(/[^0-9]/g,''));
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)}
test.beforeEach(async({page})=>{await page.goto('/')});
test('reconciles sample charges separately from principal and filters collection',async({page})=>{
 const due=borrowers.reduce((sum,b)=>sum+b.loans.reduce((s,l)=>s+l.charges.filter(c=>c.date<=sampleDate).reduce((s,c)=>s+c.amount,0),0),0);
 expect(due).toBe(4400); expect(borrowers.reduce((s,b)=>s+b.principal,0)).toBe(90000);
 expect(amount(await page.getByTestId('total-due').textContent())).toBe(due);
 await expect(page.getByRole('region',{name:'Sample summary'})).toContainText('03 borrowers');
 await expect(page.getByRole('region',{name:'Sample summary'})).not.toContainText('90,000');
 await expect(page.locator('.metric')).toHaveCount(2);
 await expect(cards(page)).toHaveCount(3);
 await page.getByLabel('Filter borrowers').selectOption('overdue');await expect(cards(page)).toHaveCount(1);await expect(page.getByTestId('borrower-SAMPLE-002')).toBeVisible();
 await page.getByLabel('Filter borrowers').selectOption('due');await expect(cards(page)).toHaveCount(2);
 await page.getByLabel('Search borrowers').fill('missing-person');await expect(page.getByRole('heading',{name:'No matching borrowers'})).toBeVisible();
 await page.getByRole('button',{name:'Reset filters'}).click();await expect(cards(page)).toHaveCount(3);await expect(page.getByLabel('Filter borrowers')).toHaveValue('all');
 await page.getByLabel('Search borrowers').fill('sample-002');await expect(cards(page)).toHaveCount(1);
});
test('borrower groups, two-loan detail and back preserve list context',async({page})=>{
 await nav(page).getByRole('button',{name:/Borrowers/}).click();await expect(cards(page)).toHaveCount(5);
 await page.getByLabel('Filter borrowers').selectOption('active');await expect(cards(page)).toHaveCount(4);
 await page.getByLabel('Filter borrowers').selectOption('inactive');await expect(cards(page)).toHaveCount(1);await page.getByTestId('borrower-SAMPLE-005').click();await expect(page.getByRole('region',{name:'Borrower details'})).toContainText('No active sample loans.');
 if(page.viewportSize()!.width<900)await page.getByRole('button',{name:'Back to list'}).click();await page.getByLabel('Filter borrowers').selectOption('all');await page.getByLabel('Search borrowers').fill('Somchai');await page.getByTestId('borrower-SAMPLE-002').click();
 const detail=page.getByRole('region',{name:'Borrower details'});await expect(detail).toContainText('DEMO-L002');await expect(detail).toContainText('DEMO-L003');await expect(detail).toContainText('2,300');await expect(detail).toContainText('36,000');await expect(detail).toContainText('Placeholder only.');await expect(detail.getByRole('button',{name:'Record payment · planned'})).toBeDisabled();await noOverflow(page);
 if(page.viewportSize()!.width<900)await page.getByRole('button',{name:'Back to list'}).click();await expect(page.getByLabel('Search borrowers')).toHaveValue('Somchai');await expect(cards(page)).toHaveCount(1);
});
test('Thai controls and narrow layout remain usable',async({page})=>{
 await page.getByRole('button',{name:'ไทย',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('lang','th');await expect(page.getByRole('heading',{name:'ติดตามชำระ',exact:true})).toBeVisible();await expect(page.getByLabel('ค้นหาผู้กู้')).toBeVisible();
 await page.getByLabel('ค้นหาผู้กู้').fill('สมชาย');await expect(cards(page)).toHaveCount(1);await page.getByTestId('borrower-SAMPLE-002').click();await expect(page.getByRole('region',{name:'รายละเอียดผู้กู้'})).toContainText('สัญญาตัวอย่าง');await noOverflow(page);
 await page.setViewportSize({width:360,height:844});await noOverflow(page);await expect(page.getByRole('button',{name:'กลับไปรายการ'})).toBeVisible();await page.getByRole('button',{name:'กลับไปรายการ'}).click();await expect(page.getByLabel('ค้นหาผู้กู้')).toBeVisible();
 await page.getByRole('button',{name:'EN',exact:true}).click();await expect(page.getByRole('heading',{name:'Collection',exact:true})).toBeVisible();
});
test('preview has no external business requests or persistent client data',async({page})=>{
 const unwanted:string[]=[];page.on('request',r=>{const url=new URL(r.url());if(url.hostname!=='127.0.0.1'||r.method()!=='GET'||url.pathname.startsWith('/api'))unwanted.push(r.method()+' '+r.url())});
 await page.reload();await expect(page.locator('.preview-strip')).toBeVisible();await expect(page.getByText('Sample business date',{exact:true})).toBeVisible();await page.getByTestId('borrower-SAMPLE-002').click();if(page.viewportSize()!.width<900)await page.getByRole('button',{name:'Back to list'}).click();await nav(page).getByRole('button',{name:/Borrowers/}).click();
 expect(unwanted).toEqual([]);expect(await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,caches:await caches.keys(),workers:(await navigator.serviceWorker.getRegistrations()).length}))).toEqual({local:0,session:0,caches:[],workers:0});
});
test('keyboard controls and planned workflows are reachable',async({page})=>{
 await page.getByLabel('Search borrowers').focus();await expect(page.getByLabel('Search borrowers')).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByLabel('Filter borrowers')).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByTestId('borrower-SAMPLE-001')).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByRole('region',{name:'Borrower details'})).toContainText('Mali · Sample');
 if(page.viewportSize()!.width<900)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Analytics / history'}).click();await expect(page.getByText('PLANNED WORKFLOW',{exact:true})).toBeVisible();await expect(page.getByText(/Metabase integration follows production go-live/)).toBeVisible();await noOverflow(page);
 await page.getByRole('button',{name:'Explore Collection'}).click();await expect(cards(page)).toHaveCount(3);
});
test('captures synthetic desktop and mobile review screens',async({page},testInfo)=>{
 const mobile=testInfo.project.name.startsWith('mobile');await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:900});await noOverflow(page);
 if(mobile)await page.screenshot({path:'outputs/r052-preview/mobile-viewport.png'});
 await page.screenshot({path:`outputs/r052-preview/${mobile?'mobile':'desktop'}-collection.png`,fullPage:true});await page.getByTestId('borrower-SAMPLE-002').click();await noOverflow(page);await page.screenshot({path:`outputs/r052-preview/${mobile?'mobile':'desktop'}-detail.png`,fullPage:true});
});

test('mobile drawer traps focus, closes with Escape and returns focus',async({page})=>{
 await page.setViewportSize({width:390,height:844});const open=page.getByRole('button',{name:'Open navigation',exact:true});await open.click();await expect(page.locator('.brand')).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Analytics / history'})).toBeFocused();await page.keyboard.press('Tab');await expect(page.locator('.brand')).toBeFocused();await page.keyboard.press('Escape');await expect(open).toBeFocused();await expect(open).toHaveAttribute('aria-expanded','false');
});
test('Thai mobile review screenshot',async({page},testInfo)=>{
 test.skip(!testInfo.project.name.startsWith('mobile'));await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'ไทย',exact:true}).click();await page.screenshot({path:'outputs/r052-preview/mobile-thai-collection.png',fullPage:true});await page.setViewportSize({width:360,height:844});await noOverflow(page);await page.screenshot({path:'outputs/r052-preview/mobile-thai-360-viewport.png'});await page.getByTestId('borrower-SAMPLE-003').scrollIntoViewIfNeeded();await page.getByTestId('borrower-SAMPLE-003').click();await expect(page.getByRole('region',{name:'รายละเอียดผู้กู้'})).toContainText('นิดา');await page.getByRole('button',{name:'กลับไปรายการ'}).click();await page.getByTestId('borrower-SAMPLE-002').click();await page.screenshot({path:'outputs/r052-preview/mobile-thai-detail.png',fullPage:true});await page.getByRole('button',{name:'บันทึกการชำระ · อยู่ในแผน'}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'บันทึกการชำระ · อยู่ในแผน'})).toBeVisible();
});

test('AppSheet colors are presentation only with coordinated tinted surfaces and theme logos',async({page},testInfo)=>{
 const mobile=testInfo.project.name.startsWith('mobile');
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:900});
 const requests:string[]=[];page.on('request',request=>{requests.push(request.url())});
 const logo=page.locator('.brand-logo');
 expect(await logo.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 await expect(logo).toHaveAttribute('alt','Loan Manager');
 for(const [theme,color,tint,selected] of [['dev','rgb(232, 113, 10)','rgb(253, 241, 231)','rgb(251, 232, 216)'],['prod','rgb(216, 27, 96)','rgb(251, 232, 239)','rgb(249, 219, 230)']]){
  await page.getByRole('group',{name:'Theme preview'}).getByRole('button',{name:theme.toUpperCase(),exact:true}).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-preview-theme',theme);
  await expect(logo).toHaveAttribute('src',theme==='dev'?/loan-manager-logo-dev-orange/:/loan-manager-logo\.png/);
  await expect.poll(()=>logo.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await expect(page.locator('.topbar')).toHaveCSS('border-top-color',color);
  await expect(page.getByText('Colors only · no environment change',{exact:true})).toBeVisible();
  for(const metric of await page.locator('.metric,.list-panel,.detail-panel').all())await expect(metric).toHaveCSS('background-color',tint);
  for(const label of await page.locator('.metric > span,.metric > strong,.metric small,.status').all())await expect(label).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await noOverflow(page);
  await page.screenshot({path:`outputs/r052-preview/${theme}-${mobile?'mobile':'desktop'}-style-viewport.png`});
  await page.getByTestId('borrower-SAMPLE-002').click();await page.mouse.move(0,0);await expect(page.locator('.borrower-card.selected')).toHaveCSS('background-color',selected);
  await checkTextContrast(page);
  if(mobile){await page.getByRole('button',{name:'Back to list'}).click();await page.getByRole('button',{name:'Open navigation',exact:true}).click();await expect(logo).toBeVisible();await page.screenshot({path:"outputs/r052-preview/logo-"+theme+'-mobile-menu.png'});await page.keyboard.press('Escape');}
 }
 expect(requests.every(url=>{const parsed=new URL(url);return parsed.hostname==='127.0.0.1'&&parsed.pathname.endsWith('.png')})).toBe(true);
 await page.reload();await expect(page.locator('.app-shell')).toHaveAttribute('data-preview-theme','dev');
 await page.goto('/?theme=prod');await expect(page.locator('.app-shell')).toHaveAttribute('data-preview-theme','prod');await expect(page.getByTestId('total-due')).toContainText('4,400');
 await page.setViewportSize({width:360,height:844});await noOverflow(page);
});
async function checkTextContrast(page:Page){
 const samples=await page.locator('.metric > span,.metric > strong,.metric small,.person > strong,.person > span,.card-amount > strong,.detail-amounts span,.detail-amounts strong,.loan dt,.loan dd,.receipt p,.issue-note p').evaluateAll(elements=>{
  const luminance=(rgb:number[])=>rgb.map(v=>v/255).map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
  return elements.filter(el=>el.getClientRects().length>0).map(el=>{
   const style=getComputedStyle(el);let ancestor:Element|null=el;let bg='';
   while(ancestor){bg=getComputedStyle(ancestor).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;ancestor=ancestor.parentElement}
   const parse=(s:string)=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
   const a=luminance(parse(style.color)),b=luminance(parse(bg));
   return {text:el.textContent?.trim(),ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};
  });
 });
 expect(samples.length).toBeGreaterThan(5);
 for(const sample of samples)expect(sample.ratio,`${sample.text} contrast`).toBeGreaterThanOrEqual(4.5);
}
test('meaningful text stays readable across desktop tablet and narrow English Thai states',async({page},testInfo)=>{
 test.skip(!testInfo.project.name.startsWith('desktop'));
 for(const width of [1440,1024,768,390,360]){
  await page.setViewportSize({width,height:900});
  for(const lang of ['EN','ไทย']){
   await page.goto('/');if(lang==='ไทย')await page.getByRole('button',{name:'ไทย',exact:true}).click();
   const scan=async()=>{
    await noOverflow(page);
    const issues=await page.evaluate(()=>{
     const issues:string[]=[];
     for(const el of document.querySelectorAll('body *')){
      const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
      if(!rect.width||!rect.height||style.visibility==='hidden'||!el.getClientRects().length||rect.right<=0||rect.left>=innerWidth)continue;
      const ownText=Array.from(el.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent?.trim()).join('').trim();
      if(!ownText&&!['INPUT','SELECT','BUTTON'].includes(el.tagName))continue;
      if(el.closest('[aria-hidden="true"],.sr-only'))continue;
      if(parseFloat(style.fontSize)<14)issues.push('small '+style.fontSize+' '+ownText.slice(0,50));
      if(['INPUT','SELECT'].includes(el.tagName)&&parseFloat(style.fontSize)<16)issues.push('input small');
      if(ownText){for(const node of Array.from(el.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim())){const range=document.createRange();range.selectNodeContents(node);for(const textRect of Array.from(range.getClientRects()))if(textRect.left<rect.left-2||textRect.right>rect.right+2)issues.push('text outside box '+ownText.slice(0,40));}}
      if(['hidden','clip'].includes(style.overflowX)&&el.scrollWidth>el.clientWidth+2)issues.push('clipped '+ownText.slice(0,40));
     }
     const controls=Array.from(document.querySelectorAll<HTMLElement>('.search,.filters select,.language button,.theme-preview button,.nav-item,.mobile-nav button')).filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&!el.closest('[inert]')});
     for(const el of controls){if(el.getBoundingClientRect().height<43.5)issues.push('small control '+el.className);}
     for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i].getBoundingClientRect(),b=controls[j].getBoundingClientRect();if(a.bottom<0||b.bottom<0||a.top>innerHeight||b.top>innerHeight)continue;if(controls[i].closest('.mobile-nav')||controls[j].closest('.mobile-nav'))continue;if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)issues.push('overlapping controls');}
     return issues;
    });expect(issues).toEqual([]);
   };
   await scan();
   await page.screenshot({path:`outputs/r052-preview/readable-${width}-${lang==='EN'?'en':'th'}.png`,fullPage:true});
   await page.getByTestId('borrower-SAMPLE-003').scrollIntoViewIfNeeded();await page.getByTestId('borrower-SAMPLE-003').click();await scan();
   const back=page.getByRole('button',{name:lang==='EN'?'Back to list':'กลับไปรายการ'});if(await back.isVisible())await back.click();
   const search=page.getByLabel(lang==='EN'?'Search borrowers':'ค้นหาผู้กู้');await search.fill('no-such-sample');await scan();await page.getByRole('button',{name:lang==='EN'?'Reset filters':'ล้างตัวกรอง'}).click();
   const open=page.getByRole('button',{name:lang==='EN'?'Open navigation':'เปิดเมนู',exact:true});if(await open.isVisible()){await open.click();await scan();}
   await page.getByRole('navigation',{name:lang==='EN'?'Main navigation':'เมนูหลัก'}).getByRole('button',{name:lang==='EN'?'Analytics / history':'วิเคราะห์ / ประวัติ'}).click();await scan();
  }
 }
});
