/* Shared pieces of the R089 dashboard builder: constants, Cloud Monitoring URL
 * template, Infinity targets, state mappings, jq selector loading and lift() of
 * proven panels from the current canonical dashboards. No dependencies. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MONITORING_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(MONITORING_DIR, '..', '..', '..');
const DASHBOARD_DIR = path.join(REPO_ROOT, 'infrastructure', 'grafana', 'dashboards');

const PROJECT = 'clever-oasis-508610-n7';
const INSTANCE_ID = '8223265527494214160';
const SQL_INSTANCE = 'mw-credit-pg-20261017';
const SQL_DATABASE_ID = PROJECT + ':' + SQL_INSTANCE;
const WEBHOOK_CHECK_ID = 'mw-webhook-external-health-ySLl0784KgI';
// Confirmed by Forge's live read of one uptime_check/check_passed series (22 Oct 2026).
const UPTIME_SINGAPORE_LOCATION = 'apac-singapore';
// Confirmed by Forge's live read: cloudscheduler attempt_count is not written in this
// project; attempts come from the log-based counter mw_scheduler_attempts_<env>, whose
// labels are status (empty on success, e.g. UNAVAILABLE on failure) and http_status.
const SCHEDULER_ATTEMPT_METRIC = 'logging.googleapis.com/user/mw_scheduler_attempts_';
const SCHEDULER_STATUS_LABEL = 'status';
const SCHEDULER_HTTP_LABEL = 'http_status';
// Confirmed by Forge's live read of one num_backends series: label metric.labels.database.
const NUM_BACKENDS_DATABASE_LABEL = 'database';
// Alerts folder "MW Resource Monitoring Alerts", confirmed by Forge's live read.
const ALERT_FOLDER_UID = 'f9w88d';
// Log-based metrics are declared per environment stack with this suffix.
const LOG_METRIC = 'logging.googleapis.com/user/';

const STALE_SECONDS = 360;
const ALIGNED_STALE_SECONDS = 720;
const DASHBOARD_UIDS = ['mw-now', 'mw-pwa', 'mw-agent', 'mw-infra', 'mw-cost'];
const DASHBOARD_TITLES = {
  'mw-now': 'Now', 'mw-pwa': 'PWA & APIs', 'mw-agent': 'Agent & Receipts',
  'mw-infra': 'Infrastructure', 'mw-cost': 'Cost'
};

const INFINITY = 'yesoreyeram-infinity-datasource';
const DS = {
  gcp: {type: INFINITY, uid: 'mw-gcp-monitoring'},
  azure: {type: INFINITY, uid: 'mw-azure-monitoring'},
  railway: {type: INFINITY, uid: 'mw-railway-monitoring'},
  publicStatus: {type: INFINITY, uid: 'cfz10a9eaokjkd'}, // mw-public-status, credential-free
  fx: {type: INFINITY, uid: 'efz19dcu6cwzka'},
  gcpStatus: {type: INFINITY, uid: 'mw-public-gcp-status'},
  dashboard: {type: 'datasource', uid: '-- Dashboard --'},
  mixed: {type: 'mixed', uid: '-- Mixed --'}
};
const ALLOWED_DATASOURCE_UIDS = [
  'mw-gcp-monitoring', 'mw-azure-monitoring', 'mw-railway-monitoring', 'cfz10a9eaokjkd',
  'efz19dcu6cwzka', 'mw-public-gcp-status', '-- Dashboard --', '-- Mixed --', '-- Grafana --'
];
const ALLOWED_URL_HOSTS = [
  'monitoring.googleapis.com', 'bigquery.googleapis.com', 'management.azure.com',
  'backboard.railway.com', 'status.openai.com', 'api.frankfurter.dev', 'status.cloud.google.com', 'railway.instatus.com',
  'billingbudgets.googleapis.com'
];

const FROM = '${__timeFrom:date:iso}';
/* LEFT-EDGE: state-timeline rows read from 20 minutes before the range start (one 300 s alignment period
 * plus 15 minutes), so the state at the start is known; range-start.jq then carries it to exactly the start.
 * Grafana has no time arithmetic in URLs, so the hidden variable lookback_from computes the start in jq
 * from ${__from} and refreshes on every time range change (and so on every auto refresh). */
const LOOKBACK_SECONDS = 1200;
const LOOKBACK_FROM = '${lookback_from}';
// Scheduler rows of hourly and daily jobs hold a state up to 65 min or 25 h, so they read further back.
const LOOKBACKS = {lookback_from: LOOKBACK_SECONDS, lookback_hour: 4800, lookback_day: 93600};
const RANGE_START = '(${__from} / 1000 | ceil)';
const TO = '${__timeTo:date:iso}';
const CHART_PERIOD = '$__customInterval(2d,300s,14d,3600s,86400s)';
const MONITORING_BASE = 'https://monitoring.googleapis.com/v3/projects/' + PROJECT + '/timeSeries';

