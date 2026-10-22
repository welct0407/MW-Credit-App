/* Structure checks of the five generated R089 dashboards; synthetic only, no provider reads.
 *   node project/scripts/monitoring/test_build_dashboards.cjs [path-to-jq] */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const L = require('./dashboards/lib.cjs');
const {buildAll, outputPath} = require('./build-dashboards.cjs');

const built = buildAll();
const again = buildAll();
const jqPath = process.argv[2] || 'jq';
const jqAvailable = spawnSync(jqPath, ['--version'], {encoding: 'utf8'}).status === 0;
let compiled = 0;

function allPanels(spec) {
  return spec.panels.flatMap(p => [{panel: p, parent: null}, ...(p.panels || []).map(c => ({panel: c, parent: p}))]);
}
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function checkGrid(uid, panels) {
  for (let i = 0; i < panels.length; i++) {
    const g = panels[i].gridPos;
    assert.ok(g && Number.isInteger(g.x) && Number.isInteger(g.y) && g.w > 0 && g.h > 0 && g.x + g.w <= 24, uid + ' panel ' + panels[i].id + ' grid');
    for (let j = 0; j < i; j++) assert.ok(!overlaps(g, panels[j].gridPos), uid + ' panels ' + panels[j].id + ' and ' + panels[i].id + ' overlap');
  }
}
function interpolate(selector) {
  return selector.replaceAll('${env}', 'prod').replaceAll('${__from}', '0').replaceAll('${__to}', '1').replaceAll('${gcp_budget_sgd}', '');
}

for (const uid of L.DASHBOARD_UIDS) {
  const d = built[uid];
  assert.equal(L.serialize(d), L.serialize(again[uid]), uid + ' build is byte-stable');
  assert.equal(fs.readFileSync(outputPath(uid), 'utf8'), L.serialize(d), uid + '.json is the current builder output (run build-dashboards.cjs)');
  assert.equal(d.apiVersion, 'dashboard.grafana.app/v1beta1');
  assert.equal(d.kind, 'Dashboard');
  const s = d.spec;
  assert.equal(s.timezone, 'Asia/Bangkok', uid + ' timezone');
  assert.ok(s.tags.includes('mw-credit'), uid + ' tag mw-credit');
  assert.ok(s.title && s.description, uid + ' title and description');
  // Link bar: five explicit links in a fixed order, no time or variables carried (Echo LINK-1..3).
  assert.deepEqual(s.links.map(l => l.url), L.DASHBOARD_UIDS.map(u => '/d/' + u), uid + ' link order');
  assert.deepEqual(s.links.map(l => l.title), ['Now', 'PWA & APIs', 'Agent & Receipts', 'Infrastructure', 'Cost']);
  for (const l of s.links) assert.ok(l.type === 'link' && l.keepTime === false && l.includeVars === false && l.asDropdown === false, uid + ' link options');

  const entries = allPanels(s);
  const ids = entries.map(e => e.panel.id);
  assert.equal(new Set(ids).size, ids.length, uid + ' unique panel ids');
  assert.ok(ids.every(Number.isInteger), uid + ' integer ids');
  const byId = new Map(entries.map(e => [e.panel.id, e]));

  checkGrid(uid, s.panels);
  for (const p of s.panels) if (p.type === 'row' && p.collapsed) checkGrid(uid + ' row ' + p.id, p.panels);
  for (const p of s.panels) if (p.type === 'row') assert.equal(p.gridPos.w, 24, uid + ' row width');
  if (uid === 'mw-now') {
    for (const p of s.panels) assert.ok(p.gridPos.w >= (p.gridPos.y === 12 ? 5 : 6), 'mw-now panel ' + p.id + ' at least 6 wide (5 on the flows row)');
  }

  for (const {panel: p, parent} of entries) {
    assert.ok(typeof p.title === 'string' && p.title.trim(), uid + ' panel ' + p.id + ' titled');
    if (p.type !== 'row') assert.ok(typeof p.description === 'string' && p.description.trim(), uid + ' panel ' + p.id + ' description');
    if (p.datasource) assert.ok(L.ALLOWED_DATASOURCE_UIDS.includes(p.datasource.uid), uid + ' panel ' + p.id + ' datasource ' + p.datasource.uid);
    if (p.type === 'state-timeline') {
      assert.equal(p.options.showValue, 'auto');
      assert.equal(p.options.rowHeight, 0.8);
      assert.equal(p.options.mergeValues, true);
      for (const t of p.targets) assert.equal(t.format, 'timeseries', uid + ' panel ' + p.id + ' timeline target format');
      // LIVE-1: fixed grey base so the mappings colour each state (thresholds colour hides them).
      assert.deepEqual(p.fieldConfig.defaults.color, {fixedColor: '#6E7079', mode: 'fixed'}, uid + ' panel ' + p.id + ' timeline colour');
      const texts = Object.values(p.fieldConfig.defaults.mappings[0].options).map(o => o.text);
      assert.deepEqual(texts, ['Down', 'OK', 'Degraded', 'Paused', 'Unknown']);
    }
    if (p.type === 'bargauge') {
      assert.equal(p.options.displayMode, 'lcd');
      assert.equal(p.options.valueMode, 'text');
      for (const t of p.targets) assert.ok(p.fieldConfig.overrides.some(o => o.matcher.options === t.refId && o.properties.some(x => x.id === 'max')), uid + ' gauge ' + p.id + ' max per field');
    }
    for (const t of p.targets || []) {
      assert.ok(L.ALLOWED_DATASOURCE_UIDS.includes(t.datasource.uid), uid + ' panel ' + p.id + ' target datasource ' + t.datasource.uid);
      if (p.datasource && p.datasource.uid !== '-- Mixed --') assert.equal(t.datasource.uid, p.datasource.uid, uid + ' panel ' + p.id + ' target datasource matches panel');
      if (t.datasource.uid === '-- Dashboard --') {
        // panelId closure: the source exists, is not itself a consumer and is loaded with the consumer.
        const src = byId.get(t.panelId);
        assert.ok(src, uid + ' panel ' + p.id + ' panelId ' + t.panelId + ' exists');
        assert.ok((src.panel.targets || []).every(x => x.datasource.uid !== '-- Dashboard --'), uid + ' panelId ' + t.panelId + ' is a query host');
        assert.ok(!(src.parent && src.parent.collapsed) || src.parent === parent, uid + ' source ' + t.panelId + ' is not hidden in another collapsed row');
        continue;
      }
      if (t.source === 'url') {
        const host = new URL(t.url).host;
        assert.ok(L.ALLOWED_URL_HOSTS.includes(host), uid + ' panel ' + p.id + ' host ' + host);
      }
      assert.ok(!/__[A-Z_]+__/.test(t.root_selector || ''), uid + ' panel ' + p.id + ' unreplaced placeholder');
      assert.ok(!/\$\{(?!__timeFrom:date:iso\}|__timeTo:date:iso\}|env\}|__from\}|__to\}|gcp_budget_sgd\})/.test(t.url + (t.url_options?.data || '') + (t.data || '') + (t.root_selector || '')),
        uid + ' panel ' + p.id + ' only known variables');
      if (jqAvailable && t.root_selector) {
        const r = spawnSync(jqPath, ['-n', 'def __probe: ' + interpolate(t.root_selector) + '\n; 1'], {encoding: 'utf8'});
        assert.equal(r.status, 0, uid + ' panel ' + p.id + ' ' + t.refId + ' jq compiles: ' + r.stderr);
        compiled++;
      }
    }
  }
}

