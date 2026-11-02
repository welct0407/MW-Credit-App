import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
import {readManagementFinancial} from '../../services/business/management-financial.mjs';
// R116: Cash Ledger Recent is newest first by Movement Date, Created At, Row ID; its borrower counterparty is named.
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/ledger-counterparty.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {borrowerNameFor,ledgerEndpoints}=await import('data:text/javascript,'+encodeURIComponent(source));
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function fakeClient(rows){const calls=[];return {calls,query:async(text,values)=>{calls.push({text,values});return {rows}}}}
// Same date, three times, and a tie at 10:00 broken by Row ID (descending, C collation), as the SQL orders them.
const rows=[{id:'m-3',date:'2026-11-02',createdAt:'2026-11-02 23:40:00'},{id:'wd115:x:2',date:'2026-11-02',createdAt:'2026-11-02 10:00:00'},{id:'b-1',date:'2026-11-02',createdAt:'2026-11-02 10:00:00'},{id:'z-0',date:'2026-11-02',createdAt:'2026-11-02 09:00:00'}];

test('R116 ledger list orders by Movement Date, Created At, Row ID (newest first) and pages with a v2 cursor',async()=>{
 const client=fakeClient(rows.slice(0,3)),page=await readManagementFinancial(client,'cash-movements',{limit:2});
 const sql=client.calls[0].text;
 assert.match(sql,/ORDER BY coalesce\(s\."Movement Date",DATE '0001-01-01'\) DESC,s\."Created At" DESC,s\."Row ID" COLLATE "C" DESC LIMIT \$4/);
 assert.match(sql,/\(coalesce\(s\."Movement Date",DATE '0001-01-01'\),s\."Created At",s\."Row ID" COLLATE "C"\)<\(\$2::date,\$5::timestamp,\$3::text COLLATE "C"\)/);
 assert.deepEqual(client.calls[0].values,[null,null,null,3,null]);
 assert.deepEqual(page.items.map(r=>r.id),['m-3','wd115:x:2']);
 // The cursor carries the last row's time, so the tie at 10:00 continues with b-1 on the next page.
 assert.deepEqual(JSON.parse(Buffer.from(page.nextCursor,'base64url')),{v:2,kind:'cash-movements',partnerId:null,date:'2026-11-02',createdAt:'2026-11-02 10:00:00',id:'wd115:x:2'});
 const next=fakeClient(rows.slice(2));await readManagementFinancial(next,'cash-movements',{limit:2,cursor:page.nextCursor});
 assert.deepEqual(next.calls[0].values,[null,'2026-11-02','wd115:x:2',3,'2026-11-02 10:00:00']);
});

test('R116 a ledger cursor from before R116 (v1, no time) is rejected as invalid_request, never reinterpreted; other lists keep v1',async()=>{
 const v1=encode({v:1,kind:'cash-movements',partnerId:null,date:'2026-11-02',id:'b-1'});
 await assert.rejects(readManagementFinancial(fakeClient([]),'cash-movements',{limit:2,cursor:v1}),/invalid_request/);
 for(const bad of [{v:2,kind:'cash-movements',partnerId:null,date:'2026-11-02',createdAt:'23:40',id:'b-1'},{v:2,kind:'cash-movements',partnerId:null,date:'2026-11-02',id:'b-1',createdAt:'2026-11-02 10:00:00'}])
  await assert.rejects(readManagementFinancial(fakeClient([]),'cash-movements',{limit:2,cursor:encode(bad)}),/invalid_request/);
 const contributions=fakeClient([]);await readManagementFinancial(contributions,'contributions',{limit:2,cursor:encode({v:1,kind:'contributions',partnerId:null,date:'2026-11-02',id:'c-1'})});
 assert.match(contributions.calls[0].text,/ORDER BY coalesce\(s\."Contribution Date",DATE '0001-01-01'\) DESC,s\."Row ID" COLLATE "C" DESC/);
});

test('R116 the ledger read joins the borrower through the payment, the loan or the rebate expense',async()=>{
 const client=fakeClient([]);await readManagementFinancial(client,'cash-movements',{limit:1});const sql=client.calls[0].text;
 assert.match(sql,/LEFT JOIN public\."Borrowers" bw ON bw\."Row ID"=coalesce\(bp\."Ref Borrower",bl\."Ref Borrowers",be\."Ref Payee Borrower"\)/);
 assert.match(sql,/bw\."Borrower Name" AS "borrowerName",bw\."Description" AS "borrowerDescription"/);
});

test('R116 a borrower counterparty shows in the viewer language with fallback; accounts and "—" otherwise',()=>{
 const payment={borrowerId:'B-1',borrowerName:'ผู้กู้จำลอง',borrowerDescription:'Synthetic Borrower',fromAccountId:null,fromAccountLabel:null,toAccountId:'acc-ttb',toAccountLabel:'Dad TTB'};
 assert.deepEqual(ledgerEndpoints(payment,false),{from:'Synthetic Borrower',to:'Dad TTB'});
 assert.deepEqual(ledgerEndpoints(payment,true),{from:'ผู้กู้จำลอง',to:'Dad TTB'});
 const disbursement={...payment,fromAccountId:'acc-scb',fromAccountLabel:'Dad SCB',toAccountId:null,toAccountLabel:null};
 assert.deepEqual(ledgerEndpoints(disbursement,false),{from:'Dad SCB',to:'Synthetic Borrower'});
 assert.equal(borrowerNameFor({borrowerName:'ผู้กู้จำลอง',borrowerDescription:'  '},false),'ผู้กู้จำลอง');
 assert.equal(borrowerNameFor({borrowerName:null,borrowerDescription:'Synthetic Borrower'},true),'Synthetic Borrower');
 assert.deepEqual(ledgerEndpoints({...payment,borrowerName:null,borrowerDescription:null},true),{from:'—',to:'Dad TTB'});
 assert.deepEqual(ledgerEndpoints({...payment,borrowerId:null},false),{from:'—',to:'Dad TTB'});
 // A transfer between accounts never shows a borrower, and a missing account label stays "—" (not the borrower).
 assert.deepEqual(ledgerEndpoints({borrowerId:'B-1',borrowerName:'x',fromAccountId:'a',fromAccountLabel:'A',toAccountId:'b',toAccountLabel:null},false),{from:'A',to:'—'});
});