// State colours (CVD review): Down dark-red, OK green, Degraded orange, Paused blue, Unknown fixed grey.
// FINAL4-2 (Echo v11): fills carry white text in both themes, so each must give at least 4.5:1 against
// Grafana's white (#F7F8FA) in both. Grafana's named greens and oranges resolve per theme and fall short
// (green 2.1:1 dark / 2.8:1 light, dark-orange 2.9 / 3.5), so OK and Degraded are fixed hex shades of the same
// hues: OK #2E7D32 4.8:1, Degraded #A65200 5.2:1; Down dark-red 5.7:1 dark / 7.1:1 light; Paused dark-blue
// 5.6 / 7.1; Unknown #6E7079 4.6. Fixed hex is the same in both themes.
// info: informational values carry no state colour (blue means Paused); transparent keeps the theme text.
const COLOR = {down: 'dark-red', ok: '#2E7D32', degraded: '#A65200', paused: 'dark-blue', unknown: '#6E7079', purple: 'purple', info: 'transparent', text: 'text'};
const STATE_TEXT = ['Down', 'OK', 'Degraded', 'Paused', 'Unknown'];
const STATE_COLORS = [COLOR.down, COLOR.ok, COLOR.degraded, COLOR.paused, COLOR.unknown];

// nullText null: no word for null, so a timeline draws no data as an empty gap (TIMELINE-GAP).
function stateMappings(texts = STATE_TEXT, nullText = 'Unknown') {
  const m = [{type: 'value', options: Object.fromEntries(texts.map((text, i) => [String(i), {text, color: STATE_COLORS[i], index: i}]))}];
  if (nullText) m.push({type: 'special', options: {match: 'null', result: {text: nullText, color: COLOR.unknown, index: 5}}});
  return m;
}
function valueMap(entries, nullText) {
  const m = [{type: 'value', options: Object.fromEntries(entries.map(([v, text, color], i) => [String(v), {text, color, index: i}]))}];
  if (nullText) m.push({type: 'special', options: {match: 'null', result: {text: nullText, color: COLOR.unknown, index: entries.length}}});
  return m;
}
/* COLOUR-1 (owner policy): colour only where it carries meaning; the same metric has the same colour on
 * every page. Classes (POLICY below lists every stat field):
 *   state    OK / Down / Degraded / Paused words on their state background (Unknown grey, no data grey);
 *   problem  green at 0, red above when something is broken now, orange above for counts over a period
 *            that need attention (failures in 24 h, request errors in the range, open reviews);
 *   work     normal-work counts and volumes: neutral, coloured only through a documented age or limit;
 *   age      ages with a documented limit: green within, orange past the limit (the alert value), grey stale;
 *   money    neutral (the live budget comparison would need the budget in the same query; not done);
 *   info     provider and model, uptime, budget text, ages without a documented limit: neutral. */
const NEUTRAL = {mode: 'fixed', fixedColor: COLOR.info};
function problemColor(level = 'red') {
  return {color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.ok], [1, level === 'red' ? COLOR.down : COLOR.degraded])};
}
function ageColor(limit) {
  return {color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.ok], [limit, COLOR.degraded])};
}
// State-coded text "<code>|<text>" (pipeline stages): the text shown on its state colour.
function codedMappings(nullText = '—') {
  return [...STATE_COLORS.map((color, code) => ({type: 'regex', options: {pattern: '^' + code + '\\|(.*)$', result: {text: '$1', color, index: code}}})),
    {type: 'special', options: {match: 'null', result: {text: nullText, color: COLOR.unknown, index: 5}}}];
}
const POLICY = {
  // A name used for two metrics is qualified by its panel title ("Provider status › Railway" vs the Cost tile Railway).
  state: ['Service', 'Reader', 'Command', 'Chat data · live', 'Chat data · reports', 'Hosting', 'Provider status › Railway',
    'Providers · status › Railway', 'Google Cloud',
    'Last turn', 'Poll state', 'Wake path', 'Worker timer', 'Code version', '1 · Scan · last run', 'Group scan · last run'],
  problem: ['Undelivered', 'Stuck', 'Failed · 24 h', 'Failed', 'Timed out', 'Unreadable', 'Grounding rejections', 'Open ingress reviews', '503 · session check unavailable',
    '503 · body timeout', '5xx · all services', '3 · Validate · holds', 'Validation holds', '4 · Review · overdue', '5 · Post · unconfirmed',
    'Posting unconfirmed', '6 · Notify · failed', 'Notify failures'],
  work: ['Pending', 'Sent · 24 h', 'Turns', 'Verified', 'Median turn', 'Median rounds', 'Extractions', 'Valid', '401 · session invalid', '2 · Extract · waiting', 'Extraction waiting', 'Reviews waiting'],
  age: ['Daily charges', 'Recent analytics', 'Notify job · last run', 'Oldest pending', 'Poll age'],
  // Lifted Cost detail tiles without a named field are classed by their title.
  money: ['This month', 'Azure', 'GCP', 'Railway', 'Azure + GCP', 'UsageUSD', 'Azure · selected-range cost', 'GCP · before credits (SGD)',
    'GCP · credits (SGD)', 'GCP · net cost (SGD)'],
  info: ['Provider', 'Running for', 'Uptime', 'GCP budget', 'Last turn age', 'Last send', 'Last notification']
};
function nullMap(text) {
  return {type: 'special', options: {match: 'null', result: {text, color: COLOR.unknown, index: 0}}};
}
function steps(...pairs) {
  // steps([null,'green'],[160,'red']) -> threshold steps; base first.
  return {mode: 'absolute', steps: pairs.map(([value, color]) => ({color, value}))};
}

