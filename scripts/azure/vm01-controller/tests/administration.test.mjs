import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileOperation, updateAdmission } from '../dist/src/administration.js';
import { browser, fixture } from './helpers.mjs';
test('administration requires matching generation, disabled admission, exact operation and worker fencing', async () => {
  const f = fixture(); const request = f.request(); await f.controller.action(browser, 'restart', request);
  const base = { generation: f.port.data.generation, workersFenced: true, requestId: request.requestId, result: 'succeeded', evidence: 'approved-evidence' };
  await assert.rejects(f.ledger.transaction(s => reconcileOperation(s, f.config, f.arm, base, f.now())), e => e.code === 'worker_fencing_required');
  await f.ledger.transaction(async s => { updateAdmission(s, base.generation, false); await s.save(); }); base.generation = f.port.data.generation;
  for (const extra of [{ generation: 1 }, { workersFenced: false }, { requestId: 'different' }, { evidence: 'credential=value' }]) await assert.rejects(f.ledger.transaction(s => reconcileOperation(s, f.config, f.arm, { ...base, ...extra }, f.now())));
  assert.notEqual(f.port.data.activeRequestId, null); assert.equal(f.port.data.admissionEnabled, false);
  f.observation.powerState = 'deallocated'; await assert.rejects(f.ledger.transaction(s => reconcileOperation(s, f.config, f.arm, base, f.now())), e => e.code === 'desired_state_not_observed');
  f.observation.powerState = 'running'; await f.ledger.transaction(async s => { await reconcileOperation(s, f.config, f.arm, base, f.now()); await s.save(); });
  assert.equal(f.port.data.activeRequestId, null); assert.equal(f.port.data.admissionEnabled, false); assert.equal(f.port.data.records[request.requestId].phase, 'completed'); assert.equal(f.arm.calls.length, 1);
});
test('unresolved operation blocks admission and stale generation cannot enable it', async () => {
  const f = fixture(); await f.controller.action(browser, 'restart', f.request());
  await assert.rejects(f.ledger.transaction(async s => { updateAdmission(s, 1, true); await s.save(); }), e => e.code === 'stale_generation');
  await assert.rejects(f.ledger.transaction(async s => { updateAdmission(s, s.data.generation, true); await s.save(); }), e => e.code === 'operation_in_progress');
});
