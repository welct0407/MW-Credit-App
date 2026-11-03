import test from 'node:test';import assert from 'node:assert/strict';
import {readCashOverview} from '../../services/business/cash.mjs';
import {readDashboard} from '../../services/business/dashboard.mjs';
import {readAnalyticsOverview} from '../../services/business/management-analytics.mjs';
// R116: "Principal Write-offs MTD" (V128) on "Cash Dashboard" (the Income MTD of the Dashboard and Cash pages) and on
// olap_portfolio_summary (Management Analytics) is read by name. Present, it is carried as principalWriteOffsMtd, a numeric
// string (0 included, the PWA shows ฿0); a database before V128 has no such column, so the field is omitted (the PWA hides
// the row), never fabricated as zero; a present column with a null value is carried as null (the PWA shows Unavailable; the
// presence flag tells the two apart, since ->> is NULL for both); a present non-numeric value is refused like any other figure. Management Analytics
// also carries the lifetime ledger write-offs ("Principal Write-offs", V129) as principalWriteOffs, under the same rules; it
// never falls back to "Total Principal Loss" (the Loans column, which also counts legacy losses with no df10: pair).
const income={operatingIncomeMtd:'30',expensesMtd:'-5',netProfitMtd:'-15',tommyWithdrawnMtd:'0',lisaWithdrawnMtd:'0',unsettledProfitMtd:'-15',cashPoolRemaining:'1000',businessCashHeld:null};
const summary={pendingPaymentAmount:'27',todayProfit:'30',yesterdayProfit:'3',netProfit:'-15',notPaid:'1',partiallyPaid:'0',overdue:'2',longOverdue:'1',fullyPaid:'0',
 expectedDailyInterest:'180',realizedProfitMtd:'30',forecastRemainingInterest:'900',projectedMonthlyProfit:'930',totalCashPool:'500000',activeLoanProfit:'-4000',profitCoverageRatio:'0',principalLoss:'40'};
const analytics={totalProfit:'30',totalBusinessExpenses:'5',netProfit:'-15',expectedDailyInterest:'180',realizedProfitMtd:'30',expensesMtd:'5',netProfitMtd:'-15',forecastRemainingInterest:'900',projectedMonthlyProfit:'930',
 forecastAverageDailyOutstandingPrincipal:'100',forecastMonthlyReturnOnAdo:'9.3',peakCashPool30d:'500000',peakCashPoolDate30d:'2026-11-01',outstandingPrincipal:'60',activeLoans:'1'};
// The presence flags the providers project ("<key>Present", to_jsonb(row) ? column) follow the mocked row's keys.
const flagged=(row,keys)=>({...row,...Object.fromEntries(keys.map(key=>[key+'Present',Object.hasOwn(row,key)]))});
function client({cash=income,portfolio=summary,overview=analytics}={}){const queries=[];return {queries,async query(sql){queries.push(sql);
 if(sql.includes('FROM public."Cash Dashboard"'))return {rows:[flagged(cash,['principalWriteOffsMtd'])]};
 if(sql.includes('"Ref Cash Account"'))return {rows:[]};
 if(sql.startsWith('SELECT DISTINCT "Pending Payment Amount"'))return {rows:[{...portfolio}]};
 if(sql.startsWith('SELECT DISTINCT "Total Profit"'))return {rows:[flagged(overview,['principalWriteOffsMtd','principalWriteOffs'])]};
 if(sql.includes('FROM public."Statistics"'))return {rows:[{id:'ST',version:'v'}]};
 if(sql.includes('"asOf"'))return {rows:[{asOf:'2026-11-02T05:00:00.000Z',businessDate:'2026-11-02'}]};
 return {rows:[{day:'2026-11-02'}]};}};}

