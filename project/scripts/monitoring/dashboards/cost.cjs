/* Dashboard 5 · Cost (mw-cost): month to date, refresh 1 h; every current Cost panel survives. */
'use strict';
const L = require('./lib.cjs');
const {DS, COLOR, col, target, pos, byName, steps, valueMap, jq, COST} = L;

const SOURCE = 5; // Conversion and coverage hosts today's panel 2 queries A–E (visible, so they always run).
const sourceChain = () => structuredClone(L.findPanel(COST, 2).transformations);
const consumer = () => [{datasource: DS.dashboard, panelId: SOURCE, refId: 'A', withTransforms: false}];
const SGD = {unit: 'prefix:S$', decimals: 2};
const WINDOW = "usage_start_time >= TIMESTAMP('${__timeFrom:date:iso}') AND usage_start_time < TIMESTAMP('${__timeTo:date:iso}')";

function bigQueryBody(t, query) {
  const body = JSON.parse(t.url_options.data);
  body.query = query;
  return {...t.url_options, data: JSON.stringify(body)};
}
function replaceWindow(t, window) {
  const query = JSON.parse(t.url_options.data).query;
  if (!query.includes(WINDOW)) throw Error('BigQuery window not found in lifted query');
  return bigQueryBody(t, query.replace(WINDOW, window));
}

function source() {
  const p = L.lift(COST, 3, {id: SOURCE, gridPos: pos(19, 0, 5, 5), title: 'Coverage and FX', panelIds: {2: SOURCE}});
  const queries = L.findPanel(COST, 2).targets.map(t => structuredClone(t));
  p.datasource = DS.mixed;
  p.description = 'Query host for the top row: today\'s provider sums in SGD (Azure, GCP, Railway, ECB rate) and the GCP budget Budget-GCP read live from the Cloud Billing Budget API (monthly amount, name and scope: it covers the whole billing account, while GCP here is this project only; no such budget reads "no budget", never 0). ' + p.description;
  p.targets = [...queries,
    target('F', DS.gcp, BUDGET_URL, budgetCellSelector(),
      [col('Category', 'Category', 'string'), col('Budget', 'GCP budget', 'string')])];
  const filter = p.transformations.find(t => t.id === 'filterFieldsByName');
  filter.options.include.names.push('GCP budget', 'Coverage');
  const organize = p.transformations.find(t => t.id === 'organize');
  organize.options.indexByName['GCP budget'] = 5;
  organize.options.indexByName.Coverage = 6;
  // LIVE-11: which platforms answered, as a column of the coverage table (presence of each provider field).
  p.transformations.splice(p.transformations.indexOf(filter), 0, ...coverageTransforms());
  const missing = code => ['Azure', 'GCP', 'Railway'].filter((_, i) => !(code & (1 << i)));
  const coverage = Array.from({length: 8}, (_, code) => [code, code === 7 ? 'complete' : 'incomplete · missing ' + missing(code).join(', '), code === 7 ? COLOR.ok : COLOR.unknown]);
  p.fieldConfig.overrides = [...(p.fieldConfig.overrides || []), byName('Coverage', {unit: 'none', decimals: 0, color: {mode: 'fixed', fixedColor: COLOR.unknown},
    mappings: valueMap(coverage, 'incomplete'), noValue: 'incomplete', 'custom.cellOptions': {type: 'color-background', mode: 'basic'}})];
  return p;
}

