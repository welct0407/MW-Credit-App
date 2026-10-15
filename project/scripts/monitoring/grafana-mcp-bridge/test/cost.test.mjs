import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {estimate} from '../tools/estimate-cost.mjs';
const workload=JSON.parse(readFileSync(new URL('../tools/cost-assumptions.json',import.meta.url),'utf8'));
test('cost model bills one scheduler job, named database usage and TTL deletes under both allowance scenarios',()=>{
  const free=estimate(workload,true),paid=estimate(workload,false);
  assert.equal(free.quantities.ticks,43200);assert.equal(free.itemizedUsd.scheduler,0);assert.equal(paid.itemizedUsd.scheduler,0.1);
  assert.ok(free.itemizedUsd.firestore_reads>0);assert.ok(free.itemizedUsd.firestore_ttl_deletes>0);assert.ok(paid.totalUsd>free.totalUsd);
  assert.equal(estimate({...workload,namedDatabase:false},true).itemizedUsd.firestore_reads,0);
  assert.throws(()=>estimate({...workload,coldStarts:-1},true));
});
