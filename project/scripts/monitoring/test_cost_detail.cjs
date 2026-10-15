const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const jq = process.argv[2] || 'jq';
const root = path.resolve(__dirname, '../..');
const dashboard = JSON.parse(fs.readFileSync(path.join(root, 'outputs/resource-monitoring-20260922/cost-dashboard.json')));
const panels = new Map(dashboard.panels.map(p => [p.id, p]));
function run(selector, data) {
  const p = spawnSync(jq, ['-c', '-f', path.join(__dirname, selector)], {
    input: JSON.stringify(data), encoding: 'utf8'
  });
  assert.equal(p.status, 0, p.stderr);
  return p.stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
}
function sortField(id) {
  return panels.get(id).transformations.find(t => t.id === 'sortBy')?.options.sort[0];
}
for (const id of [101, 201]) assert.deepEqual(sortField(id), { field: 'Date', desc: true });
assert.equal(panels.get(206).type, 'timeseries');
assert.equal(panels.get(207).type, 'table');
assert.equal(panels.get(304).type, 'table');
assert.equal(panels.get(305).type, 'timeseries');

const resource = run('railway-resource-cost.jq', { data: { usage: [
  { measurement: 'CPU_USAGE', value: 60, tags: { serviceId: '2959d509-c829-4420-8650-e72827d88170' } },
  { measurement: 'MEMORY_USAGE_GB', value: 120, tags: { serviceId: '2959d509-c829-4420-8650-e72827d88170' } },
  { measurement: 'DISK_USAGE_GB', value: 100, tags: { serviceId: '6ba627ff-bc6d-41e7-8182-6c0f1fb03998' } },
  { measurement: 'NETWORK_TX_GB', value: 2, tags: { serviceId: '6ba627ff-bc6d-41e7-8182-6c0f1fb03998' } }
] } });
assert.equal(resource.length, 2);
assert.ok(Math.abs(resource.find(r => r.Resource === 'Metabase').Cost - 0.055584) < 1e-9);
assert.ok(Math.abs(resource.find(r => r.Resource === 'Postgres + volume').Cost - 0.10036) < 1e-9);

const ts = x => Math.floor(Date.parse(x) / 1000);
const daily = run('railway-daily-estimate.jq', { data: {
  workspace: { customer: { billingPeriod: { start: '2026-09-22T10:08:05Z' } } },
  services: [
    { measurement: 'CPU_USAGE', values: [
      { ts: ts('2026-09-22T09:00:00Z'), value: 5 },
      { ts: ts('2026-09-22T11:00:00Z'), value: 1 },
      { ts: ts('2026-09-22T17:00:00Z'), value: 1 }
    ] },
    { measurement: 'MEMORY_USAGE_GB', values: [{ ts: ts('2026-09-22T11:00:00Z'), value: 2 }] }
  ],
  volumes: [{ measurement: 'DISK_USAGE_GB', values: [{ ts: ts('2026-09-22T11:00:00Z'), value: 3 }] }]
} });
assert.equal(daily.length, 2);
assert.equal(daily[0].Time, Date.parse('2026-09-22T00:00:00+08:00'));
assert.equal(daily[1].Time, Date.parse('2026-09-23T00:00:00+08:00'));
assert.ok(Math.abs(daily[0].EstimatedUSD - (3600 * (0.00000772 + 2*0.00000386 + 3*0.00000006))) < 1e-9);

console.log('Cost detail sorting, resource allocation and Singapore-day estimate passed.');