// Presence per platform as copies weighted 1, 2 and 4, so one sum names what is missing.
function coverageTransforms() {
  const present = (alias, name) => ({id: 'calculateField', options: {alias, mode: 'reduceRow', reduce: {include: [name], reducer: 'count'}, replaceFields: false}});
  const weights = [['Azure', 1], ['GCP', 2], ['Railway', 4]];
  const names = weights.flatMap(([name, w]) => Array.from({length: w}, (_, i) => name + ' present ' + (i + 1)));
  return [
    ...weights.flatMap(([name, w]) => Array.from({length: w}, (_, i) => present(name + ' present ' + (i + 1), name))),
    {id: 'calculateField', options: {alias: 'Coverage', mode: 'reduceRow', reduce: {include: names, reducer: 'sum'}, replaceFields: false}}
  ];
}
function total() {
  const chain = sourceChain().filter(t => t.id !== 'filterFieldsByName' && t.id !== 'organize');
  return {
    id: 1, type: 'stat', title: 'TOTAL · month to date', gridPos: pos(0, 0, 4, 5),
    description: 'SGD. Available costs only: the sum of the platforms that answered (Azure and GCP for the selected dates, Railway for its billing cycle). The Coverage column of Coverage and FX turns grey and names the platform when one is missing; the total is then incomplete. The previous month\'s figure is the next panel.',
    datasource: DS.dashboard, targets: consumer(),
    transformations: [...chain,
      {id: 'calculateField', options: {alias: 'This month', mode: 'reduceRow', reduce: {include: ['Azure', 'GCP', 'Railway'], reducer: 'sum'}, replaceFields: false}},
      {id: 'filterFieldsByName', options: {include: {names: ['This month']}}}],
    fieldConfig: {defaults: {color: {fixedColor: 'yellow', mode: 'fixed'}, ...SGD, noValue: 'No data', thresholds: steps([null, COLOR.ok])},
      overrides: []},
    options: L.statOptions({colorMode: 'value', reduceOptions: {calcs: ['lastNotNull'], fields: '', values: false}, text: {titleSize: 12, valueSize: 22}})
  };
}

// Previous month to the same moment: today's panel 2 queries A, B, C and E with their own window, shifted
// by the panel's relative time now/M and time shift 1M (Azure Custom timePeriod, as A and B build it). The
// Azure guard keeps only rows of that month up to today's UTC day. Railway has no past-cycle figure.
function lastMonth() {
  const [azure, backup, gcp, , fx] = L.findPanel(COST, 2).targets.map(t => structuredClone(t));
  const guarded = (t, column) => ({...t, root_selector: jq('cost-prior-azure.jq'), columns: [col('Category', 'Category', 'string'), col('amount', column)]});
  for (const t of [azure, backup]) if (JSON.parse(t.url_options.data).timeframe !== 'Custom') throw Error('Azure query must keep its Custom window');
  return {
    id: 9, type: 'stat', title: 'Last month, same day', gridPos: pos(4, 0, 3, 5),
    description: 'SGD. Azure and GCP from the 1st of the previous month to the same moment of that month (relative time now/M shifted 1M), converted at the current ECB rate. Railway has no past-cycle figure (cycle only). A reference, not a forecast.',
    datasource: DS.mixed, timeFrom: 'now/M', timeShift: '1M', hideTimeOverride: true,
    targets: [guarded(azure, 'Azure compute USD'), guarded(backup, 'Azure backup USD'), gcp, fx],
    transformations: [{id: 'merge', options: {}},
      {id: 'calculateField', options: {alias: 'Azure USD', mode: 'reduceRow', reduce: {include: ['Azure compute USD', 'Azure backup USD'], reducer: 'sum'}, replaceFields: false}},
      {id: 'calculateField', options: {alias: 'Azure', binary: {left: 'Azure USD', operator: '*', right: 'SGD per USD'}, mode: 'binary', replaceFields: false}},
      {id: 'calculateField', options: {alias: 'Azure + GCP', mode: 'reduceRow', reduce: {include: ['Azure', 'GCP'], reducer: 'sum'}, replaceFields: false}},
      {id: 'filterFieldsByName', options: {include: {names: ['Azure + GCP']}}}],
    fieldConfig: {defaults: {color: {fixedColor: COLOR.unknown, mode: 'fixed'}, displayName: 'Azure + GCP', ...SGD, noValue: 'cycle only', thresholds: steps([null, COLOR.ok])}, overrides: []},
    options: L.statOptions({colorMode: 'value', reduceOptions: {calcs: ['lastNotNull'], fields: '', values: false}, text: {titleSize: 11, valueSize: 16}})
  };
}