function encodeFilter(filter) {
  // Keep Grafana ${variables} literal so the dashboard interpolates them.
  return encodeURIComponent(filter).replace(/%24%7B([A-Za-z0-9_:]+)%7D/g, '${$1}');
}
function monitoringUrl(filter, {aligner, reducer, period = CHART_PERIOD, groupBy = [], start = FROM} = {}) {
  let url = MONITORING_BASE + '?filter=' + encodeFilter(filter) + '&interval.startTime=' + start + '&interval.endTime=' + TO;
  if (aligner) {
    url += '&aggregation.alignmentPeriod=' + period + '&aggregation.perSeriesAligner=' + aligner;
    if (reducer) url += '&aggregation.crossSeriesReducer=' + reducer;
    for (const field of groupBy) url += '&aggregation.groupByFields=' + encodeURIComponent(field);
  }
  return url + '&pageSize=100000';
}
function labelClause(key, value) {
  const v = Array.isArray(value) ? 'one_of(' + value.map(x => '"' + x + '"').join(',') + ')' : '"' + value + '"';
  return ' AND metric.labels.' + key + ' = ' + v;
}
function customFilter(metric, labels = {}) {
  return 'metric.type = "custom.googleapis.com/mw_resource_monitoring/' + metric + '" AND resource.labels.instance_id = "' + INSTANCE_ID + '"' +
    Object.entries(labels).map(([k, v]) => labelClause(k, v)).join('');
}
function sqlFilter(metricType, labels = {}) {
  return 'metric.type = "' + metricType + '" AND resource.labels.database_id = "' + SQL_DATABASE_ID + '"' +
    Object.entries(labels).map(([k, v]) => labelClause(k, v)).join('');
}

function col(selector, text, type = 'number') {
  return {selector, text, type};
}
function target(refId, datasource, url, selector, columns, {format = 'table', options} = {}) {
  return {columns, datasource, format, parser: 'jq-backend', refId, root_selector: selector,
    source: 'url', type: 'json', url, url_options: options || {method: 'GET'}};
}
function inlineTarget(refId, datasource, data, selector, columns, format = 'table') {
  return {columns, data: typeof data === 'string' ? data : JSON.stringify(data), datasource, format,
    parser: 'jq-backend', refId, root_selector: selector, source: 'inline', type: 'json', url: '', url_options: {method: 'GET'}};
}

const jqCache = new Map();
function jq(file, substitutions = {}) {
  if (!jqCache.has(file)) jqCache.set(file, fs.readFileSync(path.join(MONITORING_DIR, file), 'utf8'));
  let text = jqCache.get(file);
  for (const [key, value] of Object.entries(substitutions)) {
    const token = '__' + key + '__';
    if (!text.includes(token)) throw Error(file + ' has no placeholder ' + token);
    text = text.split(token).join(typeof value === 'string' ? value : JSON.stringify(value));
  }
  const left = text.match(/__[A-Z_]+__/);
  if (left) throw Error(file + ' placeholder left: ' + left[0]);
  return text;
}
// Selectors from the existing builders, instantiated exactly as payment-dashboard.js does.
function receiptFields(fields) {
  return '[ ' + jq('receipt-pipeline.jq', {FIELDS: fields.map(([key, label]) => ({key, label}))}) +
    ' ] | map({key:.key,value:.value}) | from_entries';
}
function stateSelector(expected = 1, stale = STALE_SECONDS) {
  return jq('state-timeline.jq', {EXPECTED: String(expected), STALE: String(stale)});
}
// A state-timeline row selector: its events clipped to start exactly at the range start (range-start.jq).
function rowSelector(selector, stale) {
  return jq('range-start.jq', {FROM: RANGE_START, STALE: String(stale), SELECTOR: selector});
}
function lookbackVariable(name = 'lookback_from') {
  const seconds = LOOKBACKS[name];
  return {current: {}, datasource: DS.gcp, definition: 'range start - ' + seconds / 60 + ' min', hide: 2, includeAll: false,
    label: 'State query start', multi: false, name, options: [],
    query: {infinityQuery: {columns: [col('value', 'value', 'string')], data: '{}', format: 'table', parser: 'jq-backend', refId: 'variable',
      root_selector: '{value: ((${__from} / 1000 | floor) - ' + seconds + ' | todateiso8601)}', source: 'inline', type: 'json', url: '',
      url_options: {method: 'GET'}}, queryType: 'infinity', refId: 'variable'},
    refresh: 2, regex: '', skipUrlSync: true, sort: 0, type: 'query'};
}

