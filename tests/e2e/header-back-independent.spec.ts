import{test,expect}from'@playwright/test';
test('global Back preserves deepest guarded action across parent rerender and sibling cleanup',async({page})=>{await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div><script type="module" src="/tests/e2e/fixtures/header-back-harness.tsx"></script>'}));await page.goto('/');await expect(page.locator('header button')).toHaveCount(0);await page.getByRole('button',{name:'Open parent',exact:true}).click();await expect(page.locator('header button')).toHaveAccessibleName('Back parent');await page.getByRole('button',{name:'Open child',exact:true}).click();await expect(page.locator('header button')).toHaveAccessibleName('Back child');await page.getByRole('button',{name:'Rerender parent',exact:true}).click();await expect(page.locator('header button')).toHaveAccessibleName('Back child');await page.getByRole('button',{name:'Toggle stale sibling',exact:true}).click();await expect(page.locator('header button')).toHaveAccessibleName('Back child');await page.getByRole('button',{name:'Toggle stale sibling',exact:true}).click();await expect(page.locator('header button')).toHaveAccessibleName('Back child');await page.getByRole('button',{name:'Toggle busy',exact:true}).click();await expect(page.locator('header button')).toBeDisabled();await expect(page.locator('output')).toHaveText('2:1');await page.getByRole('button',{name:'Toggle busy',exact:true}).click();await page.getByRole('button',{name:'Toggle search',exact:true}).click();await expect(page.locator('header button')).toHaveAccessibleName('Close search');await page.locator('header button').click();await expect(page.locator('header button')).toHaveAccessibleName('Back child');await page.locator('header button').click();await expect(page.locator('header button')).toHaveAccessibleName('Back parent');await page.locator('header button').click();await expect(page.locator('header button')).toHaveCount(0)});

async function harness(page:import('@playwright/test').Page){await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/header-back-harness.tsx"></script>'}));await page.goto('/')}
async function touch(page:import('@playwright/test').Page,type:string,x:number,y:number,selector='[data-testid="swipe-surface"]',multiple=false){
 return page.locator(selector).evaluate((target,{type,x,y,multiple})=>{const point=new Touch({identifier:1,target,clientX:x,clientY:y});const points=multiple?[point,new Touch({identifier:2,target,clientX:x+20,clientY:y+20})]:[point];const event=new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'||type==='touchcancel'?[]:points,changedTouches:points});target.dispatchEvent(event);return event.defaultPrevented},{type,x,y,multiple})
}
async function swipe(page:import('@playwright/test').Page,selector='[data-testid="swipe-surface"]',dx=130,dy=0){await touch(page,'touchstart',70,160,selector);await touch(page,'touchmove',70+dx,160+dy,selector);expect(await touch(page,'touchend',70+dx,160+dy,selector)).toBe(false)}
async function nativeSwipe(page:import('@playwright/test').Page,dx:number,dy:number){
 const box=await page.getByTestId('swipe-surface').boundingBox();const x=box!.x+60,y=box!.y+130,session=await page.context().newCDPSession(page);
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let step=1;step<=5;step++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*step/5,y:y+dy*step/5}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
}

test('swipe Back uses the current guarded button, search identity and disabled transitions',async({page})=>{
 await harness(page);await swipe(page);await expect(page.locator('output')).toHaveText('0:0');await expect(page.getByTestId('attempts')).toHaveText('0');
 await page.getByRole('button',{name:'Open child',exact:true}).click();await swipe(page);await expect(page.locator('output')).toHaveText('1:0');await expect(page.getByTestId('attempts')).toHaveText('1');
 await page.getByRole('button',{name:'Toggle guard',exact:true}).click();page.once('dialog',dialog=>dialog.dismiss());await swipe(page);await expect(page.locator('output')).toHaveText('1:0');await expect(page.getByTestId('attempts')).toHaveText('2');
 page.once('dialog',dialog=>dialog.accept());await page.locator('header button').click();await expect(page.locator('output')).toHaveText('0:0');
 await page.getByRole('button',{name:'Toggle guard',exact:true}).click();await page.getByRole('button',{name:'Open child',exact:true}).click();
 await touch(page,'touchstart',70,160);await page.getByRole('button',{name:'Toggle busy',exact:true}).click();await touch(page,'touchend',220,160);await expect(page.locator('output')).toHaveText('2:0');
 await page.getByRole('button',{name:'Toggle busy',exact:true}).click();await touch(page,'touchstart',70,160);await page.getByRole('button',{name:'Open parent',exact:true}).click();await page.getByRole('button',{name:'Open child',exact:true}).click();await touch(page,'touchend',220,160);await expect(page.locator('output')).toHaveText('2:0');
 await touch(page,'touchstart',70,160);await page.getByRole('button',{name:'Toggle search',exact:true}).click();await touch(page,'touchend',220,160);await expect(page.locator('header button')).toHaveAccessibleName('Close search');await swipe(page);await expect(page.locator('header button')).toHaveAccessibleName('Back child');await expect(page.locator('output')).toHaveText('2:0');
 await page.getByRole('button',{name:'Toggle stale sibling',exact:true}).click();await swipe(page);await expect(page.locator('output')).toHaveText('1:0');
});

test('swipe ignores editing, scrolling, selection, modal, edge and cancelled gestures',async({page})=>{
 await harness(page);await page.getByRole('button',{name:'Open child',exact:true}).click();
 for(const selector of ['input','textarea','select','main button','main a','[contenteditable]','[data-testid="horizontal"]'])await swipe(page,selector);
 for(const [dx,dy]of [[-130,0],[60,0],[100,70],[0,100]])await swipe(page,undefined,dx,dy);
 await touch(page,'touchstart',5,160);await touch(page,'touchend',150,160);
 await touch(page,'touchstart',70,160);await touch(page,'touchmove',73,195);await touch(page,'touchend',230,195);
 await touch(page,'touchstart',70,160);await touch(page,'touchstart',80,160,undefined,true);await touch(page,'touchend',230,160);
 await touch(page,'touchstart',70,160);await touch(page,'touchcancel',100,160);await touch(page,'touchend',230,160);
 await page.clock.install();await touch(page,'touchstart',70,160);await page.clock.fastForward(701);await touch(page,'touchend',230,160);
 await page.getByTestId('selectable').evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range)});await swipe(page);await page.evaluate(()=>window.getSelection()?.removeAllRanges());
 await page.getByRole('button',{name:'Open dialog',exact:true}).click();await swipe(page);await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await expect(page.locator('output')).toHaveText('2:0');await expect(page.getByTestId('attempts')).toHaveText('0');
 await swipe(page);await expect(page.locator('output')).toHaveText('1:0');
});

test('touchscreen swipe goes Back once while vertical content still scrolls',async({page},info)=>{
 test.skip(!info.project.name.startsWith('mobile'),'Native touch coverage uses the mobile Chromium project');await harness(page);await page.getByRole('button',{name:'Open child',exact:true}).click();await nativeSwipe(page,140,0);await expect(page.locator('output')).toHaveText('1:0');await expect(page.getByTestId('attempts')).toHaveText('1');
 await page.getByRole('button',{name:'Open child',exact:true}).click();await nativeSwipe(page,0,-110);await expect.poll(()=>page.locator('main').evaluate(node=>node.scrollTop)).toBeGreaterThan(0);await expect(page.locator('output')).toHaveText('2:0');await expect(page.getByTestId('attempts')).toHaveText('1');
});
