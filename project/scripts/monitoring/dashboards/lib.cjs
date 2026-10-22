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
  openai: {type: INFINITY, uid: 'cfz10a9eaokjkd'},
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
  'backboard.railway.com', 'status.openai.com', 'api.frankfurter.dev', 'status.cloud.google.com',
  'billingbudgets.googleapis.com'
];

const FROM = '${__timeFrom:date:iso}';
/* LEFT-EDGE: state-timeline rows read from 20 minutes before the range start (one 300 s alignment period
 * plus 15 minutes), so the state at the start is known; range-start.jq then carries it to exactly the start.
 * Grafana has no time arithmetic in URLs, so the hidden variable lookback_from computes the start in jq
 * from ${__from} and refreshes on every time range change (and so on every auto refresh). */
const LOOKBACK_SECONDS = 1200;
const LOOKBACK_FROM = '${lookback_from}';
const RANGE_START = '(${__from} / 1000 | ceil)';
const TO = '${__timeTo:date:iso}';
const CHART_PERIOD = '$__customInterval(2d,300s,14d,3600s,86400s)';
const MONITORING_BASE = 'https://monitoring.googleapis.com/v3/projects/' + PROJECT + '/timeSeries';

// Grafana named colours (CVD review): Down dark-red, OK green, Degraded orange,
// Paused blue, Unknown fixed grey.
// info: informational values carry no state colour (blue means Paused); transparent keeps the theme text.
const COLOR = {down: 'dark-red', ok: 'green', degraded: 'orange', paused: 'blue', unknown: '#6E7079', purple: 'purple', info: 'transparent', text: 'text'};
const STATE_TEXT = ['Down', 'OK', 'Degraded', 'Paused', 'Unknown'];
const STATE_COLORS = [COLOR.down, COLOR.ok, COLOR.degraded, COLOR.paused, COLOR.unknown];