/* lift(): copy a proven panel from the current canonical dashboard JSON. The copy is
 * deep; only id, gridPos and title are replaced, every '-- Dashboard --' target's
 * panelId is remapped through `panelIds` (old id -> new id), failing on any id the
 * map does not cover so no reference can dangle, and a multi-query timeseries gets one
 * displayName override per query (nameQueries). Queries stay byte for byte. */
const sources = new Map();
function canonical(file) {
  if (!sources.has(file)) sources.set(file, JSON.parse(fs.readFileSync(path.join(DASHBOARD_DIR, file), 'utf8')).spec);
  return sources.get(file);
}
function findPanel(file, id) {
  for (const panel of canonical(file).panels) {
    if (panel.id === id) return panel;
    for (const child of panel.panels || []) if (child.id === id) return child;
  }
  throw Error('Panel ' + id + ' not found in ' + file);
}
// Links of lifted panels that open a retiring dashboard are repointed to `linkTo`
// (a new dashboard or panel); a lifted old-dashboard link without one fails the build.
const OLD_DASHBOARD_LINK = /\/d\/(mw-resource-performance|mw-resource-cost|mw-pwa-platform)\b[^"]*/;
function repointLinks(value, linkTo, where) {
  if (Array.isArray(value)) { value.forEach(v => repointLinks(v, linkTo, where)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) {
    if (key === 'url' && typeof v === 'string' && OLD_DASHBOARD_LINK.test(v)) {
      if (!linkTo) throw Error('Lifted panel ' + where + ' links to a retiring dashboard: ' + v);
      value[key] = linkTo;
    } else repointLinks(v, linkTo, where);
  }
}
function lift(file, id, {id: newId, gridPos, title, panelIds = {}, linkTo} = {}) {
  const panel = structuredClone(findPanel(file, id));
  repointLinks({links: panel.links, fieldConfig: panel.fieldConfig, options: panel.options}, linkTo, file + '#' + id);
  delete panel.id; delete panel.gridPos;
  if (title !== undefined) delete panel.title;
  for (const t of panel.targets || []) {
    if (t.panelId === undefined) continue;
    if (!(t.panelId in panelIds)) throw Error('Unmapped panelId ' + t.panelId + ' in lifted panel ' + id);
    t.panelId = panelIds[t.panelId];
  }
  nameQueries(panel);
  if (panel.type === 'stat' || panel.type === 'table') recolorStates(panel.fieldConfig);
  return {id: newId, gridPos, ...(title !== undefined ? {title} : {}), ...panel};
}
// FINAL4-2: a lifted tile's state words take the contrast-safe fills (their named colours are too light for
// white text); only value-mapping results and threshold steps change, never chart series colours.
const FILL_OF = {green: COLOR.ok, 'semi-dark-green': COLOR.ok, orange: COLOR.degraded, 'semi-dark-orange': COLOR.degraded,
  red: COLOR.down, 'semi-dark-red': COLOR.down, blue: COLOR.paused, gray: COLOR.unknown, grey: COLOR.unknown};
function recolorStates(fieldConfig) {
  const fix = c => FILL_OF[c] || c;
  for (const config of [fieldConfig.defaults, ...(fieldConfig.overrides || []).flatMap(o => o.properties.filter(p => p.id === 'mappings' || p.id === 'thresholds').map(p => ({[p.id]: p.value})))]) {
    for (const m of config.mappings || []) {
      if (m.options && m.options.result) m.options.result.color = fix(m.options.result.color);
      else for (const o of Object.values(m.options || {})) if (o && o.color) o.color = fix(o.color);
    }
    for (const step of (config.thresholds && config.thresholds.steps) || []) step.color = fix(step.color);
  }
}
/* RECHECK-2: a multi-query timeseries otherwise shows each series as "<refId> <name>" (A Used, B Cache).
 * Each query gets its own displayName from its value column; queries stay unchanged. Overrides are
 * matched on the original field name, so the proven colour and limit overrides still apply. */
function queryName(t) {
  const values = (t.columns || []).filter(c => !/^timestamp/.test(c.type));
  return values.length === 1 ? values[0].text : null;
}
function joinsFrames(panel) {
  return (panel.transformations || []).some(t => t.id === 'joinByField' || t.id === 'merge');
}
function nameQueries(panel) {
  const targets = panel.targets || [];
  if (panel.type !== 'timeseries' || targets.length < 2) return panel;
  // Joined panels draw one frame: series names are its field names, so a per-query name would rename them all.
  if (joinsFrames(panel)) return panel;
  panel.fieldConfig = panel.fieldConfig || {defaults: {}, overrides: []};
  const overrides = panel.fieldConfig.overrides || [];
  const named = new Set(overrides.filter(o => o.matcher.id === 'byFrameRefID' && o.properties.some(p => p.id === 'displayName')).map(o => o.matcher.options));
  for (const t of targets) {
    const name = queryName(t);
    if (name && !named.has(t.refId)) overrides.push({matcher: {id: 'byFrameRefID', options: t.refId}, properties: [{id: 'displayName', value: name}]});
  }
  panel.fieldConfig.overrides = overrides;
  return panel;
}
function liftTarget(file, id, refId = 'A') {
  const t = findPanel(file, id).targets.find(x => x.refId === refId);
  if (!t) throw Error('Target ' + refId + ' not found in panel ' + id);
  return structuredClone(t);
}
const PERF = 'mw-resource-performance.json';
const COST = 'mw-resource-cost.json';
const PWA_PLATFORM = 'mw-pwa-platform.json';
// The proven numeric chart selector (Performance panel 4, PWA Platform builder).
function numericSelector() {
  return liftTarget(PERF, 4).root_selector;
}

function pos(x, y, w, h) {
  return {h, w, x, y};
}

// Five explicit links in a fixed order (Echo LINK-1..3): no tag query, no time or variables carried. A page's
// own extra links (the PWA environment switch) follow them, so the five keep their place on every page.
function linkBar(extra = []) {
  return [...DASHBOARD_UIDS.map(uid => ({asDropdown: false, icon: 'dashboard', includeVars: false, keepTime: false,
    tags: [], targetBlank: false, title: DASHBOARD_TITLES[uid], tooltip: '', type: 'link', url: '/d/' + uid})), ...extra];
}

/* READ-1 (owner review): larger text. Stat names 16 px and values 32 px; several values are listed as rows
 * (orientation horizontal), each row name left (wrapping onto two lines when needed) and value right. Text
 * tiles (provider and model, budget) use 20 px values so long ids fit a phone. Tables use the md row height.
 * Grafana has no font size for table cells, timeline row labels, legends or axes. */
const STAT_TEXT = {titleSize: 16, valueSize: 32};
const TEXT_TILE = {titleSize: 16, valueSize: 20};
const SINGLE_VALUE = {textMode: 'value', text: STAT_TEXT};
function readable(panel) {
  if (panel.type === 'stat') {
    const t = (panel.options || {}).text || {};
    const tile = t.titleSize === TEXT_TILE.titleSize && t.valueSize === TEXT_TILE.valueSize;
    panel.options = {...panel.options, text: tile ? t : {titleSize: Math.max(t.titleSize || 0, STAT_TEXT.titleSize), valueSize: Math.max(t.valueSize || 0, STAT_TEXT.valueSize)}};
  }
  if (panel.type === 'table') panel.options = {...panel.options, cellHeight: 'md'};
  for (const child of panel.panels || []) readable(child);
  return panel;
}

function dashboard({uid, title, description, time, refresh, panels, templating = [], timepicker, links = []}) {
  panels.forEach(readable);
  const used = JSON.stringify(panels);
  for (const name of Object.keys(LOOKBACKS)) if (used.includes('${' + name + '}')) templating = [...templating, lookbackVariable(name)];
  return {
    apiVersion: 'dashboard.grafana.app/v1beta1',
    kind: 'Dashboard',
    spec: {
      annotations: {list: [{builtIn: 1, datasource: {type: 'grafana', uid: '-- Grafana --'}, enable: true, hide: true,
        iconColor: 'rgba(0, 211, 255, 1)', name: 'Annotations & Alerts', type: 'dashboard'}]},
      description,
      editable: false,
      fiscalYearStartMonth: 0,
      graphTooltip: 1,
      links: linkBar(links),
      liveNow: false,
      panels,
      preload: false,
      refresh,
      schemaVersion: 42,
      tags: ['mw-credit'],
      templating: {list: templating},
      time,
      timepicker: timepicker || {refresh_intervals: ['1m', '2m', '5m', '15m', '1h']},
      timezone: 'Asia/Bangkok',
      title: 'MW Credit · ' + DASHBOARD_TITLES[uid]
    }
  };
}

/* Panel helpers. Every panel carries a title and a one-line description naming its source. */
function laneAxisWidth(names) {
  return Math.ceil((Math.max(...names.map(n => n.length)) * 7.2 + 16 + 8) / 10) * 10;
}
function stateTimeline({id, title, description, gridPos, rows, noValue = 'No report'}) {
  return {
    id, type: 'state-timeline', title, description, gridPos,
    datasource: rows.every(r => r.datasource === rows[0].datasource) ? rows[0].datasource : DS.mixed,
    targets: rows.map((r, i) => target(String.fromCharCode(65 + i), r.datasource, r.url, r.selector,
      [col('time', 'Time', 'timestamp'), col('value', r.name)], {format: 'timeseries'})),
    fieldConfig: {
      // Fixed grey base: the value mappings supply colour and word (thresholds colour hides them with mergeValues).
      // FINAL2-1: a fixed label axis as wide as the longest lane name (12 px text), so no name is cut.
      defaults: {color: {mode: 'fixed', fixedColor: COLOR.unknown}, displayName: '${__field.name}', custom: {axisWidth: laneAxisWidth(rows.map(r => r.name)),
        fillOpacity: 80, hideFrom: {legend: false, tooltip: false, viz: false},
        insertNulls: false, lineWidth: 0, spanNulls: false}, mappings: stateMappings(STATE_TEXT, null), noValue,
        thresholds: steps([null, COLOR.unknown])},
      overrides: rows.map((r, i) => ({matcher: {id: 'byFrameRefID', options: String.fromCharCode(65 + i)},
        properties: [{id: 'displayName', value: r.name}]}))
    },
    options: {alignValue: 'left', legend: {displayMode: 'list', placement: 'bottom', showLegend: false},
      mergeValues: true, rowHeight: 0.8, showValue: 'auto', tooltip: {hideZeros: false, mode: 'single', sort: 'none'}}
  };
}
function statOptions(extra = {}) {
  return {colorMode: 'background', graphMode: 'none', justifyMode: 'auto', orientation: 'horizontal',
    percentChangeColorMode: 'standard', reduceOptions: {calcs: ['lastNotNull'], fields: '', values: false},
    showPercentChange: false, text: STAT_TEXT, textMode: 'value_and_name', wideLayout: true, ...extra};
}
function stat({id, title, description, gridPos, targets, datasource, defaults = {}, overrides = [], options = {}, transformations, timeFrom, hideTimeOverride}) {
  const panel = {id, type: 'stat', title, description, gridPos, ...(timeFrom ? {timeFrom, hideTimeOverride: hideTimeOverride === true} : {}),
    datasource: datasource || (targets.every(t => t.datasource.uid === targets[0].datasource.uid) ? targets[0].datasource : DS.mixed),
    targets,
    fieldConfig: {defaults: {color: {mode: 'thresholds'}, decimals: 0, displayName: '${__field.name}', mappings: [], noValue: 'No report',
      thresholds: steps([null, COLOR.ok]), unit: 'none', ...defaults}, overrides},
    options: statOptions(options)};
  if (transformations) panel.transformations = transformations;
  return panel;
}
function byName(name, properties) {
  return {matcher: {id: 'byName', options: name}, properties: Object.entries(properties).map(([id, value]) => ({id, value}))};
}
function byRef(refId, properties) {
  return {matcher: {id: 'byFrameRefID', options: refId}, properties: Object.entries(properties).map(([id, value]) => ({id, value}))};
}
// Ages in seconds: unit s with one decimal, so Grafana shows one auto-scaled unit ("2.1 min", "9.1 hour").
const AGE = {unit: 's', decimals: 1};

function timeseriesDefaults(extra = {}, custom = {}) {
  return {color: {mode: 'palette-classic'}, custom: {axisBorderShow: false, axisPlacement: 'auto', barAlignment: 0,
    drawStyle: 'line', fillOpacity: 10, gradientMode: 'none', hideFrom: {legend: false, tooltip: false, viz: false},
    insertNulls: false, lineInterpolation: 'linear', lineWidth: 2, pointSize: 4, scaleDistribution: {type: 'linear'},
    showPoints: 'never', spanNulls: false, stacking: {group: 'A', mode: 'none'}, thresholdsStyle: {mode: 'off'}, ...custom},
    decimals: 0, displayName: '${__field.name}', noValue: 'No data', thresholds: steps([null, COLOR.ok]), unit: 'short', ...extra};
}
// INFRA-1: a dashed threshold line only, base step transparent.
function dashedLine(value, color = 'red') {
  return {custom: {thresholdsStyle: {mode: 'dashed'}}, thresholds: steps([null, 'transparent'], [value, color])};
}
function timeseries({id, title, description, gridPos, targets, defaults = {}, overrides = [], datasource, options = {}, transformations, extra = {}}) {
  const d = timeseriesDefaults();
  const custom = {...d.custom, ...(defaults.custom || {})};
  const panel = {id, type: 'timeseries', title, description, gridPos,
    datasource: datasource || (targets.every(t => t.datasource.uid === targets[0].datasource.uid) ? targets[0].datasource : DS.mixed),
    targets, fieldConfig: {defaults: {...d, ...defaults, custom}, overrides},
    options: {legend: {calcs: [], displayMode: 'list', placement: 'bottom', showLegend: true},
      tooltip: {hideZeros: false, mode: 'multi', sort: 'desc'}, ...options}, ...extra};
  if (transformations) panel.transformations = transformations;
  return nameQueries(panel);
}
function table({id, title, description, gridPos, targets, defaults = {}, overrides = [], transformations, datasource, options = {}}) {
  return {id, type: 'table', title, description, gridPos,
    datasource: datasource || (targets.every(t => t.datasource.uid === targets[0].datasource.uid) ? targets[0].datasource : DS.mixed),
    targets,
    fieldConfig: {defaults: {color: {mode: 'thresholds'}, custom: {align: 'auto', cellOptions: {type: 'auto'},
      footer: {reducers: []}, inspect: false}, decimals: 0, displayName: '${__field.name}', mappings: [], noValue: 'No report',
      thresholds: steps([null, COLOR.ok]), unit: 'none', ...defaults}, overrides},
    options: {cellHeight: 'sm', showHeader: true, ...options},
    transformations: transformations || []};
}
function row({id, title, gridPos, collapsed = false, panels = []}) {
  return {collapsed, gridPos, id, panels, title, type: 'row'};
}
function text({id, title, description, gridPos, content}) {
  return {id, type: 'text', title, description, gridPos, options: {code: {language: 'plaintext', showLineNumbers: false, showMiniMap: false}, content, mode: 'markdown'}};
}

/* Recursively sort object keys so the generated files are stable and diff cleanly
 * (Grafana exports are key-sorted; lifted panels are unchanged by it). */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, sortKeys(value[k])]));
  }
  return value;
}
function serialize(d) {
  return JSON.stringify(sortKeys(d), null, 2) + '\n';
}

