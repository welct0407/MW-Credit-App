import{test,expect,type Page}from'@playwright/test';
// R115 Daily cash withdrawal: header action, as-of reload, remaining and overdraw, one atomic command, return to Cash Position.
const html='<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/daily-cash-withdrawal-harness.tsx"></script>';
async function fixture(page:Page){
 const reads:string[]=[],posts:any[]=[];
 await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.route('**/api/**',async r=>{const u=new URL(r.request().url()),p=u.pathname;let body:any={items:[],nextCursor:null};
  if(r.request().method()==='POST'&&p==='/api/operations'){posts.push(JSON.parse(r.request().postData()??'null'));body={kind:'recorded',originalOutcome:{status:'applied',code:null,result:{operation:'cash-withdrawal.create',targetType:'cash-withdrawal',targetId:posts.at(-1).targetId},recordedAt:'2026-10-10T05:00:00.000Z'}}}
  else if(p.startsWith('/api/operations/'))body={kind:'unresolved'};
  else if(p==='/api/management/cash-withdrawal'){reads.push(u.search);const date=u.searchParams.get('date'),time=u.searchParams.get('time');
   // SCB as of 2026-10-09 10:00 is 950 (an entry at exactly 10:00 counts) and a later outflow caps it at 650; any other time reads 1000.
   const scbAt10=date==='2026-10-09'&&time==='10:00';
   body={date,time,holderId:'ch:dad',today:'2026-10-10',nowTime:'12:00',covered:true,future:false,accounts:[{id:'dad-cash',label:'SYNTHETIC Dad เงินสด',initialized:true,availableAsOf:'0',maxWithdrawable:'0'},{id:'dad-scb',label:'SYNTHETIC Dad SCB',initialized:true,availableAsOf:scbAt10?'950.00':'1000.00',maxWithdrawable:scbAt10?'650.00':'1000.00'},{id:'dad-ttb',label:'SYNTHETIC Dad TTB',initialized:true,availableAsOf:'500.00',maxWithdrawable:'500.00'}]}}
  return r.fulfill({contentType:'application/json',body:JSON.stringify(body)})});
 return {reads,posts};
}
test('Daily cash withdrawal reloads as-of balances, blocks an overdraw and confirms one request for both lines',async({page})=>{
 // The page reads the device clock: 2026-10-10 12:07 Bangkok, the harness business date.
 const {reads,posts}=await fixture(page);await page.clock.setFixedTime(new Date('2026-10-10T05:07:00Z'));await page.goto('/');await page.waitForFunction(()=>(window as any).__dcwReady===true);
 const action=page.getByRole('button',{name:'Daily cash withdrawal',exact:true});
 await expect(action.locator('.record-action-icon svg')).toHaveAttribute('data-icon','cash');
 await expect(page.locator('.root-record-heading .record-action').last()).toHaveAccessibleName('Daily cash withdrawal');
 await action.click();
 // DCW-4/R123: Bangkok today and the current time rounded down to 10 minutes by default; hour 00-23 and minute 00..50 selects.
 const dateBox=page.getByLabel('Date',{exact:true}),hourBox=page.getByLabel('Hour',{exact:true}),minuteBox=page.getByLabel('Minute',{exact:true});
 await expect(dateBox).toHaveValue('2026-10-10');await expect(hourBox).toHaveValue('12');await expect(minuteBox).toHaveValue('00');await expect(dateBox).toHaveAttribute('max','2026-10-10');
 await expect(minuteBox.locator('option')).toHaveText(['00','10','20','30','40','50']);
 await expect(hourBox.locator('option')).toHaveCount(24);
 // R123: shown again past midnight, untouched defaults follow the clock and today stays selectable; after an edit they stay put.
 const shown=async(at:string)=>{await page.clock.setFixedTime(new Date(at));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')))};
 await shown('2026-10-10T17:01:00Z');await expect(dateBox).toHaveValue('2026-10-11');await expect(hourBox).toHaveValue('00');await expect(minuteBox).toHaveValue('00');await expect(dateBox).toHaveAttribute('max','2026-10-11');
 await dateBox.fill('2026-10-09');await hourBox.selectOption('10');await minuteBox.selectOption('00');
 await shown('2026-10-10T17:31:00Z');await expect(dateBox).toHaveValue('2026-10-09');await expect(hourBox).toHaveValue('10');await expect(minuteBox).toHaveValue('00');
 await expect(page.locator('.dcw-asof')).toHaveText('As of 09-Oct 10:00');
 await expect.poll(()=>reads.at(-1)).toBe('?date=2026-10-09&time=10%3A00');
 // DCW-1/destination: Dad's cash account is the destination; the other Dad accounts are the lines.
 await expect(page.getByRole('combobox',{name:/^To account/})).toHaveValue('dad-cash');
 const rows=page.locator('.dcw-line');await expect(rows).toHaveCount(2);
 const scb=rows.filter({hasText:'SYNTHETIC Dad SCB'}),ttb=rows.filter({hasText:'SYNTHETIC Dad TTB'});
 await expect(scb.locator('td').first()).toContainText('฿950');await expect(scb.locator('.dcw-max')).toHaveText('Max ฿650 — keeps later balances from going negative');await expect(ttb.locator('.dcw-max')).toHaveCount(0);
 // DCW-12/13: ฿, the amount box and Withdraw all on one line; hour and minute selects are at least 44px wide.
 {const [sign,box,all]=await Promise.all([scb.locator('.dcw-amount>span').boundingBox(),scb.getByRole('textbox').boundingBox(),scb.getByRole('button',{name:'Withdraw all',exact:true}).boundingBox()]);expect(Math.abs(sign!.y+sign!.height/2-(box!.y+box!.height/2))).toBeLessThan(12);expect(Math.abs(all!.y+all!.height/2-(box!.y+box!.height/2))).toBeLessThan(12);for(const name of ['Hour','Minute'])expect((await page.getByLabel(name,{exact:true}).boundingBox())!.width).toBeGreaterThanOrEqual(44)}
 // DCW-14: Date and Time titles share one style and neither has a required marker.
 expect(await page.locator('.dcw-when .field-title').evaluateAll(nodes=>nodes.map(n=>{const c=getComputedStyle(n),a=getComputedStyle(n,'::after');return [c.fontWeight,c.fontSize,c.color,a.content].join('|')}))).toEqual(await page.locator('.dcw-when .field-title').first().evaluate(n=>{const c=getComputedStyle(n),a=getComputedStyle(n,'::after');const v=[c.fontWeight,c.fontSize,c.color,a.content].join('|');return [v,v]}));await expect(page.locator('.dcw-when .field-title').first()).toHaveCSS('font-weight','400');
 const confirm=page.getByRole('button',{name:'Confirm withdrawal',exact:true});await expect(confirm).toBeDisabled();
 // DCW-7: an overdraw shows a red negative remaining and blocks confirm.
 await scb.getByRole('textbox').fill('651');await expect(scb.locator('td').last()).toContainText('-฿1');await expect(scb.getByText('Exceeds available balance')).toBeVisible();await expect(confirm).toBeDisabled();
 // DCW-6/8: Withdraw all, an empty line is skipped and the summary counts transfers.
 await scb.getByRole('button',{name:'Withdraw all',exact:true}).click();await expect(scb.getByRole('textbox')).toHaveValue('650');await expect(scb.locator('td').last()).toContainText('฿0');
 await expect(page.locator('.dcw-total')).toHaveText('1 transfer · Total ฿650');
 await ttb.getByRole('textbox').fill('200');await expect(ttb.locator('td').last()).toContainText('฿300');await expect(page.locator('.dcw-total')).toHaveText('2 transfers · Total ฿850');
 // DCW-2: no horizontal page scroll on this viewport.
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(confirm).toBeEnabled();await confirm.click();
 // DCW-9: the summary names each transfer with its remaining balance and the total.
 const summary=page.locator('.dcw-summary');await expect(summary).toContainText('09-Oct 10:00');
 await expect(summary).toContainText('SYNTHETIC Dad SCB → SYNTHETIC Dad เงินสด');await expect(summary).toContainText('฿650 (remaining ฿0)');await expect(summary).toContainText('฿200 (remaining ฿300)');await expect(summary).toContainText('฿850');
 await page.getByRole('button',{name:'Confirm',exact:true}).click();
 // DCW-10: one request with both lines, then back on Cash Position, refreshed.
 await expect(page.getByRole('heading',{name:'Cash Position',exact:true})).toBeVisible();await expect(page.locator('#refreshes')).toHaveText('1');
 expect(posts).toHaveLength(1);
 expect(posts[0]).toMatchObject({operation:'cash-withdrawal.create',expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{movementDate:'2026-10-09',movementTime:'10:00',toAccountId:'dad-cash',lines:[{fromAccountId:'dad-scb',amount:'650'},{fromAccountId:'dad-ttb',amount:'200'}]}});
 expect(posts[0].targetId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
test('R123 a withdrawal under review keeps its reviewed date and time when the page is shown again past midnight',async({page})=>{
 const {posts}=await fixture(page);await page.clock.setFixedTime(new Date('2026-10-10T16:55:00Z'));await page.goto('/');await page.waitForFunction(()=>(window as any).__dcwReady===true);
 await page.getByRole('button',{name:'Daily cash withdrawal',exact:true}).click();
 await expect(page.locator('.dcw-asof')).toHaveText('As of 10-Oct 23:50');
 await page.locator('.dcw-line').filter({hasText:'SYNTHETIC Dad TTB'}).getByRole('textbox').fill('100');await page.getByRole('button',{name:'Confirm withdrawal',exact:true}).click();
 const summary=page.locator('.dcw-summary');await expect(summary).toContainText('10-Oct 23:50');
 await page.clock.setFixedTime(new Date('2026-10-10T17:01:00Z'));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect(summary).toContainText('10-Oct 23:50');await expect(summary).not.toContainText('11-Oct');
 await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('heading',{name:'Cash Position',exact:true})).toBeVisible();
 expect(posts).toHaveLength(1);expect(posts[0].inputs).toMatchObject({movementDate:'2026-10-10',movementTime:'23:50',lines:[{fromAccountId:'dad-ttb',amount:'100'}]});
});
test('Daily cash withdrawal is unavailable offline and reads nothing',async({page})=>{
 const {reads,posts}=await fixture(page);await page.addInitScript(()=>{(window as any).__dcwOffline=true});await page.goto('/');await page.waitForFunction(()=>(window as any).__dcwReady===true);
 await page.getByRole('button',{name:'Daily cash withdrawal',exact:true}).click();
 await expect(page.getByText('Daily cash withdrawal is unavailable offline.')).toBeVisible();await expect(page.getByRole('button',{name:'Confirm withdrawal',exact:true})).toHaveCount(0);
 expect(reads).toEqual([]);expect(posts).toEqual([]);
});
