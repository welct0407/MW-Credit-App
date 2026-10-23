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
function panelOf0(uid, id) { return allPanels(built[uid].spec).map(e => e.panel).find(p => p.id === id); }
function interpolate(selector) {
  return selector.replaceAll('${env}', 'prod').replaceAll('${__from}', '0').replaceAll('${__to}', '1');
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
  // Link bar: five explicit links in a fixed order, no time or variables carried (Echo LINK-1..3), first on
  // every page so they keep their place; ENV-1: the PWA page adds its PROD / DEV switch after them.
  const pages = s.links.slice(0, 5);
  assert.deepEqual(pages.map(l => l.url), L.DASHBOARD_UIDS.map(u => '/d/' + u), uid + ' link order');
  assert.deepEqual(pages.map(l => l.title), ['Now', 'PWA & APIs', 'Agent & Receipts', 'Infrastructure', 'Cost']);
  for (const l of pages) assert.ok(l.type === 'link' && l.keepTime === false && l.includeVars === false && l.asDropdown === false, uid + ' link options');
  assert.deepEqual(s.links.slice(5).map(l => [l.title, l.url, l.keepTime]), uid === 'mw-pwa' ? [['PROD', '/d/mw-pwa?var-env=prod', true], ['DEV', '/d/mw-pwa?var-env=dev', true]] : [], uid + ' extra links');
  // No visible variable: Grafana draws variables before the links, which would move the page links.
  assert.ok(s.templating.list.every(v => v.hide === 2), uid + ' variables hidden');

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
      // TIMELINE-GAP: no word for null, so no data is an empty gap, not "Unknown".
      assert.ok(p.fieldConfig.defaults.mappings.every(m => m.type !== 'special'), uid + ' panel ' + p.id + ' no null mapping');
    }
    // Capacity gauges (bars against a limit); PWA 30 Recognitions is a bar list of counts without a limit.
    if (p.type === 'bargauge' && !(uid === 'mw-pwa' && p.id === 30)) {
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
      assert.ok(!/\$\{(?!__timeFrom:date:iso\}|__timeTo:date:iso\}|env\}|__from\}|__to\}|lookback_(?:from|hour|day)\})/.test(t.url + (t.url_options?.data || '') + (t.data || '') + (t.root_selector || '')),
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
// A panel that merges or joins its frames draws one frame named by its fields instead (Cost daily chart).
let namedTimeseries = 0;
for (const uid of L.DASHBOARD_UIDS) for (const {panel: p} of allPanels(built[uid].spec)) {
  if (p.type !== 'timeseries' || (p.targets || []).length < 2) continue;
  if (L.joinsFrames(p)) {
    assert.ok(!(p.fieldConfig.overrides || []).some(o => o.matcher.id === 'byFrameRefID'), uid + ' panel ' + p.id + ' merged frame has no per-query names');
    assert.equal(p.fieldConfig.defaults.displayName, '${__field.name}', uid + ' panel ' + p.id + ' series named by field');
    continue;
  }
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
assert.deepEqual(legend('mw-agent', 'Receipts · queue over time'), ['Images waiting', 'Manual holds', 'Awaiting review', 'Unconfirmed posting']);
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
// FINAL-2: the Scan tile reads only the completion-time row, never the polling state code.
for (const [uid, id] of [['mw-now', 4], ['mw-agent', 1]]) {
  const t = scanOf(uid, id).targets[0];
  assert.equal(t.root_selector, require('./dashboards/now.cjs').scanSelector(), uid + ' ' + id + ' Scan selector');
  assert.ok(t.root_selector.endsWith('map(select(.details == "Last scan completion")) | .[]'), uid + ' ' + id + ' Scan keeps the completion row');
  assert.deepEqual(t.columns.map(c => c.selector), ['status'], uid + ' ' + id + ' Scan reads one field');
}
// FINAL-1 / COST-5: the Cost top row is TOTAL and the three providers, 24 columns, each 6 wide.
const top = built['mw-cost'].spec.panels.filter(p => p.gridPos.y === 0);
assert.deepEqual(top.map(p => [p.id, p.gridPos.w]), [[1, 6], [2, 6], [3, 6], [4, 6]], 'Cost top row');
// The Now home page carries no DEV series and the PWA page carries no unparameterised environment.
const nowText = JSON.stringify(built['mw-now']);
assert.ok(!/-dev\b|_dev\b|loan_manager_dev/.test(nowText), 'mw-now is PROD only');
const pwaUrls = allPanels(built['mw-pwa'].spec).flatMap(e => (e.panel.targets || []).map(t => decodeURIComponent(t.url || '')));
assert.ok(pwaUrls.filter(u => /mw-credit-app-(read|command|notify|jobs)-/.test(u)).every(u => /-\$\{env\}/.test(u)), 'mw-pwa Cloud Run filters follow ${env}');
assert.deepEqual(built['mw-pwa'].spec.templating.list.map(v => v.name), ['env', 'lookback_from', 'lookback_hour', 'lookback_day']);
// Webhook rows read the Singapore checker only.
for (const uid of ['mw-now', 'mw-agent']) {
  const webhook = allPanels(built[uid].spec).flatMap(e => e.panel.targets || []).filter(t => (t.url || '').includes('check_passed'));
  assert.ok(webhook.length === 1 && decodeURIComponent(webhook[0].url).includes('checker_location = "' + L.UPTIME_SINGAPORE_LOCATION + '"'), uid + ' webhook Singapore only');
}
// COST-5: no exchange-rate tile; TOTAL (visible at the top) hosts today's panel 2 queries A–E unchanged and
// the provider tiles read them; the FX rate stays in the conversions.
const cost = built['mw-cost'].spec;
const host = cost.panels.find(p => p.id === 1);
assert.ok(host && host.gridPos.y === 0 && host.title === 'Total · this month');
assert.deepEqual(host.targets, L.findPanel(L.COST, 2).targets);
assert.ok(!cost.panels.some(p => p.id === 5) && !/Coverage and FX/.test(L.serialize(built['mw-cost'])), 'no Coverage and FX tile');
for (const id of [2, 3, 4]) assert.deepEqual(cost.panels.find(p => p.id === id).targets.map(t => t.panelId), [1], 'provider tile ' + id + ' reads TOTAL');
assert.ok(host.transformations.some(t => t.options.binary && t.options.binary.right === 'SGD per USD'), 'FX applied in TOTAL');
// LIVE-10: the Cost reading rules sit above the collapsed provider rows.
assert.ok(cost.panels.find(p => p.id === 40).gridPos.y < Math.min(...cost.panels.filter(p => p.type === 'row').map(p => p.gridPos.y)));
// Previous-month figure: Azure Custom windows shifted by the panel (TheLastMonth is refused by Cost Management).
assert.ok(!L.serialize(built['mw-cost']).includes('TheLastMonth'), 'mw-cost uses no TheLastMonth timeframe');
const lastMonth = cost.panels.find(p => p.id === 9);
assert.ok(lastMonth && lastMonth.timeFrom === 'now/M' && lastMonth.timeShift === '1M');
for (const t of lastMonth.targets.slice(0, 2)) assert.equal(JSON.parse(t.url_options.data).timeframe, 'Custom');
// Lifted panels keep their selectors byte for byte.
// R090: Metabase CPU and RAM (Infrastructure 14, 15) send one combined Railway call (test_dashboard_queries.py).
for (const [uid, old, id] of [['mw-agent', 108, 2], ['mw-infra', 31, 1], ['mw-infra', 43, 16], ['mw-cost', 201, 201]]) {
  const p = allPanels(built[uid].spec).find(e => e.panel.id === id).panel;
  assert.deepEqual(p.targets.map(t => t.root_selector), L.findPanel(old === 201 ? L.COST : L.PERF, old).targets.map(t => t.root_selector), uid + ' ' + id + ' lifted selectors');
}
// COST-2/COST-6 (owner decisions): one stacked daily chart in SGD (Azure blue, GCP orange) over the dashboard's
// range (month to date by default); Railway is left out (its estimate covers only its mid-month cycle).
const daily = cost.panels.filter(p => p.type === 'timeseries');
assert.equal(daily.length, 1, 'Cost has one daily chart');
const chart = daily[0];
assert.equal(chart.id, 6);
assert.equal(chart.title, 'Daily cost · this month');
assert.equal(chart.timeFrom, undefined, 'daily chart follows the picker (month to date)');
assert.deepEqual(cost.time, {from: 'now/M', to: 'now'});
assert.equal(chart.fieldConfig.defaults.unit, 'prefix:S$', 'daily chart unit SGD');
assert.equal(chart.fieldConfig.defaults.custom.drawStyle, 'bars');
assert.deepEqual(chart.fieldConfig.defaults.custom.stacking, {group: 'A', mode: 'normal'});
const colour = name => chart.fieldConfig.overrides.find(o => o.matcher.id === 'byName' && o.matcher.options === name)?.properties.find(x => x.id === 'color')?.value.fixedColor;
assert.deepEqual(['Azure', 'GCP'].map(colour), ['#5794F2', '#FF9830'], 'Azure blue, GCP orange');
assert.ok(!chart.targets.some(t => (t.url || '').includes('railway')), 'no Railway query in the daily chart');
const budgetLine = chart.fieldConfig.overrides.find(o => o.matcher.options === 'GCP budget (billing account) / day');
assert.ok(budgetLine && budgetLine.properties.some(x => x.id === 'custom.stacking' && x.value.mode === 'none'), 'budget line is not stacked');
const kept = chart.transformations.find(t => t.id === 'filterFieldsByName').options.include.names;
assert.deepEqual(kept, ['Time', 'Azure', 'GCP', 'GCP budget (billing account) / day'], 'daily series Azure, GCP and the budget line');
assert.equal(chart.transformations[0].id, 'merge', 'daily frames merged on Time');
for (const t of chart.targets) assert.equal(t.columns[0].selector, 'Time', 'daily query ' + t.refId + ' keyed by Time');
// Conversion: the tiles' FX query (mw-public-fx) with the tiles' binary steps.
const tilesFx = L.findPanel(L.COST, 2).targets[4];
const fxTarget = chart.targets.find(t => t.refId === 'E');
assert.equal(fxTarget.datasource.uid, 'efz19dcu6cwzka');
assert.equal(fxTarget.url, tilesFx.url);
assert.ok(fxTarget.root_selector.includes(tilesFx.root_selector), 'daily FX keeps the tiles\' FX rule');
const binaries = chart.transformations.filter(t => t.id === 'calculateField').map(t => t.options.binary);
assert.deepEqual(binaries, L.findPanel(L.COST, 2).transformations.filter(t => t.id === 'calculateField').map(t => t.options.binary).slice(0, 2), 'same Azure conversion steps as the tiles');
assert.equal(chart.targets.find(t => t.refId === 'C').url_options.data, L.liftTarget(L.COST, 201).url_options.data, 'GCP: the tiles\' picker window');
for (const id of ['A', 'B']) assert.equal(JSON.parse(chart.targets.find(t => t.refId === id).url_options.data).timeframe, 'Custom');
// No USD unit on the Cost page itself (the collapsed provider rows keep their native detail units).
for (const p of cost.panels) assert.ok(!/currencyUSD|"unit":"[^"]*USD/.test(JSON.stringify(p.fieldConfig || {})), 'mw-cost panel ' + p.id + ' has no USD unit');
// Budget from budget.jq on the Budget API, in the chart and the GCP budget tile; no constant left.
assert.ok(!L.serialize(built['mw-cost']).includes('gcp_budget_sgd'), 'no gcp_budget_sgd');
assert.deepEqual(cost.templating.list, [], 'Cost has no budget constant');
const budgetJq = L.jq('budget.jq');
const budgetTile = cost.panels.find(p => p.id === 8);
assert.equal(budgetTile.title, 'GCP budget');
for (const t of [chart.targets.find(x => x.refId === 'F'), budgetTile.targets[0]]) {
  assert.equal(t.datasource.uid, 'mw-gcp-monitoring');
  assert.equal(t.url, 'https://billingbudgets.googleapis.com/v1/billingAccounts/0125EC-78CB0F-A74AAD/budgets');
  assert.equal((t.url_options.method || 'GET'), 'GET');
  assert.ok(t.root_selector.includes(budgetJq), 'budget query ' + t.refId + ' uses budget.jq');
}
assert.ok(new RegExp(budgetTile.options.reduceOptions.fields.slice(1, -1)).test('GCP budget'), 'budget tile shows its text');
// Layout: the daily chart sits beside GCP by service.
const third = cost.panels.filter(p => p.gridPos.y === 8);
assert.deepEqual(third.map(p => [p.id, p.gridPos.x, p.gridPos.w]), [[6, 0, 16], [7, 16, 8]], 'Cost daily row');
// LEFT-EDGE: every state-timeline row reads from a hidden lookback variable (range start - 20 min; hourly and
// daily scheduler rows 80 min and 26 h, TIMELINE-GAP) and is clipped by range-start.jq, so it starts exactly at
// the range start; each variable exists exactly where it is used.
let clippedRows = 0;
for (const uid of L.DASHBOARD_UIDS) {
  const s = built[uid].spec;
  for (const [name, seconds] of Object.entries(L.LOOKBACKS)) {
    const uses = L.serialize({panels: s.panels}).includes('${' + name + '}');
    const v = s.templating.list.find(x => x.name === name);
    assert.equal(Boolean(v), uses, uid + ' defines ' + name + ' exactly when it is used');
    if (!v) continue;
    assert.ok(v.hide === 2 && v.refresh === 2 && v.type === 'query' && v.skipUrlSync === true, uid + ' ' + name + ' hidden, refreshed on time range change');
    if (jqAvailable) {
      const from = 1761100000123;
      const r = spawnSync(jqPath, ['-n', '-c', v.query.infinityQuery.root_selector.replaceAll('${__from}', String(from))], {encoding: 'utf8'});
      assert.equal(JSON.parse(r.stdout).value, new Date(Math.floor(from / 1000) * 1000 - seconds * 1000).toISOString().replace('.000Z', 'Z'), uid + ' ' + name + ' value');
    }
  }
  for (const {panel: p} of allPanels(s)) {
    if (p.type !== 'state-timeline') continue;
    for (const t of p.targets) {
      assert.ok(/interval\.startTime=\$\{lookback_(from|hour|day)\}&/.test(t.url), uid + ' panel ' + p.id + ' ' + t.refId + ' reads from a lookback start');
      assert.ok(t.root_selector.includes('def clip($from; $stale)') && t.root_selector.includes(L.RANGE_START), uid + ' panel ' + p.id + ' ' + t.refId + ' clipped to the range start');
      clippedRows++;
    }
  }
}
// TIMELINE-GAP: the PWA scheduler rows hold each attempt until the job's next expected run.
const holds = panelOf0('mw-pwa', 20).targets.map(t => [decodeURIComponent(t.url).match(/job_id = "mw-credit-app-\$\{env\}-([a-z-]+)"/)[1], t.url.match(/lookback_(\w+)/)[1]]);
assert.deepEqual(holds, [['notifications', 'from'], ['daily-charges', 'day'], ['recent-analytics', 'hour']]);
assert.ok(clippedRows >= 30, 'state-timeline rows clipped: ' + clippedRows);
// R089 follow-up: one-value stats show the value only (the title names it) at the one-value size; Recognitions
// names each outcome (rows to fields) instead of "Count"; provider tiles show provider and model as text.
const panelOf = (uid, id) => allPanels(built[uid].spec).map(e => e.panel).find(p => p.id === id);
for (const [uid, id] of [['mw-agent', 13], ['mw-agent', 14], ['mw-infra', 18], ['mw-cost', 1]]) {
  const o = panelOf(uid, id).options;
  assert.equal(o.textMode, 'value', uid + ' ' + id + ' one-value tile shows the value only');
  assert.ok(o.text.valueSize >= 32 && o.text.titleSize >= 16, uid + ' ' + id + ' one-value size');
}
for (const uid of L.DASHBOARD_UIDS) for (const {panel: p} of allPanels(built[uid].spec)) {
  if (p.type !== 'stat' || p.pluginVersion) continue;
  const values = (p.targets || []).flatMap(t => (t.columns || []).filter(c => !/^timestamp/.test(c.type)));
  if (values.length === 1 && !p.transformations) assert.equal(p.options.textMode, 'value', uid + ' panel ' + p.id + ' (' + p.title + ') single value without its name');
  assert.ok(!(p.options.reduceOptions.fields || '').includes('Count'), uid + ' panel ' + p.id + ' no Count value name');
}
const recognitions = panelOf('mw-pwa', 30);
assert.equal(recognitions.type, 'bargauge', 'Recognitions: one bar per outcome');
assert.equal(recognitions.transformations[0].id, 'rowsToFields');
assert.ok(recognitions.fieldConfig.overrides.some(o => o.matcher.options === 'none' && o.properties[0].value === 'Clean'), 'outcomes named in words');
// READ-1: provider and model are their own text tiles; the service tiles keep state words at the larger size.
for (const [uid, id, component] of [['mw-pwa', 33, 'recognizer'], ['mw-agent', 12, 'recognizer'], ['mw-agent', 15, 'conversation']]) {
  const p = panelOf(uid, id);
  assert.equal(p.targets[0].root_selector, L.jq('provider-model.jq'), uid + ' ' + id + ' provider and model from provider-model.jq');
  assert.ok(decodeURIComponent(p.targets[0].url).includes('metric.labels.component = "' + component + '"'));
  assert.ok(new RegExp(p.options.reduceOptions.fields.slice(1, -1)).test('Provider') && p.options.textMode === 'value');
  assert.deepEqual(p.options.text, L.TEXT_TILE, uid + ' ' + id + ' text tile size');
}
for (const [uid, id] of [['mw-pwa', 32], ['mw-agent', 6], ['mw-agent', 5]]) {
  const p = panelOf(uid, id);
  assert.ok(!JSON.stringify(p.targets).includes('provider-model') && !p.fieldConfig.overrides.some(o => o.matcher.id === 'byFrameRefID'), uid + ' ' + id + ' no provider text, no per-frame name');
}
// READ-1: stat names 16 px and values 32 px (text tiles 20 px), several values listed as rows; bar gauges 16/22;
// tables md rows; and the layout model finds no truncation at 1440 px (docked menu) or on a 390 px phone.
const M = require('./layout-model.cjs');
const MODEL = {'mw-pwa:30': {names: ['Clean', 'Slip not confirmed', 'Amount unreadable', 'Reference unreadable']}};
const TABLE_ROWS = {'mw-now:3': 4, 'mw-now:19': 6, 'mw-infra:5': 1, 'mw-infra:6': 4, 'mw-infra:8': 1, 'mw-infra:9': 8, 'mw-infra:17': 7, 'mw-cost:7': 11};
let modelled = 0;
for (const uid of L.DASHBOARD_UIDS) for (const {panel: p} of allPanels(built[uid].spec)) {
  const key = uid + ':' + p.id;
  if (p.type === 'stat') {
    const t = p.options.text;
    const tile = t.valueSize === L.TEXT_TILE.valueSize && t.titleSize === L.TEXT_TILE.titleSize;
    assert.ok(tile || (t.titleSize >= 16 && t.valueSize >= 32), key + ' stat text 16/32');
  }
  if (p.type === 'bargauge') assert.ok(p.options.text.titleSize >= 16 && p.options.text.valueSize >= 22, key + ' bar gauge text');
  if (p.type === 'table') assert.equal(p.options.cellHeight, 'md', key + ' table rows md');
  for (const screen of ['desktop', 'phone']) {
    // FINAL2-1/2: every panel title fits its one line, every timeline lane label its label axis.
    const errors = (p.type === 'stat' ? M.checkStat(p, screen, MODEL[key] || {}) : p.type === 'bargauge' && key !== 'mw-pwa:30' ? M.checkGauge(p, screen)
      : p.type === 'table' && TABLE_ROWS[key] ? M.checkTable(p, screen, TABLE_ROWS[key]) : p.type === 'state-timeline' ? M.checkTimeline(p, screen) : [])
      .concat(M.checkTitle(p, screen))
      // FINAL3-2: built tables' columns fit (lifted provider detail tables in collapsed Cost rows scroll; the
      // eight-service Cloud Run table scrolls sideways on a phone, its six columns cannot share 342 px).
      .concat(p.type === 'table' && !p.pluginVersion && !(key === 'mw-infra:9' && screen === 'phone') ? M.checkTableColumns(p, screen) : []);
    assert.deepEqual(errors, [], key + ' (' + p.title + ') fits at ' + screen);
    modelled++;
  }
}
assert.ok(modelled > 100, 'panels modelled: ' + modelled);
// AGENT-ROWS: the Agent page is grouped into five titled component rows; each tile title names its component.
const agent = built['mw-agent'].spec.panels;
assert.deepEqual(agent.filter(p => p.type === 'row').map(p => p.title), ['Receipt pipeline · Instagram to recorded payment',
  'Receipt recognizer · mw-receipt-recognition on Debian', 'Partner conversation · Instagram chat agent', 'Agent workers and timers · Debian units', 'Connectivity and providers']);