/* State rows and panels shared by several dashboards. */
// State-timeline rows: query from lookback_from, selector clipped to the range start (LEFT-EDGE).
function stateRow(name, filter, {expected = 1, stale = STALE_SECONDS, aligner, period} = {}) {
  return {name, datasource: DS.gcp, url: monitoringUrl(filter, {aligner, period, start: LOOKBACK_FROM}),
    selector: rowSelector(stateSelector(expected, stale), stale)};
}
function healthRow(name, component, expected) {
  const list = Array.isArray(component) ? component : [component];
  return stateRow(name, customFilter('health', {component: list.length > 1 ? list : list[0]}), {expected: expected || list.length});
}
function workerRow(name, component, field) {
  return stateRow(name, customFilter('worker_timing', {component, field}));
}
function probeRow(name, component) {
  return stateRow(name, customFilter('metabase_probe', {component, field: 'status'}));
}
// Singapore checker only (owner decision); raw 5-minute points, Unknown after 12 minutes.
function webhookRow(name = 'Webhook · Singapore') {
  return stateRow(name, 'metric.type = "monitoring.googleapis.com/uptime_check/check_passed" AND metric.labels.check_id = "' +
    WEBHOOK_CHECK_ID + '" AND metric.labels.checker_location = "' + UPTIME_SINGAPORE_LOCATION + '"', {stale: ALIGNED_STALE_SECONDS});
}
function sqlUpRow(name = 'Cloud SQL') {
  return stateRow(name, sqlFilter('cloudsql.googleapis.com/database/up'), {stale: ALIGNED_STALE_SECONDS, aligner: 'ALIGN_MAX', period: '300s'});
}
function schedulerFilter(env, job) {
  return 'metric.type = "' + SCHEDULER_ATTEMPT_METRIC + env + '" AND resource.labels.job_id = "mw-credit-app-' + env + '-' + job + '"';
}
function schedulerSelector(hold = 0) {
  return jq('scheduler-attempts.jq', {STATUS_LABEL: SCHEDULER_STATUS_LABEL, HTTP_LABEL: SCHEDULER_HTTP_LABEL, PERIOD: '300', HOLD: String(hold)});
}
// TIMELINE-GAP: a job's last attempt holds until its next expected run (hold: every minute 120 s, hourly
// 3 900 s, daily 90 000 s), then the row is an empty gap. A bucket carries in while its bucket plus hold covers
// the range start, so hourly and daily rows read from lookback_hour or lookback_day.
const SCHEDULER_HOLD = {minute: 120, hourly: 3900, daily: 90000};
function schedulerRow(name, env, job, every = 'minute') {
  const hold = SCHEDULER_HOLD[every];
  const lookback = hold <= 600 ? 'lookback_from' : hold <= 4200 ? 'lookback_hour' : 'lookback_day';
  if (300 + hold + 300 > LOOKBACKS[lookback]) throw Error('Lookback too short for ' + job);
  return {name, datasource: DS.gcp, url: monitoringUrl(schedulerFilter(env, job), {aligner: 'ALIGN_SUM', period: '300s', start: '${' + lookback + '}'}),
    selector: rowSelector(schedulerSelector(hold), 300 + hold)};
}
// Provider and model of a collector component as one text value (provider-model.jq): "Gemini · gemini-3.5-flash-lite".
function providerModelTarget(refId, component) {
  return target(refId, DS.gcp, monitoringUrl(customFilter('worker_timing', {component})), jq('provider-model.jq'), [col('Provider', 'Provider', 'string')]);
}
// READ-1: provider and model as one text tile (long ids at the text-tile size; the title names the component).
function modelTile({id, title, gridPos, component, description}) {
  return stat({id, title, gridPos, description, targets: [providerModelTarget('A', component)],
    defaults: {mappings: [nullMap('No report')], noValue: 'No report', color: {mode: 'fixed', fixedColor: COLOR.info}},
    options: {reduceOptions: {calcs: ['last'], fields: namedFields(['Provider']), values: false}, textMode: 'value', colorMode: 'none', text: TEXT_TILE}});
}
// A stat that shows text fields too: the named fields only (the default shows numeric fields only).
function namedFields(names) {
  return '/^(' + names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')$/';
}

