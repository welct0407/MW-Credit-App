import test from 'node:test';import assert from 'node:assert/strict';
import {readDashboard} from '../../services/business/dashboard.mjs';
// R109: the Dashboard read carries "Total Principal Loss" (olap_portfolio_summary, V120) as principalLoss, a numeric
// string beside the profit figures. A database before V120 has no such column: the field is omitted (the PWA hides the
// row), never fabricated as zero; a present non-numeric value is refused like any other metric.
const row={pendingPaymentAmount:'27',todayProfit:'4',yesterdayProfit:'3',netProfit:'-8',notPaid:'1',partiallyPaid:'0',overdue:'2',longOverdue:'1',fullyPaid:'0',
 expectedDailyInterest:'180',realizedProfitMtd:'4',forecastRemainingInterest:'900',projectedMonthlyProfit:'904',totalCashPool:'500000',activeLoanProfit:'-4000',profitCoverageRatio:'0',principalLoss:'4500'};
function client(summary){const queries=[];return {queries,async query(sql){queries.push(sql);
 if(sql.includes('olap_portfolio_summary'))return {rows:summary};
 if(sql.includes('"Operating Income MTD"'))return {rows:[{operatingIncomeMtd:'4'}]};
 if(sql.includes('"Ref Cash Account"'))return {rows:[]};
 if(sql.includes('"asOf"'))return {rows:[{asOf:'2026-11-01T05:00:00.000Z',businessDate:'2026-11-01'}]};
 return {rows:[{day:'2026-11-01'}]};}};}
test('principalLoss is read from Total Principal Loss and returned beside Net Profit',async()=>{
 const c=client([row]);const value=await readDashboard(c);
 assert.equal(value.principalLoss,'4500');assert.equal(value.netProfit,'-8');
 assert.match(c.queries.find(sql=>sql.includes('olap_portfolio_summary')),/to_jsonb\(s\)->>'Total Principal Loss' AS "principalLoss"/);
 assert.deepEqual(Object.keys(value.collection).sort(),['fullyPaid','longOverdue','notPaid','overdue','partiallyPaid'],'principalLoss is not a collection count');
 assert.equal((await readDashboard(client([{...row,principalLoss:'0'}]))).principalLoss,'0','zero is carried; the PWA hides the row');
});
test('a provider without the column omits the figure; a non-numeric value or a missing required metric is unavailable',async()=>{
 const before=await readDashboard(client([{...row,principalLoss:null}]));assert.equal('principalLoss' in before,false);assert.equal(before.netProfit,'-8');
 await assert.rejects(readDashboard(client([{...row,principalLoss:'n/a'}])),/Dashboard provider unavailable/);
 const {netProfit,...missing}=row;assert.ok(netProfit);
 await assert.rejects(readDashboard(client([missing])),/Dashboard provider unavailable/);
});