const rowOf = id => { let current; for (const p of agent) { if (p.type === 'row') current = p.title; if (p.id === id) return current.split(' ·')[0]; } };
assert.deepEqual([1, 2, 14, 6, 12, 7, 8, 3, 4, 5, 15, 9, 10, 11, 13].map(rowOf), ['Receipt pipeline', 'Receipt pipeline', 'Receipt pipeline', 'Receipt recognizer',
  'Receipt recognizer', 'Receipt recognizer', 'Receipt recognizer', 'Partner conversation', 'Partner conversation', 'Partner conversation', 'Partner conversation',
  'Agent workers and timers', 'Connectivity and providers', 'Connectivity and providers', 'Connectivity and providers']);
for (const p of agent) if (p.type !== 'row') assert.ok(/^(Receipt pipeline|Receipts|Recognizer|Conversation|Agent workers|Connectivity|Providers) /.test(p.title), 'mw-agent ' + p.id + ' title names its component: ' + p.title);
// FINAL2-1: the PWA scheduler lanes carry short names that fit the label axis.
assert.deepEqual(panelOf('mw-pwa', 20).targets.map(t => t.columns[1].text), ['Notify · 1 min', 'Charges · 00:05', 'Analytics · hourly']);
// FINAL2-4: Infrastructure chart legends are lists below the chart with the full names.
for (const {panel: p} of allPanels(built['mw-infra'].spec)) if (p.type === 'timeseries') assert.deepEqual(p.options.legend, {calcs: [], displayMode: 'list', placement: 'bottom', showLegend: true}, 'mw-infra ' + p.id + ' legend');
// Provider status: Railway (Instatus) and Google Cloud; OpenAI is no longer read by the new dashboards.
for (const [uid, id] of [['mw-now', 17], ['mw-agent', 11]]) {
  const p = panelOf(uid, id);
  assert.deepEqual(p.targets.map(t => t.url), ['https://railway.instatus.com/summary.json', 'https://status.cloud.google.com/incidents.json']);
  assert.equal(p.targets[0].datasource.uid, 'cfz10a9eaokjkd');
  assert.ok(Object.values(p.fieldConfig.defaults.mappings[0].options).some(m => m.text === 'Maintenance'));
}
for (const uid of L.DASHBOARD_UIDS) assert.ok(!/openai/i.test(L.serialize(built[uid])), uid + ' reads no OpenAI status');
// COLOUR-1 (owner policy): every stat field is in exactly one colour class, and its colour follows the class.
// A name qualified by its panel title ("Provider status › Railway") wins over the plain name.
const classOf = (p, name) => {
  const qualified = Object.entries(L.POLICY).filter(([, names]) => names.includes(p.title + ' › ' + name)).map(([c]) => c);
  return qualified.length ? qualified : Object.entries(L.POLICY).filter(([, names]) => names.includes(name)).map(([c]) => c);
};
const STATE_WORDS = new Set([L.COLOR.down, L.COLOR.ok, L.COLOR.degraded]);
let classified = 0;
for (const uid of L.DASHBOARD_UIDS) for (const {panel: p} of allPanels(built[uid].spec)) {
  if (p.type !== 'stat') continue;
  const filter = (p.transformations || []).filter(t => t.id === 'filterFieldsByName').pop();
  let names = (filter ? filter.options.include.names : (p.targets || []).flatMap(t => (t.columns || []).filter(c => !/^timestamp/.test(c.type)).map(c => c.text)))
    .filter(n => n !== 'Time' && n !== 'Category');
  if (!names.length) names = [p.title];
  for (const name of names) {
    const classes = classOf(p, name);
    assert.equal(classes.length, 1, uid + ' ' + p.id + ' "' + name + '" is in exactly one colour class: ' + classes);
    const props = Object.fromEntries((p.fieldConfig.overrides || []).filter(o => o.matcher.id === 'byName' && o.matcher.options === name).flatMap(o => o.properties.map(x => [x.id, x.value])));
    const d = p.fieldConfig.defaults;
    const color = props.color || d.color, thresholds = props.thresholds || d.thresholds, mappings = props.mappings || d.mappings || [];
    const coded = mappings.some(m => m.type === 'regex' && /\\\|/.test(m.options.pattern));
    const steps = (thresholds && thresholds.steps) || [];
    const where = uid + ' ' + p.id + ' "' + name + '" (' + classes[0] + ')';
    switch (classes[0]) {
      case 'state':
        assert.ok(coded || mappings.some(m => m.type === 'value' && Object.values(m.options).some(o => STATE_WORDS.has(o.color))), where + ' coloured by state');
        break;
      case 'problem':
        assert.ok(coded || (color.mode === 'thresholds' && steps[0].color === L.COLOR.ok && steps[1].value === 1 && [L.COLOR.down, L.COLOR.degraded].includes(steps[1].color)), where + ' green at 0, red or orange above');
        break;
      case 'age':
      case 'limit':
        assert.ok(color.mode === 'thresholds' && steps[0].color === L.COLOR.ok && steps[1].value > 1 && [L.COLOR.degraded, L.COLOR.unknown].includes(steps[1].color), where + ' green within its limit, orange past (grey when stale)');
        break;
      default:
        // work, money, info: neutral, unless a normal-work count is coloured through a documented age or limit (stages).
        assert.ok(coded && classes[0] === 'work' || (color.mode === 'fixed' && [L.COLOR.info, L.COLOR.text].includes(color.fixedColor)), where + ' neutral');
    }
    classified++;
  }
}
assert.ok(classified >= 75, 'stat fields classified: ' + classified);
// R090: the per-question cost uses the page's SGD unit (Grafana has no 'currencySGD'; it printed the unit name).
const costUnit = panelOf('mw-cost', 50).fieldConfig.overrides.find(o => o.matcher.options === 'Cost (SGD)').properties;
assert.deepEqual([costUnit.find(x => x.id === 'unit').value, costUnit.find(x => x.id === 'decimals').value], ['prefix:S$', 2]);
// R090 owner limits on the formerly neutral tiles.
const limitOf = (uid, id, name) => panelOf(uid, id).fieldConfig.overrides.find(o => o.matcher.options === name).properties.find(x => x.id === 'thresholds').value.steps[1].value;
for (const [uid, id, name, value] of [['mw-now', 5, 'Last turn age', 604800], ['mw-agent', 5, 'Last send', 604800], ['mw-pwa', 22, 'Last notification', 172800],
  ['mw-pwa', 3, '401 · session invalid', 10], ['mw-now', 6, 'Pending', 5], ['mw-pwa', 21, 'Pending', 5]]) assert.equal(limitOf(uid, id, name), value, uid + ' ' + id + ' ' + name);