function stateMappings(texts = STATE_TEXT, nullText = 'Unknown') {
  return [
    {type: 'value', options: Object.fromEntries(texts.map((text, i) => [String(i), {text, color: STATE_COLORS[i], index: i}]))},
    {type: 'special', options: {match: 'null', result: {text: nullText, color: COLOR.unknown, index: 5}}}
  ];
}
function valueMap(entries, nullText) {
  const m = [{type: 'value', options: Object.fromEntries(entries.map(([v, text, color], i) => [String(v), {text, color, index: i}]))}];
  if (nullText) m.push({type: 'special', options: {match: 'null', result: {text: nullText, color: COLOR.unknown, index: entries.length}}});
  return m;
}
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
function lookbackVariable() {
  return {current: {}, datasource: DS.gcp, definition: 'range start - ' + LOOKBACK_SECONDS / 60 + ' min', hide: 2, includeAll: false,
    label: 'State query start', multi: false, name: 'lookback_from', options: [],
    query: {infinityQuery: {columns: [col('value', 'value', 'string')], data: '{}', format: 'table', parser: 'jq-backend', refId: 'variable',
      root_selector: '{value: ((${__from} / 1000 | floor) - ' + LOOKBACK_SECONDS + ' | todateiso8601)}', source: 'inline', type: 'json', url: '',
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
  return {id: newId, gridPos, ...(title !== undefined ? {title} : {}), ...panel};
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

// Five explicit links in a fixed order (Echo LINK-1..3): no tag query, no time or variables carried.
function linkBar() {
  return DASHBOARD_UIDS.map(uid => ({asDropdown: false, icon: 'dashboard', includeVars: false, keepTime: false,
    tags: [], targetBlank: false, title: DASHBOARD_TITLES[uid], tooltip: '', type: 'link', url: '/d/' + uid}));
}

function dashboard({uid, title, description, time, refresh, panels, templating = [], timepicker}) {
  if (JSON.stringify(panels).includes(LOOKBACK_FROM)) templating = [...templating, lookbackVariable()];
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
      links: linkBar(),
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
function stateTimeline({id, title, description, gridPos, rows, noValue = 'No report'}) {
  return {
    id, type: 'state-timeline', title, description, gridPos,
    datasource: rows.every(r => r.datasource === rows[0].datasource) ? rows[0].datasource : DS.mixed,
    targets: rows.map((r, i) => target(String.fromCharCode(65 + i), r.datasource, r.url, r.selector,
      [col('time', 'Time', 'timestamp'), col('value', r.name)], {format: 'timeseries'})),
    fieldConfig: {
      // Fixed grey base: the value mappings supply colour and word (thresholds colour hides them with mergeValues).
      defaults: {color: {mode: 'fixed', fixedColor: COLOR.unknown}, displayName: '${__field.name}', custom: {fillOpacity: 80, hideFrom: {legend: false, tooltip: false, viz: false},
        insertNulls: false, lineWidth: 0, spanNulls: false}, mappings: stateMappings(), noValue,
        thresholds: steps([null, COLOR.unknown])},
      overrides: rows.map((r, i) => ({matcher: {id: 'byFrameRefID', options: String.fromCharCode(65 + i)},
        properties: [{id: 'displayName', value: r.name}]}))
    },
    options: {alignValue: 'left', legend: {displayMode: 'list', placement: 'bottom', showLegend: false},
      mergeValues: true, rowHeight: 0.8, showValue: 'auto', tooltip: {hideZeros: false, mode: 'single', sort: 'none'}}
  };
}
function statOptions(extra = {}) {
  return {colorMode: 'background', graphMode: 'none', justifyMode: 'center', orientation: 'auto',
    percentChangeColorMode: 'standard', reduceOptions: {calcs: ['lastNotNull'], fields: '', values: false},
    showPercentChange: false, text: {titleSize: 12, valueSize: 24}, textMode: 'value_and_name', wideLayout: true, ...extra};
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
function schedulerSelector() {
  return jq('scheduler-attempts.jq', {STATUS_LABEL: SCHEDULER_STATUS_LABEL, HTTP_LABEL: SCHEDULER_HTTP_LABEL, PERIOD: '300'});
}
// A bucket event carries in only while its 300 s bucket covers the range start (later events end it).
function schedulerRow(name, env, job) {
  return {name, datasource: DS.gcp, url: monitoringUrl(schedulerFilter(env, job), {aligner: 'ALIGN_SUM', period: '300s', start: LOOKBACK_FROM}),
    selector: rowSelector(schedulerSelector(), 300)};
}
// Worst of ChatGPT and Codex from the unchanged openai-status.jq (today's panels 54 and 55).
function openAiWorstSelector() {
  return '[\n' + jq('openai-status.jq') + '] as $r |\n{name: "OpenAI", status: ([$r[].status] as $s | if any($s[]; . == 0) then 0 elif any($s[]; . == 4) or ($s | length) == 0 then 4 elif any($s[]; . == 2) then 2 else 1 end), details: ([$r[].details] | join("\\n\\n"))}';
}
function providerStatus({id, gridPos}) {
  const openai = liftTarget(PERF, 54);
  return stat({id, title: 'Provider status', gridPos, datasource: DS.mixed,
    description: 'Current public status only, no history: OpenAI (worst of ChatGPT and Codex, status.openai.com) and Google Cloud (status.cloud.google.com, open incidents for Cloud Run, Cloud SQL, Vertex AI, Cloud Scheduler, Cloud Monitoring or Firebase Hosting in asia-southeast1 or global).',
    targets: [
      target('A', DS.openai, openai.url, openAiWorstSelector(), [col('status', 'OpenAI')]),
      target('B', DS.gcpStatus, 'https://status.cloud.google.com/incidents.json', jq('gcp-status.jq'), [col('status', 'Google Cloud')])
    ],
    defaults: {mappings: valueMap([[0, 'Outage', COLOR.down], [1, 'No incident', COLOR.ok], [2, 'Incident open', COLOR.degraded], [4, 'Feed unreadable', COLOR.unknown]], 'Feed unreadable'),
      noValue: 'Feed unreadable', color: {mode: 'fixed', fixedColor: COLOR.unknown}},
    overrides: [byRef('A', {displayName: 'OpenAI'}), byRef('B', {displayName: 'Google Cloud'})],
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
  schedulerFilter, schedulerSelector, schedulerRow, openAiWorstSelector, providerStatus
};