// Owner decision (R089 follow-up): Railway (hosts Metabase and the reports) replaces OpenAI, which is no longer required.
const STATUS_MAP = [[0, 'Outage', COLOR.down], [1, 'No incident', COLOR.ok], [2, 'Incident open', COLOR.degraded], [3, 'Maintenance', COLOR.degraded], [4, 'Feed unreadable', COLOR.unknown]];
function providerStatus({id, gridPos, title = 'Provider status'}) {
  return stat({id, title, gridPos, datasource: DS.mixed,
    description: 'Current public status only, no history: Railway (railway.instatus.com, hosts Metabase and the reports: Outage for a major-outage incident, Incident open, Maintenance in progress) and Google Cloud (status.cloud.google.com, open incidents for Cloud Run, Cloud SQL, Vertex AI, Cloud Scheduler, Cloud Monitoring or Firebase Hosting in asia-southeast1 or global).',
    targets: [
      target('A', DS.publicStatus, 'https://railway.instatus.com/summary.json', jq('railway-status.jq'), [col('status', 'Railway')]),
      target('B', DS.gcpStatus, 'https://status.cloud.google.com/incidents.json', jq('gcp-status.jq'), [col('status', 'Google Cloud')])
    ],
    defaults: {mappings: valueMap(STATUS_MAP, 'Feed unreadable'), noValue: 'Feed unreadable', color: {mode: 'fixed', fixedColor: COLOR.unknown}},
    overrides: [byRef('A', {displayName: 'Railway'}), byRef('B', {displayName: 'Google Cloud'})],
    options: {reduceOptions: {calcs: ['lastNotNull'], fields: '', values: false}, text: {titleSize: 12, valueSize: 18}}});
}

