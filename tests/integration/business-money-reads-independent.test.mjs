import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {connect,principal,command} from './phase6-populated-fixture.mjs';
import {readCashOverview,readCashStatement} from '../../services/business/cash.mjs';
import {readManagementFinancial} from '../../services/business/management-financial.mjs';
import {readManagementPosition} from '../../services/business/management-position.mjs';
// APP-TEST-03: the money read adapters against the populated synthetic V85 database (restricted role).
let admin,app,store,fixture;
before(async()=>{({admin,app,store}=await connect(85));fixture=JSON.parse(readFileSync(process.env.PHASE6_POPULATED_SNAPSHOT,'utf8')).fixture;});
after(async()=>{await app?.end();await admin?.end();});
const cents=value=>value===null||value===undefined?null:Math.round(Number(value)*100);
async function readOnly(action){const c=await app.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');return await action(c);}finally{await c.query('ROLLBACK');c.release();}}
test('cash overview: one row per cash account, balances reconcile and business date is Bangkok today',async()=>{
 const today=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
 const accountCount=Number((await admin.query('SELECT count(*) n FROM public."Cash Accounts"')).rows[0].n);
 const overview=await readOnly(readCashOverview);
 assert.equal(overview.businessDate,today);assert.equal(overview.accounts.length,accountCount);assert.equal(new Set(overview.accounts.map(a=>a.id)).size,accountCount);
 for(const a of overview.accounts)if(a.initialized&&a.currentBalance!==null)assert.equal(cents(a.currentBalance),cents(a.openingBalance)+cents(a.cashIn)-cents(a.cashOut),a.id);
 for(const key of Object.keys(overview.dashboard))assert.ok(overview.dashboard[key]===null||typeof overview.dashboard[key]==='string',key);
});
test('cash statement: summary reconciles, rows are text-timestamped and cursor pages do not overlap',async()=>{
 const day=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
 // Synthetic same-day movements on one account: two contributions.
 const account=(await admin.query('SELECT "Row ID" id FROM public."Cash Accounts" WHERE "Active" IS TRUE ORDER BY "Row ID" LIMIT 1')).rows[0];
 for(const amount of ['11.00','22.00']){const r=await store.operation(principal,command('capital-contribution.create',{partnerId:fixture.actorId,contributionDate:day,transactionType:'Contribution',amount,notes:'APP-TEST-03 synthetic'}));assert.equal(r.originalOutcome?.status,'applied',JSON.stringify(r));}
 const accountId=(await admin.query('SELECT "Ref Cash Account" id FROM public."Cash Account Daily Summary Recent" WHERE "Statement Date"=$1::date AND "Transaction Count">0 ORDER BY "Ref Cash Account" LIMIT 1',[day])).rows[0]?.id??account.id;
 const pages=[];let cursor=null;do{const page=await readOnly(c=>readCashStatement(c,{accountId,date:day,limit:1,cursor}));pages.push(page);cursor=page.nextCursor;assert.ok(pages.length<200);}while(cursor);
 const summary=pages[0].summary,items=pages.flatMap(p=>p.items);
 if(summary.initialized)assert.equal(cents(summary.closingBalance),cents(summary.openingBalance)+cents(summary.netMovement));else assert.equal(summary.closingBalance,null,'uninitialized accounts have no closing balance');
 assert.equal(cents(summary.netMovement),cents(summary.moneyIn)-cents(summary.moneyOut));
 assert.ok(items.length>0,'seeded movements are listed');assert.equal(items.length,Number(summary.transactionCount));assert.equal(new Set(items.map(i=>i.id+'|'+i.direction)).size,items.length);
 for(const item of items){assert.equal(typeof item.timestamp,'string');assert.match(item.timestamp,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);assert.equal(item.date,day);}
 const whole=await readOnly(c=>readCashStatement(c,{accountId,date:day,limit:100}));assert.deepEqual(whole.items.map(i=>i.id),items.map(i=>i.id),'cursor pages equal one ordered read');
 await assert.rejects(readOnly(c=>readCashStatement(c,{accountId,date:day,cursor:'not-a-cursor'})),/invalid_request/);
});
test('contributions paginate with a stable cursor that equals one complete read',async()=>{
 const pages=[];let cursor=null;do{const page=await readOnly(c=>readManagementFinancial(c,'contributions',{limit:2,cursor}));assert.ok(page.items.length<=2);pages.push(page);cursor=page.nextCursor;assert.ok(pages.length<500);}while(cursor);
 const paged=pages.flatMap(p=>p.items.map(i=>i.id)),whole=(await readOnly(c=>readManagementFinancial(c,'contributions',{limit:100}))).items.map(i=>i.id);
 assert.ok(paged.length>=2);assert.equal(new Set(paged).size,paged.length);
 if(whole.length<100)assert.deepEqual(paged,whole);
 await assert.rejects(readOnly(c=>readManagementFinancial(c,'contributions',{limit:101})),/invalid_request/);
});
test('management position composes the cash overview with per-holder balances',async()=>{
 const position=await readOnly(readManagementPosition),overview=await readOnly(readCashOverview);
 assert.deepEqual(position.accounts,overview.accounts);assert.equal(position.businessDate,overview.businessDate);
 const holders=Number((await admin.query('SELECT count(*) n FROM public."Cash Holders"')).rows[0].n);assert.equal(position.holders.length,holders);
 const ids=new Set(position.holders.map(h=>h.id));assert.equal(ids.size,position.holders.length);for(const a of position.accounts)assert.ok(ids.has(a.holderId),a.id);
 for(const h of position.holders){const own=position.accounts.filter(a=>a.holderId===h.id);assert.equal(cents(h.cashIn),own.reduce((sum,a)=>sum+cents(a.cashIn),0),h.id+' cash in');assert.equal(cents(h.cashOut),own.reduce((sum,a)=>sum+cents(a.cashOut),0),h.id+' cash out');}
});