// No generated dashboard links to a retiring dashboard.
for (const uid of L.DASHBOARD_UIDS) assert.ok(!L.OLD_DASHBOARD_LINK.test(L.serialize(built[uid])), uid + ' has no link to a retiring dashboard');
// LIVE-2/3: no query letter in names (field-name display), no Paused blue on informational stat values.
for (const uid of L.DASHBOARD_UIDS) for (const {panel: p} of allPanels(built[uid].spec)) {
  if (p.type === 'stat' && p.fieldConfig.defaults.color?.mode === 'fixed') assert.notEqual(p.fieldConfig.defaults.color.fixedColor, 'blue', uid + ' panel ' + p.id + ' informational colour');
  if (['stat', 'table', 'timeseries', 'state-timeline'].includes(p.type)) {
    // Multi-frame panels the builder writes (lifted panels keep their proven config and pluginVersion).
    if ((p.targets || []).length > 1 && !p.pluginVersion) assert.ok(p.fieldConfig.defaults.displayName, uid + ' panel ' + p.id + ' explicit display name');
  }
}
// RECHECK-2: every multi-query timeseries, lifted or built, names each query explicitly (no "A Used" legends).
let namedTimeseries = 0;
for (const uid of L.DASHBOARD_UIDS) for (const {panel: p} of allPanels(built[uid].spec)) {
  if (p.type !== 'timeseries' || (p.targets || []).length < 2) continue;
  const names = new Map((p.fieldConfig.overrides || []).filter(o => o.matcher.id === 'byFrameRefID')
    .flatMap(o => o.properties.filter(x => x.id === 'displayName').map(x => [o.matcher.options, x.value])));
  for (const t of p.targets) assert.ok(typeof names.get(t.refId) === 'string' && names.get(t.refId).trim() && !/^[A-Z] /.test(names.get(t.refId)),
    uid + ' panel ' + p.id + ' (' + p.title + ') query ' + t.refId + ' has a displayName override');
  namedTimeseries++;
}
assert.ok(namedTimeseries >= 10, 'multi-query timeseries checked: ' + namedTimeseries);
// The four Echo found with query letters carry their series names.
const legend = (uid, title) => allPanels(built[uid].spec).map(e => e.panel).find(p => p.title === title).fieldConfig.overrides
  .filter(o => o.matcher.id === 'byFrameRefID').map(o => o.properties.find(x => x.id === 'displayName').value);