test('present: the Cash Dashboard write-offs reach the cash overview and the Dashboard Income MTD',async()=>{
 const c=client({cash:{...income,principalWriteOffsMtd:'40.00'}});
 const overview=await readCashOverview(c);
 assert.equal(overview.dashboard.principalWriteOffsMtd,'40.00');assert.equal(overview.dashboard.netProfitMtd,'-15');
 assert.match(c.queries.find(sql=>sql.includes('"Cash Dashboard"')),/to_jsonb\(d\)->>'Principal Write-offs MTD' AS "principalWriteOffsMtd",to_jsonb\(d\) \? 'Principal Write-offs MTD' AS "principalWriteOffsMtdPresent" FROM public\."Cash Dashboard" d/);
 assert.ok(c.queries.find(sql=>sql.includes('"Cash Dashboard"')).startsWith('SELECT "Operating Income MTD"'),'the overview query keeps its leading column');
 const dashboard=await readDashboard(client({cash:{...income,principalWriteOffsMtd:'0'}}));
 assert.equal(dashboard.incomeMtd.principalWriteOffsMtd,'0','zero is carried; the PWA shows ฿0');assert.equal(dashboard.incomeMtd.operatingIncomeMtd,'30');
 assert.equal(dashboard.principalLoss,'40');assert.equal('principalWriteOffsMtd' in dashboard,false,'the write-offs belong to Income MTD only');
});
test('present: the month and lifetime write-offs reach the Management Analytics overview',async()=>{
 const c=client({overview:{...analytics,principalWriteOffsMtd:'40',principalWriteOffs:'40'}});
 const value=await readAnalyticsOverview(c);
 assert.equal(value.metrics.principalWriteOffsMtd,'40');assert.equal(value.metrics.principalWriteOffs,'40');assert.equal(value.metrics.realizedProfitMtd,'30');assert.deepEqual(value.refreshTarget,{id:'ST',version:'v'});
 assert.match(c.queries.find(sql=>sql.includes('olap_portfolio_summary')),/to_jsonb\(s\)->>'Principal Write-offs MTD' AS "principalWriteOffsMtd",to_jsonb\(s\) \? 'Principal Write-offs MTD' AS "principalWriteOffsMtdPresent",to_jsonb\(s\)->>'Principal Write-offs' AS "principalWriteOffs",to_jsonb\(s\) \? 'Principal Write-offs' AS "principalWriteOffsPresent" FROM public\.olap_portfolio_summary s LIMIT 2/);
 const zero=(await readAnalyticsOverview(client({overview:{...analytics,principalWriteOffsMtd:'0',principalWriteOffs:'0'}}))).metrics;
 assert.deepEqual([zero.principalWriteOffsMtd,zero.principalWriteOffs],['0','0'],'zero is carried; the PWA shows ฿0');
 const v128=(await readAnalyticsOverview(client({overview:{...analytics,principalWriteOffsMtd:'40'}}))).metrics;
 assert.equal('principalWriteOffs' in v128,false,'a V128 database (before V129) omits the lifetime row');assert.equal(v128.principalWriteOffsMtd,'40');
 assert.doesNotMatch(c.queries.find(sql=>sql.includes('olap_portfolio_summary')),/Total Principal Loss/,'no fallback to the Loans column');
});
test('omitted before V128: an absent column omits the field, never zero, and the other figures are unchanged',async()=>{
 const overview=await readCashOverview(client({cash:{...income}}));
 assert.equal('principalWriteOffsMtd' in overview.dashboard,false);assert.deepEqual(overview.dashboard,income,'no presence flag leaks');
 const dashboard=await readDashboard(client({cash:{...income}}));assert.equal('principalWriteOffsMtd' in dashboard.incomeMtd,false);
 const metrics=(await readAnalyticsOverview(client({overview:{...analytics}}))).metrics;
 assert.equal('principalWriteOffsMtd' in metrics,false);assert.equal('principalWriteOffs' in metrics,false);assert.deepEqual(metrics,analytics);
});
test('explicit null: a present column with a null value is carried as null (Unavailable), not hidden or zeroed',async()=>{
 const overview=await readCashOverview(client({cash:{...income,principalWriteOffsMtd:null}}));
 assert.equal(overview.dashboard.principalWriteOffsMtd,null);assert.deepEqual(overview.dashboard,{...income,principalWriteOffsMtd:null});
 assert.equal((await readDashboard(client({cash:{...income,principalWriteOffsMtd:null}}))).incomeMtd.principalWriteOffsMtd,null);
 const metrics=(await readAnalyticsOverview(client({overview:{...analytics,principalWriteOffsMtd:null,principalWriteOffs:null}}))).metrics;
 assert.deepEqual([metrics.principalWriteOffsMtd,metrics.principalWriteOffs],[null,null]);assert.deepEqual(metrics,{...analytics,principalWriteOffsMtd:null,principalWriteOffs:null});
});
test('non-numeric: a present write-off value that is not a number makes the provider unavailable',async()=>{
 for(const bad of ['n/a','','1e3',40]){
  await assert.rejects(readCashOverview(client({cash:{...income,principalWriteOffsMtd:bad}})),/Cash provider unavailable/);
  await assert.rejects(readDashboard(client({cash:{...income,principalWriteOffsMtd:bad}})),/Cash provider unavailable/);
  await assert.rejects(readAnalyticsOverview(client({overview:{...analytics,principalWriteOffsMtd:bad}})),/Analytics provider unavailable/);
  await assert.rejects(readAnalyticsOverview(client({overview:{...analytics,principalWriteOffs:bad}})),/Analytics provider unavailable/);
 }
});