module.exports = {
  OLD_DASHBOARD_LINK, MONITORING_DIR, REPO_ROOT, DASHBOARD_DIR, PROJECT, INSTANCE_ID, SQL_INSTANCE, SQL_DATABASE_ID, WEBHOOK_CHECK_ID,
  UPTIME_SINGAPORE_LOCATION, SCHEDULER_ATTEMPT_METRIC, SCHEDULER_STATUS_LABEL, SCHEDULER_HTTP_LABEL,
  NUM_BACKENDS_DATABASE_LABEL, ALERT_FOLDER_UID, LOG_METRIC, STALE_SECONDS, ALIGNED_STALE_SECONDS, DASHBOARD_UIDS,
  DASHBOARD_TITLES, DS, ALLOWED_DATASOURCE_UIDS, ALLOWED_URL_HOSTS, FROM, TO, CHART_PERIOD, COLOR, STATE_TEXT,
  stateMappings, valueMap, nullMap, steps, encodeFilter, monitoringUrl, customFilter, sqlFilter, labelClause, col, target,
  inlineTarget, jq, receiptFields, stateSelector, rowSelector, stateRow, lookbackVariable, LOOKBACK_FROM, LOOKBACK_SECONDS, RANGE_START, canonical, findPanel, lift, liftTarget, nameQueries, queryName, joinsFrames, PERF, COST, PWA_PLATFORM,
  numericSelector, pos, linkBar, dashboard, stateTimeline, stat, statOptions, byName, byRef, AGE, timeseries,
  timeseriesDefaults, dashedLine, table, row, text, sortKeys, serialize, healthRow, workerRow, probeRow, webhookRow, sqlUpRow,
  schedulerFilter, schedulerSelector, schedulerRow, providerStatus, NEUTRAL, problemColor, ageColor, codedMappings, POLICY, providerModelTarget, modelTile, namedFields, SINGLE_VALUE, STAT_TEXT, TEXT_TILE,
  LOOKBACKS, SCHEDULER_HOLD, readable
};
