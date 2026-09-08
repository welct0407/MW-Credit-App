import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../src/ledger.mjs';
const now = new Date('2026-09-07T10:00:00Z');
const config = {testMode:true,scheduledSendingEnabled:false,appId:'test-app',borrowerId:'test-lisa',borrowerName:'Lisa',recipient:'test-recipient',maxSnapshotAgeSeconds:300};
const facts = {source:'appsheet-live-ui',synced:true,appId:'test-app',borrowerId:'test-lisa',borrowerName:'Lisa',recipient:'test-recipient',observedAt:now.toISOString(),collectionDate:'2026-09-07',appToday:'2026-09-07',todayRemaining:300,overdueRemaining:0,totalRemaining:300,chargeIds:['test-charge']};
test('persistent reservation blocks retries even before or after confirmation', () => {
  const dir = mkdtempSync(join(tmpdir(),'collection-test-'));
  let a, b;
  try {
    a = new Ledger(join(dir,'ledger.db')); b = new Ledger(join(dir,'ledger.db'));
    const first = a.reserve(config,facts,now);
    assert.equal(first.status,'READY'); assert.match(first.message,/300/);
    assert.equal(b.reserve(config,facts,now).status,'BLOCKED_DUPLICATE');
    a.confirm(first.token,'Synthetic browser test evidence',now);
    assert.equal(b.reserve(config,facts,now).previousStatus,'SENT');
    assert.throws(()=>a.confirm(first.token,'repeat',now));
  } finally {a?.close();b?.close();rmSync(dir,{recursive:true});}
});
test('unknown send outcome fails closed and is not retried',()=>{
  const l = new Ledger(':memory:');
  try {const r=l.reserve(config,facts,now);l.unknown(r.token,'Browser disconnected');assert.equal(l.reserve(config,facts,now).previousStatus,'UNKNOWN');} finally{l.close();}
});
test('rejects wrong recipient, borrower, app, stale data and invalid reconciliation',()=>{
  const l=new Ledger(':memory:');
  try {for(const patch of [{recipient:'another-person'},{borrowerId:'real-borrower'},{appId:'wrong-app'},{observedAt:'2026-09-06T00:00:00Z'},{synced:false},{todayRemaining:301},{totalRemaining:-1},{chargeIds:[]},{appToday:'2026-09-08'}])assert.throws(()=>l.reserve(config,{...facts,...patch},now));assert.equal(l.list().length,0);}finally{l.close();}
});
test('paid borrower is skipped without creating a send reservation',()=>{
  const l=new Ledger(':memory:');try{assert.equal(l.reserve(config,{...facts,todayRemaining:0,totalRemaining:0},now).status,'SKIP_PAID');assert.equal(l.list().length,0);}finally{l.close();}
});
