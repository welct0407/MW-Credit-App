import test from 'node:test';import assert from 'node:assert/strict';
import {readDashboard,LAST_MONTH_REALIZED_PROFIT_SQL} from '../../services/business/dashboard.mjs';
import {readFileSync} from 'node:fs';
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

// R187: last month's Realized Profit (before write-offs) is read inline, gated on the V130 predicate and the V132 late
// columns, under a savepoint; it is omitted (never zero-filled, never failing the Dashboard) when gated off, failing or
// non-numeric. Net Profit and Principal Loss stay in the response.
function lastMonthClient({ready=true,value='1234.5',fail=false}={}){const c=client([{...row,principalLoss:'4500'}]);const base=c.query;c.query=async sql=>{
 if(sql.includes('is_principal_writeoff(text,text,numeric,numeric,text,numeric,numeric,bigint)')){c.queries.push(sql);return {rows:[{ready}]}}
 if(sql.includes('"lastMonthRealizedProfit"')){c.queries.push(sql);if(fail)throw Error('permission denied');return {rows:[{lastMonthRealizedProfit:value}]}}
 return base(sql)};return c}
test('R187 lastMonthRealizedProfit is the previous Bangkok month of the view\'s Realized Profit MTD',async()=>{
 const c=lastMonthClient(),value=await readDashboard(c);
 assert.equal(value.lastMonthRealizedProfit,'1234.5');assert.equal(value.netProfit,'-8');assert.equal(value.principalLoss,'4500');
 const sql=c.queries.find(text=>text.includes('"lastMonthRealizedProfit"'));
 assert.match(sql,/date_trunc\('month',d\)::date ms FROM \(SELECT public\.olap_reporting_date\(\) d\)/);
 assert.match(sql,/BETWEEN \(ctx\.ms-interval '1 month'\)::date AND ctx\.ms-1/);
 assert.match(sql,/sum\(r\."Interest Paid"::numeric\+r\."Late Charge Paid"::numeric\) FILTER\(WHERE NOT r\.loss_pair\)/);
 assert.doesNotMatch(sql,/wx\.\*/);
 assert.deepEqual(c.queries.filter(text=>/SAVEPOINT/.test(text)),['SAVEPOINT dashboard_last_month','RELEASE SAVEPOINT dashboard_last_month']);
});
test('R187 the last-month field is omitted when gated off, failing or non-numeric, and the Dashboard still answers',async()=>{
 const gated=lastMonthClient({ready:false}),off=await readDashboard(gated);assert.equal('lastMonthRealizedProfit' in off,false);assert.equal(gated.queries.some(text=>text.includes('"lastMonthRealizedProfit"')),false);
 const failing=lastMonthClient({fail:true}),failed=await readDashboard(failing);assert.equal('lastMonthRealizedProfit' in failed,false);assert.equal(failed.todayProfit,'4');
 assert.deepEqual(failing.queries.filter(text=>/SAVEPOINT/.test(text)),['SAVEPOINT dashboard_last_month','ROLLBACK TO SAVEPOINT dashboard_last_month','RELEASE SAVEPOINT dashboard_last_month']);
 for(const value of ['n/a','',null,'1e3'])assert.equal('lastMonthRealizedProfit' in await readDashboard(lastMonthClient({value})),false,String(value));
 assert.equal((await readDashboard(lastMonthClient({value:'-20'}))).lastMonthRealizedProfit,'-20');
});
test('R187 the real-SQL test runs the Dashboard read verbatim',()=>{
 const script=readFileSync(new URL('../../scripts/database/Test-LastMonthRealizedProfit.sql',import.meta.url),'utf8');
 assert.ok(script.includes(LAST_MONTH_REALIZED_PROFIT_SQL),'scripts/database/Test-LastMonthRealizedProfit.sql must hold LAST_MONTH_REALIZED_PROFIT_SQL unchanged');
});