function platform(oldId, id, x, title) {
  const p = L.lift(COST, oldId, {id, gridPos: pos(x, 0, 4, 5), title, panelIds: {2: SOURCE}});
  p.description = p.description.replace('Conversion and coverage are shown below.', 'Conversion and coverage: the Coverage and FX panel.');
  if (!p.description.includes('SGD')) throw Error('Platform panel ' + oldId + ' description lost its currency');
  p.targets = consumer();
  p.transformations = [...sourceChain(), ...p.transformations];
  return p;
}

/* COST-2 (owner decision): one stacked daily chart in SGD for the last 30 days, Azure + GCP + Railway.
 * Every query keys its rows by the Singapore date at 00:00 SGT (epoch ms) under one field Time, so the merge
 * transformation (as today's panel 2 merges on Category) puts one date on one row. Azure and Railway are
 * converted with the month-to-date tiles' rule: today's panel 2 query E (current ECB USD/SGD reference, one
 * rate for every day, repeated on each date row) and the same binary calculateField steps. A query that fails
 * leaves its field out, so the binary step that needs it adds no series and the panel shows the error badge;
 * nothing is drawn as zero for a failed provider. */
const DAILY_DAYS = 32; // FX and budget rows cover every Singapore date the 30-day window can touch.
const DAY_KEYS = 'def sgtdays: (now | ((. + 28800) / 86400 | floor) * 86400 - 28800) as $t | range(0; ' + DAILY_DAYS + ') | $t - . * 86400;\n';
const LAST_30_DAYS = "usage_start_time >= TIMESTAMP(DATE_SUB(CURRENT_DATE('Asia/Singapore'), INTERVAL 30 DAY), 'Asia/Singapore')";
const BUDGET = 'GCP budget (billing account) / day';
const DAILY_SERIES = [['Azure', '#5794F2'], ['GCP', '#FF9830'], ['Railway', '#B877D9']];
const BUDGET_URL = 'https://billingbudgets.googleapis.com/v1/billingAccounts/0125EC-78CB0F-A74AAD/budgets';
const budgetQuery = () => '(\n' + jq('budget.jq') + ')';
// Coverage and FX cell: "S$20.00 / month · Budget-GCP · whole billing account"; no Budget-GCP is "no budget", never 0.
function budgetCellSelector() {
  return 'def money: (. * 100 | round) as $c | ($c / 100 | floor) as $u | ($u | tostring) + "." + (($c - $u * 100) | tostring | if length < 2 then "0" + . else . end);\n' +
    budgetQuery() + ' |\n{Category: "Reported costs", Budget: (if .Kind == "specified" then "S$" + (.SGD | money) + " / month · " + .Name + " · " + .Scope ' +
    'elif .Kind == "last period" then "last period amount · " + .Name + " · " + .Scope else "no budget" end)}';
}
// Daily chart line: the monthly amount ÷ the days of each date's Singapore month; no row (no line) unless a fixed amount
// exists. The series is labelled billing account, so a budget narrowed to projects or services fails visibly instead.
function budgetLineSelector() {
  return DAY_KEYS + 'def monthdays: (. + 28800 | gmtime) as $g | ((([$g[0], $g[1] + 1, 1, 0, 0, 0, 0, 0] | mktime) - ([$g[0], $g[1], 1, 0, 0, 0, 0, 0] | mktime)) / 86400);\n' +
    budgetQuery() + ' as $b |\nif $b.Kind != "specified" then empty elif $b.Scope != "whole billing account" then error("GCP budget scope is " + $b.Scope + ", not the whole billing account") else sgtdays | {Time: (. * 1000), Budget: ($b.SGD / monthdays)} end';
}
function dailyCost() {
  const [azureCompute, azureBackup, , , fx] = L.findPanel(COST, 2).targets.map(t => structuredClone(t));
  for (const t of [azureCompute, azureBackup]) if (JSON.parse(t.url_options.data).timeframe !== 'Custom') throw Error('Azure query must keep its Custom window');
  // Same Custom timePeriod as the tiles; the panel's relative time 30d sets it to the last 30 days.
  const azure = (t, refId, name) => ({...t, refId,
    root_selector: 'if .properties.nextLink then error("Cost response truncated; shorten time range") elif (.properties.rows|type)!="array" then error("Azure cost response unavailable") elif any(.properties.rows[];.[3]!="USD") then error("Unexpected Azure currency") else\n' +
      '  [.properties.rows[] | {Time: (((((.[1]|tostring)|.[0:4]+"-"+.[4:6]+"-"+.[6:8]+"T00:00:00Z") | fromdateiso8601) - 28800) * 1000), USD: .[0]}] |\n' +
      '  group_by(.Time)[] | {Time: .[0].Time, USD: (map(.USD) | add)} end',
    columns: [col('Time', 'Time', 'timestamp_epoch'), col('USD', name)]});
  const g = L.liftTarget(COST, 201);
  const gcp = {...g, refId: 'C',
    root_selector: '[\n' + g.root_selector + '] | if any(.[]; .Currency != null and .Currency != "SGD") then error("Unexpected GCP currency") else\n' +
      '  map(select(.Net != null and .Date != null)) | group_by(.Date)[] | {Time: .[0].Date, GCP: (map(.Net) | add)} end',
    columns: [col('Time', 'Time', 'timestamp_epoch'), col('GCP', 'GCP')],
    url_options: replaceWindow(g, LAST_30_DAYS)};
  const r = L.liftTarget(COST, 305);
  const railway = {...r, refId: 'D', format: 'table', columns: [col('Time', 'Time', 'timestamp_epoch'), col('EstimatedUSD', 'Railway USD')]};
  const rate = {...fx, refId: 'E',
    root_selector: DAY_KEYS + '(\n' + fx.root_selector + '\n) | .FX as $fx | sgtdays | {Time: (. * 1000), FX: $fx}',
    columns: [col('Time', 'Time', 'timestamp_epoch'), col('FX', 'SGD per USD')]};
  const budget = target('F', DS.gcp, BUDGET_URL, budgetLineSelector(), [col('Time', 'Time', 'timestamp_epoch'), col('Budget', BUDGET)]);
  const binary = (alias, left, operator, right) => ({id: 'calculateField', options: {alias, binary: {left, operator, right}, mode: 'binary', replaceFields: false}});
  return L.timeseries({id: 6, title: 'Daily cost · 30 d', gridPos: pos(0, 5, 16, 9),
    description: 'SGD per Singapore date for the last 30 days, independent of the picker, stacked: Azure (blue, Cost Management, both resource groups, provider UTC days), GCP (orange, BigQuery billing export, net = cost + credits, same 100 MB billed-query cap) and Railway (purple, estimated compute + volume from published rates, current billing cycle only). Azure and Railway USD are converted at the current ECB USD/SGD reference rate shown in Coverage and FX, one rate for every day, as the month-to-date tiles do. A platform that cannot be read shows the panel error badge and draws no bars, never zero; a day a platform has not reported draws no bar. Red dashed line = the GCP budget Budget-GCP (Budget API, monthly SGD amount) ÷ the days of that month, drawn only when it has a fixed amount. The budget covers the whole billing account while the GCP bars are this project only (the export is filtered to clever-oasis-508610-n7), so the line is a reference, not like-for-like if another project bills to the account.',
    targets: [azure(azureCompute, 'A', 'Azure compute USD'), azure(azureBackup, 'B', 'Azure backup USD'), gcp, railway, rate, budget], datasource: DS.mixed,
    transformations: [{id: 'merge', options: {}},
      binary('Azure USD', 'Azure compute USD', '+', 'Azure backup USD'),
      binary('Azure', 'Azure USD', '*', 'SGD per USD'),
      binary('Railway', 'Railway USD', '*', 'SGD per USD'),
      {id: 'filterFieldsByName', options: {include: {names: ['Time', ...DAILY_SERIES.map(([name]) => name), BUDGET]}}},
      {id: 'organize', options: {indexByName: {Time: 0, Azure: 1, GCP: 2, Railway: 3, [BUDGET]: 4}}},
      {id: 'sortBy', options: {fields: {}, sort: [{desc: false, field: 'Time'}]}}],
    defaults: {...SGD, min: 0, noValue: 'No data', custom: {drawStyle: 'bars', fillOpacity: 80, lineWidth: 1, stacking: {group: 'A', mode: 'normal'}}},
    overrides: [...DAILY_SERIES.map(([name, color]) => byName(name, {color: {fixedColor: color, mode: 'fixed'}})),
      byName(BUDGET, {color: {fixedColor: 'red', mode: 'fixed'}, 'custom.drawStyle': 'line', 'custom.lineStyle': {dash: [10, 10], fill: 'dash'},
        'custom.fillOpacity': 0, 'custom.lineWidth': 2, 'custom.stacking': {group: 'A', mode: 'none'}})],
    // The merge fills a date a platform has not reported with null, which the binary steps turn into 0: keep those out of the tooltip.
    options: {tooltip: {hideZeros: true, mode: 'multi', sort: 'none'}},
    extra: {timeFrom: '30d'}});
}