assert.deepEqual(legend('mw-agent', 'Queue length over time'), ['Images waiting', 'Manual holds', 'Awaiting review', 'Unconfirmed posting']);
assert.deepEqual(legend('mw-infra', 'Cloud SQL memory'), ['Used', 'Cache', 'Free']);
assert.deepEqual(legend('mw-infra', 'Debian VM network'), ['Received', 'Sent']);
assert.deepEqual(legend('mw-infra', 'Debian VM disk'), ['Read', 'Write']);
// RECHECK-6: Grafana drops a gridPos equal to its default {x 0, y 0, w 6, h 3} when it stores a dashboard.
for (const uid of L.DASHBOARD_UIDS) for (const p of built[uid].spec.panels) {
  const g = p.gridPos;
  assert.ok(!(g.x === 0 && g.y === 0 && g.w === 6 && g.h === 3), uid + ' panel ' + p.id + ' gridPos is not the Grafana default');
}
// RECHECK-3: Now 4 and Agent 1 send the identical Scan request over the same fixed window.
const scanOf = (uid, id) => built[uid].spec.panels.find(p => p.id === id);
assert.equal(scanOf('mw-now', 4).timeFrom, '3h');
assert.equal(scanOf('mw-agent', 1).timeFrom, '3h');
assert.deepEqual({...scanOf('mw-now', 4).targets[0], columns: null}, {...scanOf('mw-agent', 1).targets[0], columns: null});
// The Now home page carries no DEV series and the PWA page carries no unparameterised environment.
const nowText = JSON.stringify(built['mw-now']);
assert.ok(!/-dev\b|_dev\b|loan_manager_dev/.test(nowText), 'mw-now is PROD only');
const pwaUrls = allPanels(built['mw-pwa'].spec).flatMap(e => (e.panel.targets || []).map(t => decodeURIComponent(t.url || '')));
assert.ok(pwaUrls.filter(u => /mw-credit-app-(read|command|notify|jobs)-/.test(u)).every(u => /-\$\{env\}/.test(u)), 'mw-pwa Cloud Run filters follow ${env}');
assert.deepEqual(built['mw-pwa'].spec.templating.list.map(v => v.name), ['env']);
// Webhook rows read the Singapore checker only.
for (const uid of ['mw-now', 'mw-agent']) {
  const webhook = allPanels(built[uid].spec).flatMap(e => e.panel.targets || []).filter(t => (t.url || '').includes('check_passed'));
  assert.ok(webhook.length === 1 && decodeURIComponent(webhook[0].url).includes('checker_location = "' + L.UPTIME_SINGAPORE_LOCATION + '"'), uid + ' webhook Singapore only');
}
// The Cost query host is visible at the top and keeps today's panel 2 queries A–E unchanged.
const cost = built['mw-cost'].spec;
const host = cost.panels.find(p => p.id === 5);
assert.ok(host && host.gridPos.y === 0);
assert.deepEqual(host.targets.slice(0, 5), L.findPanel(L.COST, 2).targets);
// LIVE-10: the Cost reading rules sit above the collapsed provider rows.
assert.ok(cost.panels.find(p => p.id === 40).gridPos.y < Math.min(...cost.panels.filter(p => p.type === 'row').map(p => p.gridPos.y)));
// Previous-month figure: Azure Custom windows shifted by the panel (TheLastMonth is refused by Cost Management).
assert.ok(!L.serialize(built['mw-cost']).includes('TheLastMonth'), 'mw-cost uses no TheLastMonth timeframe');
const lastMonth = cost.panels.find(p => p.id === 9);
assert.ok(lastMonth && lastMonth.timeFrom === 'now/M' && lastMonth.timeShift === '1M');
for (const t of lastMonth.targets.slice(0, 2)) assert.equal(JSON.parse(t.url_options.data).timeframe, 'Custom');
// Lifted panels keep their selectors byte for byte.
for (const [uid, old, id] of [['mw-agent', 108, 2], ['mw-infra', 31, 1], ['mw-infra', 42, 15], ['mw-cost', 201, 201]]) {
  const p = allPanels(built[uid].spec).find(e => e.panel.id === id).panel;
  assert.deepEqual(p.targets.map(t => t.root_selector), L.findPanel(old === 201 ? L.COST : L.PERF, old).targets.map(t => t.root_selector), uid + ' ' + id + ' lifted selectors');
}

console.log(JSON.stringify({dashboards: L.DASHBOARD_UIDS.length, panels: L.DASHBOARD_UIDS.map(u => allPanels(built[u].spec).length),
  jqCompiled: jqAvailable ? compiled : 'skipped (jq not found)', passed: true}));