// COLOUR-2: both pipeline tiles colour every stage, with the same rule for the same metric.
for (const [uid, id] of [['mw-now', 4], ['mw-agent', 1]]) {
  const p = panelOf(uid, id);
  assert.ok(p.fieldConfig.defaults.mappings.filter(m => m.type === 'regex').length === 5 && !p.fieldConfig.overrides.length, uid + ' ' + id + ' every stage state-coded');
  assert.ok(p.targets.every(t => t.columns[0].type === 'string'), uid + ' ' + id + ' coded text values');
}
const stage = (uid, id, ref) => panelOf(uid, id).targets.find(t => t.refId === ref).root_selector;
assert.equal(stage('mw-now', 4, 'B'), stage('mw-agent', 1, 'B').replace('Extraction waiting', '2 · Extract · waiting'), 'Extract waiting: the same stalled rule');
// OWNER-NATIVE: the native-API probes are named for the Partner chat data they check; metric labels unchanged.
const api = panelOf('mw-pwa', 2);
assert.deepEqual(api.targets.map(t => decodeURIComponent(t.url).match(/component = "([^"]+)"/)[1]), ['pwa_api_reader_${env}', 'pwa_api_command_${env}', 'oltp', 'olap']);
assert.deepEqual(api.fieldConfig.overrides.map(o => o.properties[0].value), ['Reader', 'Command', 'Chat data · live', 'Chat data · reports']);
// FINAL4-2: every fill that carries white text (stat backgrounds, coloured table cells, timeline lanes) gives at
// least 4.5:1 against Grafana's white in both themes (named colours resolve per theme).
const THEME_HEX = {'dark-red': ['#C4162A', '#AD0317'], 'dark-blue': ['#1F60C4', '#1250B0'], 'dark-green': ['#37872D', '#19730E'],
  green: ['#73BF69', '#56A64B'], orange: ['#FF9830', '#FF780A'], 'dark-orange': ['#FA6400', '#E55400'], blue: ['#5794F2', '#3274D9'], red: ['#F2495C', '#E02F44']};
const luminance = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = hex => (luminance('#F7F8FA') + 0.05) / (luminance(hex) + 0.05);
const fills = new Set();
const collect = cfg => {
  for (const m of cfg.mappings || []) for (const r of m.options && m.options.result ? [m.options.result] : Object.values(m.options || {})) if (r && r.color) fills.add(r.color);
  for (const step of (cfg.thresholds && cfg.thresholds.steps) || []) fills.add(step.color);
};
for (const uid of L.DASHBOARD_UIDS) for (const {panel: p} of allPanels(built[uid].spec)) {
  const filled = p.type === 'state-timeline' || (p.type === 'stat' && (p.options.colorMode || 'background').startsWith('background')) ||
    (p.type === 'table' && JSON.stringify(p.fieldConfig).includes('color-background'));
  if (!filled || p.pluginVersion) continue;
  collect(p.fieldConfig.defaults);
  for (const o of p.fieldConfig.overrides || []) collect(Object.fromEntries(o.properties.map(x => [x.id, x.value])));
}
for (const c of fills) {
  if (c === L.COLOR.info || c === 'transparent' || c === 'text') continue;
  for (const hex of THEME_HEX[c] || [c]) assert.ok(/^#[0-9A-F]{6}$/i.test(hex) && contrast(hex) >= 4.5, 'fill ' + c + ' (' + hex + ') gives ' + contrast(hex).toFixed(2) + ':1 with white text');
}
assert.ok(fills.has(L.COLOR.ok) && fills.has(L.COLOR.degraded) && fills.has(L.COLOR.down), 'state fills checked: ' + [...fills].join(', '));
// FINAL4-1: money and info text tiles carry no fill.
for (const [uid, id] of [['mw-cost', 8], ['mw-pwa', 33], ['mw-agent', 12], ['mw-agent', 15]]) assert.equal(panelOf(uid, id).options.colorMode, 'none', uid + ' ' + id + ' no fill');
for (const id of [1, 2, 3, 4, 9]) assert.ok(['value', 'none'].includes(panelOf('mw-cost', id).options.colorMode), 'mw-cost ' + id + ' money without a fill');
// FINAL4-3: nothing logged on PWA 3 is "None" in green.
assert.deepEqual(panelOf('mw-pwa', 3).fieldConfig.defaults.mappings[0].options.result, {text: 'None', color: L.COLOR.ok, index: 0});
// FINAL4-4: the backups table lists its six sources first and merges every row by Source.
const backupsTable = panelOf('mw-now', 19);
assert.equal(backupsTable.targets[0].source, 'inline');
assert.deepEqual(JSON.parse(backupsTable.targets[0].data).map(r => r.Source), ['Cloud SQL backup', 'Debian snapshot', 'Metabase daily', 'Metabase weekly', 'PITR archive', 'Audit retention']);
assert.deepEqual(backupsTable.targets[0].columns.map(c => c.text), ['Source']);
assert.equal(backupsTable.transformations[0].id, 'merge');

console.log(JSON.stringify({dashboards: L.DASHBOARD_UIDS.length, panels: L.DASHBOARD_UIDS.map(u => allPanels(built[u].spec).length),
  jqCompiled: jqAvailable ? compiled : 'skipped (jq not found)', passed: true}));