function byService() {
  const t = structuredClone(L.findPanel(COST, 2).targets[2]);
  const category = "CASE WHEN STARTS_WITH(service.description,'Cloud SQL') THEN 'Cloud SQL' WHEN STARTS_WITH(service.description,'Cloud Run') THEN 'Cloud Run' " +
    "WHEN STARTS_WITH(service.description,'Vertex AI') THEN 'Vertex AI' WHEN service.description='Compute Engine' THEN 'Compute Engine' " +
    "WHEN STRPOS(service.description,'Monitoring')>0 OR STRPOS(service.description,'Logging')>0 THEN 'Cloud Monitoring and Logging' " +
    "WHEN STRPOS(service.description,'Network')>0 THEN 'Networking' WHEN STRPOS(service.description,'Firestore')>0 THEN 'Firestore' " +
    "WHEN service.description='Cloud Storage' THEN 'Cloud Storage' ELSE 'other' END";
  const query = "DECLARE export_table STRING;\nSET export_table=(SELECT table_name FROM `clever-oasis-508610-n7.mw_cloud_billing.INFORMATION_SCHEMA.TABLES` WHERE STARTS_WITH(table_name,'gcp_billing_export_resource_v1_') ORDER BY table_name LIMIT 1);\n" +
    "IF export_table IS NULL THEN\n SELECT CAST(NULL AS STRING) AS Service, CAST(NULL AS FLOAT64) AS Gross, CAST(NULL AS FLOAT64) AS Credits, 'SGD' AS Currency;\nELSE\n" +
    " EXECUTE IMMEDIATE FORMAT('''SELECT " + category + " AS Service, SUM(cost) AS Gross, SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c),0)) AS Credits, currency AS Currency " +
    "FROM `clever-oasis-508610-n7.mw_cloud_billing.%s` WHERE project.id='clever-oasis-508610-n7' AND " + WINDOW + " GROUP BY Service, Currency''',export_table);\nEND IF;";
  if (query.replace(/%s/g, '').includes('%')) throw Error('Unescaped % inside FORMAT');
  return L.table({id: 7, title: 'GCP by service · net', gridPos: pos(16, 5, 8, 9),
    description: 'SGD. BigQuery billing export for the selected dates grouped by service: cost before credits per service (Vertex AI is the variable line) and one Credits row, so the total is the net cost. Same 100 MB billed-query cap; a missing export shows no rows, not zero.',
    targets: [{...t, refId: 'A', root_selector: jq('gcp-by-service.jq'), columns: [col('Service', 'Service', 'string'), col('SGD', 'SGD')], url_options: bigQueryBody(t, query)}],
    defaults: {...SGD, noValue: 'No data'},
    options: {footer: {countRows: false, fields: ['SGD'], reducer: ['sum'], show: true}}});
}

