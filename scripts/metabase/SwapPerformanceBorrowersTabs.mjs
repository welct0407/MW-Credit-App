// R024: swap the two existing dashboard tabs without altering their cards or filters.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api, assertSource} from './ReportingApi.mjs';

const out = 'outputs/r024-20260924';
const backup = 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r024-tab-order/dashboard.json';
const before = JSON.parse(fs.readFileSync(backup, 'utf8'));
const previous = before.tabs.find(t => t.id === 6);
const performance = before.tabs.find(t => t.id === 18);
assert.equal(previous?.name, '5 · Borrowers');
assert.equal(previous?.position, 4);
assert.equal(performance?.name, '6 · Performance');
assert.equal(performance?.position, 5);
const tabs = before.tabs.map(t => t.id === 6
  ? {...t, name: '6 · Borrowers', position: 5}
  : t.id === 18 ? {...t, name: '5 · Performance', position: 4} : t);
const sorted = tabs.toSorted((a, b) => a.position - b.position);
assert.deepEqual(sorted.map(t => t.id), [4, 14, 16, 15, 18, 6, 8, 9, 10, 11, 17]);
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(`${out}/plan.json`, JSON.stringify({dashboard: 3, tabs: sorted.map(({id, name, position}) => ({id, name, position})), cards: before.dashcards.length, parameters: before.parameters.map(p => p.id)}, null, 2) + '\n');
const cardShape = cards => cards.map(c => Object.fromEntries(['id', 'card_id', 'dashboard_tab_id', 'col', 'row', 'size_x', 'size_y', 'series', 'parameter_mappings', 'visualization_settings'].map(k => [k, c[k]]))).toSorted((a,b) => a.id - b.id);
const tabShape = ts => ts.map(({id, name, position}) => ({id, name, position})).toSorted((a,b) => a.position - b.position);
if (process.argv.includes('--publish-tabs')) {
  await assertSource();
  const live = await api('GET', 'dashboard/3');
  assert.deepEqual(tabShape(live.tabs), tabShape(before.tabs));
  assert.deepEqual(cardShape(live.dashcards), cardShape(before.dashcards));
  assert.deepEqual(live.parameters, before.parameters);
  await api('PUT', 'dashboard/3/cards', {tabs, cards: live.dashcards});
}
if (process.argv.includes('--verify-tabs')) {
  const live = await api('GET', 'dashboard/3');
  assert.deepEqual(tabShape(live.tabs), tabShape(tabs));
  assert.deepEqual(cardShape(live.dashcards), cardShape(before.dashcards));
  assert.deepEqual(live.parameters, before.parameters);
  for (const id of [6, 18]) {
    assert.deepEqual(live.dashcards.filter(c => c.dashboard_tab_id === id).map(c => c.id).sort((a,b) => a-b), before.dashcards.filter(c => c.dashboard_tab_id === id).map(c => c.id).sort((a,b) => a-b));
  }
  fs.writeFileSync(`${out}/verification.json`, JSON.stringify({at: new Date().toISOString(), checks: ['Performance fifth and Borrowers sixth', 'All 189 placements preserved, including tab membership and filter mappings', 'Dashboard parameters unchanged'], tabs: live.tabs.length, placements: live.dashcards.length}, null, 2) + '\n');
  console.log('Three tab-order checks passed');
}