// NOW-12: one-line source descriptions for the lifted provider panels that had none.
const DESCRIPTIONS = {
  102: 'Sum of the Azure daily resource detail below (Cost Management, USD) for the selected dates.',
  103: 'Azure Cost Management daily cost (USD) from the daily resource detail below, by provider UTC day.',
  104: 'Azure cost per resource (USD) for the selected dates, from the daily resource detail below.',
  202: 'GCP billing export (BigQuery) cost before credits, SGD, from the daily resource detail below.',
  203: 'GCP credits (SGD) from the billing export daily resource detail below.',
  204: 'GCP net cost (cost + credits, SGD) from the billing export daily resource detail below.',
  205: 'How the GCP billing export is read and why a missing export shows no data, not zero.',
  302: 'Railway accrued resource usage (USD) for the current billing cycle, from the billing period table.',
  301: 'Railway workspace billing period and accrued usage (GraphQL API), current cycle only.',
  303: 'How the Railway estimate is built from published rates.'
};
// Collapsed provider rows: today's panels unchanged, moved under their row with relative positions kept.
function providerRow(id, title, y, oldRowId, ids) {
  const oldRow = L.findPanel(COST, oldRowId);
  const children = ids.map(old => {
    const p = L.findPanel(COST, old);
    return L.lift(COST, old, {id: old, gridPos: pos(p.gridPos.x, y + 1 + p.gridPos.y - oldRow.gridPos.y - 1, p.gridPos.w, p.gridPos.h),
      title: p.title, panelIds: {101: 101, 201: 201, 301: 301}});
  }).map(p => (p.description ? p : {...p, description: DESCRIPTIONS[p.id]}));
  return L.row({id, title, gridPos: pos(0, y, 24, 1), collapsed: true, panels: children});
}

function rules() {
  return L.text({id: 40, title: 'Unchanged rules of reading', gridPos: pos(0, 14, 24, 6),
    description: 'How to read every figure on this dashboard: Azure keeps provider UTC days (08:00 Singapore), GCP groups by Singapore date and Railway always shows its current cycle, so the top row is not a common-period invoice. Refresh hourly; frequent manual refreshes can reach provider limits.',
    content: 'Cost data is delayed and provisional, no data is not zero spending, and the top row combines provider periods (Azure UTC days, GCP Singapore dates, Railway cycle), so it is not an invoice. There is no forecast: the previous-month figure and the budget line are references; refresh hourly.'});
}

function build() {
  return L.dashboard({uid: 'mw-cost', description: 'Cloud spending month to date in SGD with every provider detail in collapsed rows.',
    time: {from: 'now/M', to: 'now'}, refresh: '1h',
    timepicker: {refresh_intervals: ['1h', '2h', '1d']},
    panels: [total(), lastMonth(), platform(5, 2, 7, 'Azure'), platform(6, 3, 11, 'GCP'), platform(7, 4, 15, 'Railway'), source(), dailyCost(), byService(),
      rules(),
      providerRow(10, L.findPanel(COST, 306).title, 20, 306, [102, 103, 104, 101, 110]),
      providerRow(20, L.findPanel(COST, 307).title, 21, 307, [202, 203, 204, 205, 207, 206, 201]),
      providerRow(30, L.findPanel(COST, 308).title, 22, 308, [302, 301, 303, 304, 305])]});
}
module.exports = {build, SOURCE};
